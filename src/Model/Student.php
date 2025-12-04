<?php

namespace App\Model;

use PDO;

// Handle each student record
class Student {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT id, name, year_group FROM students ORDER BY name');
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function create(PDO $db, string $name, int $yearGroup = 9): int {
        $stmt = $db->prepare('INSERT INTO students (name, year_group) VALUES (:name, :year_group)');
        $stmt->execute([':name' => $name, ':year_group' => $yearGroup]);
        return (int)$db->lastInsertId();
    }

    public static function update(PDO $db, int $id, string $name, int $yearGroup): void {
        $stmt = $db->prepare('UPDATE students SET name = :name, year_group = :year_group WHERE id = :id');
        $stmt->execute([':name' => $name, ':year_group' => $yearGroup, ':id' => $id]);
    }

    public static function delete(PDO $db, int $id): void {
        $stmt = $db->prepare('DELETE FROM students WHERE id = :id');
        $stmt->execute([':id' => $id]);
        // Also clean up attendance
        $stmt = $db->prepare('DELETE FROM attendance WHERE student_id = :id');
        $stmt->execute([':id' => $id]);
    }

    public static function deleteMany(PDO $db, array $ids): void {
        if (empty($ids)) return;
        $inQuery = implode(',', array_fill(0, count($ids), '?'));
        
        $stmt = $db->prepare("DELETE FROM students WHERE id IN ($inQuery)");
        $stmt->execute($ids);
        
        $stmt = $db->prepare("DELETE FROM attendance WHERE student_id IN ($inQuery)");
        $stmt->execute($ids);
        
        $stmt = $db->prepare("DELETE FROM activity_students WHERE student_id IN ($inQuery)");
        $stmt->execute($ids);
    }
}
