<?php

namespace App\Model;

use PDO;

class Attendance {
    private static function source(PDO $db, string $scope): string {
        if (!in_array($scope, ['normal', 'whole_school', 'event'], true)) throw new \InvalidArgumentException('Invalid scope');
        if ($scope === 'event') return "(SELECT e.student_id,e.event_id AS activity_id,a.event_date AS week_start,1 AS session_index,e.present,p.name AS student_name,p.year_group FROM event_attendance e JOIN activities a ON a.id=e.event_id JOIN event_participants p ON p.event_id=e.event_id AND p.student_id=e.student_id WHERE a.scope='event')";
        $students = $scope === 'whole_school' ? 'archived_students' : 'students';
        return '(SELECT records.*,s.name AS student_name,s.year_group FROM attendance records JOIN activities scoped ON scoped.id = records.activity_id JOIN ' . $students . ' s ON s.id=records.student_id WHERE scoped.scope = ' . $db->quote($scope) . ')';
    }

    public static function getForActivity(PDO $db, int $activityId, string $weekStart, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        $stmt = $db->prepare("SELECT student_id, session_index, present FROM {$source} attendance WHERE activity_id = :activity AND week_start = :week_start");
        $stmt->execute([':activity' => $activityId, ':week_start' => $weekStart]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[intval($r['student_id'])][intval($r['session_index'])] = intval($r['present']);
        }
        return $out;
    }

