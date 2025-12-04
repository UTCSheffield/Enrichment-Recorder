<?php

namespace App\Model;

use PDO;

class Activity {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT id, name, description, department, sessions_per_week FROM activities ORDER BY name');
        $activities = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Fetch associations
        $stmt = $db->query('SELECT activity_id, student_id FROM activity_students');
        $associations = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $map = [];
        foreach ($associations as $a) {
            $map[$a['activity_id']][] = (int)$a['student_id'];
        }
        
        foreach ($activities as &$act) {
            $act['student_ids'] = $map[$act['id']] ?? [];
        }
        
        return $activities;
    }

    public static function create(PDO $db, string $name, string $description, string $department, int $sessions, array $studentIds = []): int {
        $stmt = $db->prepare('INSERT INTO activities (name, description, department, sessions_per_week) VALUES (:name, :description, :department, :sessions)');
        $stmt->execute([':name' => $name, ':description' => $description, ':department' => $department, ':sessions' => $sessions]);
        $id = (int)$db->lastInsertId();
        
        if (!empty($studentIds)) {
            $insert = $db->prepare('INSERT INTO activity_students (activity_id, student_id) VALUES (:aid, :sid)');
            foreach ($studentIds as $sid) {
                $insert->execute([':aid' => $id, ':sid' => $sid]);
            }
        }
        
        return $id;
    }

    public static function update(PDO $db, int $id, string $name, string $description, string $department, int $sessions, array $studentIds): void {
        $stmt = $db->prepare('UPDATE activities SET name = :name, description = :description, department = :department, sessions_per_week = :sessions WHERE id = :id');
        $stmt->execute([':name' => $name, ':description' => $description, ':department' => $department, ':sessions' => $sessions, ':id' => $id]);
        
        // Update associations
        $db->prepare('DELETE FROM activity_students WHERE activity_id = :id')->execute([':id' => $id]);
        
        if (!empty($studentIds)) {
            $insert = $db->prepare('INSERT INTO activity_students (activity_id, student_id) VALUES (:aid, :sid)');
            foreach ($studentIds as $sid) {
                $insert->execute([':aid' => $id, ':sid' => $sid]);
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
