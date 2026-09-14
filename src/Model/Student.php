<?php

namespace App\Model;

use PDO;

// Handle each student record
class Student {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT id, name, year_group, pp, fsm_ever, gender, sen_status FROM students ORDER BY name');
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function characteristics(array $input, bool $csv = false): array {
        $result = [];
        foreach (['pp', 'fsm_ever', 'gender', 'sen_status'] as $field) {
            if (!array_key_exists($field, $input)) continue;
            $raw = $input[$field];
            if ($raw !== null && !is_scalar($raw)) throw new \InvalidArgumentException("Invalid $field value");
            $value = is_bool($raw) ? ($raw ? '1' : '0') : strtolower(trim((string)$raw));
            if ($field === 'sen_status' && $csv && $raw !== null && $value === '') {
                $result[$field] = 'none';
            } elseif ($raw === null || $value === '') {
                $result[$field] = null;
            } elseif ($field === 'pp' || $field === 'fsm_ever') {
                if (!in_array($value, ['t', 'f', '1', '0'], true)) throw new \InvalidArgumentException("$field must be T or F");
                $result[$field] = in_array($value, ['t', '1'], true) ? 1 : 0;
            } elseif ($field === 'gender') {
                if (!in_array($value, ['f', 'm', 'o'], true)) throw new \InvalidArgumentException('Gender must be F, M or O');
                $result[$field] = strtoupper($value);
            } else {
                if (in_array($value, ['none', 'no special educational need', 'no special educational needs'], true)) $result[$field] = 'none';
                elseif (in_array($value, ['sen', 'special educational need', 'special educational needs'], true)) $result[$field] = 'sen';
                else throw new \InvalidArgumentException('Unrecognised SEN status');
            }
        }
        return $result;
    }

    public static function create(PDO $db, string $name, int $yearGroup = 9, array $details = []): int {
        $details = self::characteristics($details);
        $stmt = $db->prepare('INSERT INTO students (name, year_group, pp, fsm_ever, gender, sen_status) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$name, $yearGroup, $details['pp'] ?? null, $details['fsm_ever'] ?? null, $details['gender'] ?? null, $details['sen_status'] ?? null]);
        return (int)$db->lastInsertId();
    }

    public static function update(PDO $db, int $id, string $name, int $yearGroup, array $details = []): void {
        $details = self::characteristics($details);
        $sets = ['name = ?', 'year_group = ?'];
        $values = [$name, $yearGroup];
        foreach ($details as $field => $value) { $sets[] = "$field = ?"; $values[] = $value; }
        $values[] = $id;
        $stmt = $db->prepare('UPDATE students SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $stmt->execute($values);
    }

    // Validate the complete batch before any inserts. Caller owns the transaction.
    public static function importRows(PDO $db, array $rows): int {
        if (!$rows || !array_is_list($rows)) throw new \InvalidArgumentException('A non-empty list of students is required');
        $validated = [];
        foreach ($rows as $index => $row) {
            $number = $index + 1;
            try {
                if (!is_array($row)) throw new \InvalidArgumentException('Invalid row');
                if (isset($row['row_number']) && is_numeric($row['row_number'])) $number = (int)$row['row_number'];
                if (!isset($row['name']) || !is_string($row['name']) || trim($row['name']) === '') throw new \InvalidArgumentException('Name required');
                if (strlen($row['name']) > 255) throw new \InvalidArgumentException('Name is too long');
                if (!isset($row['year_group']) || !is_scalar($row['year_group']) || !preg_match('/^(?:y(?:ear)?\s*)?(9|10|11|12|13)$/i', trim((string)$row['year_group']), $match)) throw new \InvalidArgumentException('Year group must be 9–13');
                $validated[] = [trim($row['name']), (int)$match[1], self::characteristics($row, true)];
            } catch (\InvalidArgumentException $e) {
                throw new \InvalidArgumentException("Row $number: " . $e->getMessage());
            }
        }
        foreach ($validated as [$name, $year, $details]) self::create($db, $name, $year, $details);
        return count($validated);
    }

    public static function delete(PDO $db, int $id): void {
        $stmt = $db->prepare('DELETE FROM students WHERE id = :id');
        $stmt->execute([':id' => $id]);
        // Also clean up attendance
        $stmt = $db->prepare("DELETE att FROM attendance att JOIN activities a ON a.id=att.activity_id WHERE a.scope='normal' AND att.student_id = :id");
        $stmt->execute([':id' => $id]);
    }

    public static function deleteMany(PDO $db, array $ids): void {
        if (empty($ids)) return;
        $inQuery = implode(',', array_fill(0, count($ids), '?'));
        
        $stmt = $db->prepare("DELETE FROM students WHERE id IN ($inQuery)");
        $stmt->execute($ids);
        
        $stmt = $db->prepare("DELETE att FROM attendance att JOIN activities a ON a.id=att.activity_id WHERE a.scope='normal' AND att.student_id IN ($inQuery)");
        $stmt->execute($ids);
        
        $stmt = $db->prepare("DELETE m FROM activity_students m JOIN activities a ON a.id=m.activity_id WHERE a.scope='normal' AND m.student_id IN ($inQuery)");
        $stmt->execute($ids);
    }
}