    public static function toggle(PDO $db, int $studentId, int $activityId, string $weekStart, int $sessionIndex, int $present): void {
        $sql = "INSERT INTO attendance (student_id, activity_id, week_start, session_index, present)
            VALUES (:student, :activity, :week_start, :session_index, :present)
            ON DUPLICATE KEY UPDATE present = :present2";

        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':student' => $studentId,
            ':activity' => $activityId,
            ':week_start' => $weekStart,
            ':session_index' => $sessionIndex,
            ':present' => $present,
            ':present2' => $present,
        ]);
    }

    public static function getGlobalStats(PDO $db, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        // Total present per student
        $stmt = $db->query("SELECT student_id, COUNT(*) as count FROM {$source} attendance WHERE present = 1 GROUP BY student_id");
        $studentStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Total present per activity
        $stmt = $db->query("SELECT activity_id, COUNT(*) as count FROM {$source} attendance WHERE present = 1 GROUP BY activity_id");
        $activityStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Total present per year group
        $stmt = $db->query("
            SELECT att.year_group, COUNT(*) as count
            FROM {$source} att
            WHERE att.present = 1 
            GROUP BY att.year_group
        ");
        $yearGroupStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Total present per department
        $stmt = $db->query("
            SELECT a.department, COUNT(*) as count 
            FROM {$source} att
            JOIN activities a ON att.activity_id = a.id
            WHERE att.present = 1 
            GROUP BY a.department
        ");
        $rawDeptStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        // Process comma-separated departments
        $departmentStats = [];
        foreach ($rawDeptStats as $depts => $count) {
            $list = explode(',', $depts);
            foreach ($list as $d) {
                $d = trim($d);
                if (!$d) continue;
                if (!isset($departmentStats[$d])) $departmentStats[$d] = 0;
                $departmentStats[$d] += $count;
            }
        }

        // Attendance over time (by week)
        $stmt = $db->query("SELECT week_start, COUNT(*) as count FROM {$source} attendance WHERE present = 1 GROUP BY week_start ORDER BY week_start");
        $weeklyStats = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'students' => $studentStats,
            'activities' => $activityStats,
            'year_groups' => $yearGroupStats,
            'departments' => $departmentStats,
            'weekly' => $weeklyStats
        ];
    }

    public static function getStudentStats(PDO $db, int $studentId, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        // Total sessions attended
        $stmt = $db->prepare("SELECT COUNT(*) FROM {$source} attendance WHERE student_id = :sid AND present = 1");
        $stmt->execute([':sid' => $studentId]);
        $total = $stmt->fetchColumn();

        // Breakdown by activity
        $stmt = $db->prepare("
            SELECT a.name, COUNT(*) as count 
            FROM {$source} att
            JOIN activities a ON att.activity_id = a.id
            WHERE att.student_id = :sid AND att.present = 1
            GROUP BY a.name
        ");
        $stmt->execute([':sid' => $studentId]);
        $byActivity = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // History (Date, Activity, Session)
        $stmt = $db->prepare("
            SELECT att.week_start, att.week_start AS date, a.name as activity_name, att.session_index
            FROM {$source} att
            JOIN activities a ON att.activity_id = a.id
            WHERE att.student_id = :sid AND att.present = 1
            ORDER BY att.week_start DESC, att.session_index ASC
        ");
        $stmt->execute([':sid' => $studentId]);
        $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['total' => $total, 'by_activity' => $byActivity, 'history' => $history];
    }

    public static function getActivityStats(PDO $db, int $activityId, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        // Total attendance count
        $stmt = $db->prepare("SELECT COUNT(*) FROM {$source} attendance WHERE activity_id = :aid AND present = 1");
        $stmt->execute([':aid' => $activityId]);
        $total = $stmt->fetchColumn();

        // Breakdown by student
        $stmt = $db->prepare("
            SELECT att.student_name, COUNT(*) as count
            FROM {$source} att
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY att.student_name
            ORDER BY count DESC
        ");
        $stmt->execute([':aid' => $activityId]);
        $byStudent = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Weekly trend
        $stmt = $db->prepare("
            SELECT week_start, COUNT(*) as count 
            FROM {$source} att
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY week_start
            ORDER BY week_start
        ");
        $stmt->execute([':aid' => $activityId]);
        $weekly = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['total' => $total, 'by_student' => $byStudent, 'weekly' => $weekly];
    }

    public static function getActivityExportData(PDO $db, int $activityId, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        $sql = "
            SELECT 
                att.student_name as student_name,
                att.student_id,
                att.week_start,
                COUNT(*) as count
            FROM {$source} att
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY att.student_id, att.student_name, att.week_start
            ORDER BY att.student_name, att.week_start
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([':aid' => $activityId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function getYearGroupExportData(PDO $db, int $yearGroup, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        $sql = "
            SELECT 
                att.student_name as student_name,
                att.student_id,
                att.week_start,
                COUNT(*) as count
            FROM {$source} att
            WHERE att.year_group = :yg AND att.present = 1
            GROUP BY att.student_id, att.student_name, att.week_start
            ORDER BY att.student_name, att.week_start
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([':yg' => $yearGroup]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function getDepartmentExportData(PDO $db, string $department, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        $sql = "
            SELECT 
                att.student_name as student_name,
                att.student_id,
                att.week_start,
                COUNT(*) as count
            FROM {$source} att
            JOIN activities a ON att.activity_id = a.id
            WHERE FIND_IN_SET(:dept, a.department) > 0 AND att.present = 1
            GROUP BY att.student_id, att.student_name, att.week_start
            ORDER BY att.student_name, att.week_start
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([':dept' => $department]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function getExportData(PDO $db, string $scope = 'normal'): array {
        $source = self::source($db, $scope);
        // Get per-week stats per student
        $sql = "
            SELECT 
                att.student_id as student_id,
                att.student_name as student_name,
                att.week_start,
                SUM(CASE WHEN att.present = 1 THEN 1 ELSE 0 END) as attended,
                SUM(CASE WHEN att.present = 0 THEN 1 ELSE 0 END) as missed
            FROM {$source} att
            GROUP BY att.student_id, att.student_name, att.week_start
            ORDER BY att.student_name, att.week_start
        ";
        $stmt = $db->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Get total stats per student
        $sqlTotal = "
            SELECT 
                student_id,
                SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) as total_attended
            FROM {$source} attendance
            GROUP BY student_id
        ";
        $stmtTotal = $db->query($sqlTotal);
        $totals = $stmtTotal->fetchAll(PDO::FETCH_KEY_PAIR);

        // Merge totals into rows
        foreach ($rows as &$row) {
            $row['total_attended_all_time'] = $totals[$row['student_id']] ?? 0;
        }

        return $rows;
    }
}
