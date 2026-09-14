<?php
namespace App;

use PDO;
use InvalidArgumentException;

final class ActivityScope {
    public static function validate(string $scope): string {
        if (!in_array($scope, ['normal', 'whole_school', 'event'], true)) {
            throw new InvalidArgumentException('Invalid activity scope');
        }
        if ($scope !== 'normal') Auth::requireRole(['super_admin']);
        return $scope;
    }

    public static function activity(PDO $db, int $id): array {
        $stmt = $db->prepare('SELECT * FROM activities WHERE id = ?');
        $stmt->execute([$id]);
        $activity = $stmt->fetch();
        if (!$activity) throw new InvalidArgumentException('Activity not found');
        self::validate($activity['scope']);
        return $activity;
    }

    public static function years(PDO $db, int $id): array {
        $stmt = $db->prepare('SELECT year_group FROM activity_year_groups WHERE activity_id = ? ORDER BY year_group');
        $stmt->execute([$id]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    // Called inside the same serialized transaction as activity/student writes.
    public static function synchronize(PDO $db): void {
        \App\Model\Event::synchronize($db);
    }

    public static function configure(PDO $db, int $id, array $input, array $previous, array $studentIds): void {
        $scope = $previous['scope'];
        if (isset($input['scope']) && $input['scope'] !== $scope) throw new InvalidArgumentException('Activity scope cannot be changed');
        if ($scope !== 'whole_school') {
            if (!empty($input['year_groups']) || !empty($input['all_students_mandatory'])) throw new InvalidArgumentException('Whole-school options require a whole-school activity');
            return;
        }
        $years = isset($input['year_groups']) ? explode(',', (string)$input['year_groups']) : self::years($db, $id);
        if (!$years) throw new InvalidArgumentException('Select at least one year group');
        foreach ($years as $year) {
            if (!in_array((string)$year, ['9', '10', '11', '12', '13'], true)) throw new InvalidArgumentException('Year groups must be 9–13');
        }
        $years = array_values(array_unique(array_map('intval', $years)));
        $all = $input['all_students_mandatory'] ?? $previous['all_students_mandatory'];
        if (!in_array((string)$all, ['0', '1'], true)) throw new InvalidArgumentException('Invalid mandatory option');
        if (!$all && $studentIds) {
            $eligible = $db->query('SELECT id FROM students WHERE year_group IN (' . implode(',', $years) . ')')->fetchAll(PDO::FETCH_COLUMN);
            // Existing members made ineligible by a year-selection change are pruned by synchronize.
            $old = $db->prepare('SELECT student_id FROM activity_students WHERE activity_id = ?');
            $old->execute([$id]);
            $oldYears = self::years($db, $id);
            $changedYears = $oldYears !== $years;
            $allowed = (!empty($previous['new']) || !$changedYears) ? $eligible : array_merge($eligible, $old->fetchAll(PDO::FETCH_COLUMN));
            if (array_diff($studentIds, $allowed)) throw new InvalidArgumentException('Student is not in an eligible year group');
        }
        $db->prepare('UPDATE activities SET all_students_mandatory = ? WHERE id = ?')->execute([(int)$all, $id]);
        $db->prepare('DELETE FROM activity_year_groups WHERE activity_id = ?')->execute([$id]);
        $insert = $db->prepare('INSERT INTO activity_year_groups (activity_id, year_group) VALUES (?, ?)');
        foreach ($years as $year) $insert->execute([$id, $year]);
    }
}
