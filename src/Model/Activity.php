<?php

namespace App\Model;

use PDO;

class Activity {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT id, name, description, department, sessions_per_week, has_mandatory FROM activities ORDER BY name');
        $activities = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Fetch associations
        $stmt = $db->query('SELECT activity_id, student_id, mandatory, note FROM activity_students');
        $associations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $map = [];
        $meta = [];
        foreach ($associations as $a) {
            $map[$a['activity_id']][] = (int)$a['student_id'];

            if (!isset($meta[$a['activity_id']])) {
                $meta[$a['activity_id']] = [];
            }
            $sid = (int)$a['student_id'];
            $meta[$a['activity_id']][(string)$sid] = [
                'mandatory' => (int)($a['mandatory'] ?? 0),
                'note' => $a['note'] ?? ''
            ];
        }
        
        foreach ($activities as &$act) {
            $act['student_ids'] = $map[$act['id']] ?? [];
            $act['student_meta'] = $meta[$act['id']] ?? (object)[];
        }
        
        return $activities;
    }

    public static function create(PDO $db, string $name, string $description, string $department, int $sessions, array $studentIds = []): int {
        $stmt = $db->prepare('INSERT INTO activities (name, description, department, sessions_per_week, has_mandatory) VALUES (:name, :description, :department, :sessions, :has_mandatory)');
        $stmt->execute([':name' => $name, ':description' => $description, ':department' => $department, ':sessions' => $sessions, ':has_mandatory' => 1]);
        $id = (int)$db->lastInsertId();
        
        if (!empty($studentIds)) {
            $insert = $db->prepare('INSERT INTO activity_students (activity_id, student_id, mandatory, note) VALUES (:aid, :sid, 0, NULL)');
            foreach ($studentIds as $sid) {
                $insert->execute([':aid' => $id, ':sid' => $sid]);
            }
        }
        
        return $id;
    }

    public static function update(PDO $db, int $id, string $name, string $description, string $department, int $sessions, int $hasMandatory, array $studentIds): void {
        $stmt = $db->prepare('UPDATE activities SET name = :name, description = :description, department = :department, sessions_per_week = :sessions, has_mandatory = :has_mandatory WHERE id = :id');
        $stmt->execute([':name' => $name, ':description' => $description, ':department' => $department, ':sessions' => $sessions, ':has_mandatory' => $hasMandatory ? 1 : 0, ':id' => $id]);

        // Preserve existing metadata for students that remain assigned
        $existingMetaStmt = $db->prepare('SELECT student_id, mandatory, note FROM activity_students WHERE activity_id = :id');
        $existingMetaStmt->execute([':id' => $id]);
        $existingRows = $existingMetaStmt->fetchAll(PDO::FETCH_ASSOC);
        $existingMeta = [];
        foreach ($existingRows as $r) {
            $existingMeta[(int)$r['student_id']] = [
                'mandatory' => (int)($r['mandatory'] ?? 0),
                'note' => $r['note'] ?? null,
            ];
        }
        
        // Update associations
        $db->prepare('DELETE FROM activity_students WHERE activity_id = :id')->execute([':id' => $id]);
        
        if (!empty($studentIds)) {
            $insert = $db->prepare('INSERT INTO activity_students (activity_id, student_id, mandatory, note) VALUES (:aid, :sid, :mandatory, :note)');
            foreach ($studentIds as $sid) {
                $sid = (int)$sid;
                $meta = $existingMeta[$sid] ?? ['mandatory' => 0, 'note' => null];
                $insert->execute([
                    ':aid' => $id,
                    ':sid' => $sid,
                    ':mandatory' => (int)($meta['mandatory'] ?? 0),
                    ':note' => $meta['note'],
                ]);
            }
        }
    }

    public static function delete(PDO $db, int $id): void {
        $stmt = $db->prepare('DELETE FROM activities WHERE id = :id');
        $stmt->execute([':id' => $id]);
        // Also clean up attendance and associations
        $db->prepare('DELETE FROM attendance WHERE activity_id = :id')->execute([':id' => $id]);
        $db->prepare('DELETE FROM activity_students WHERE activity_id = :id')->execute([':id' => $id]);
    }
}
