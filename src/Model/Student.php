<?php

namespace App\Model;

use PDO;

// Handle each student record
class Student {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT id, name FROM students ORDER BY name');
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function create(PDO $db, string $name): int {
        $stmt = $db->prepare('INSERT INTO students (name) VALUES (:name)');
        $stmt->execute([':name' => $name]);
        return (int)$db->lastInsertId();
    }

    public static function update(PDO $db, int $id, string $name): void {
        $stmt = $db->prepare('UPDATE students SET name = :name WHERE id = :id');
        $stmt->execute([':name' => $name, ':id' => $id]);
    }

    public static function delete(PDO $db, int $id): void {
        $stmt = $db->prepare('DELETE FROM students WHERE id = :id');
        $stmt->execute([':id' => $id]);
        // Also clean up attendance
        $stmt = $db->prepare('DELETE FROM attendance WHERE student_id = :id');
        $stmt->execute([':id' => $id]);
    }
}
