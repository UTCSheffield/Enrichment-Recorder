<?php

namespace App\Model;

use PDO;

class Attendance {
    public static function getForActivity(PDO $db, int $activityId, string $weekStart): array {
        $stmt = $db->prepare('SELECT student_id, session_index, present FROM attendance WHERE activity_id = :activity AND week_start = :week_start');
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

    public static function getGlobalStats(PDO $db): array {
        // Total present per student
        $stmt = $db->query("SELECT student_id, COUNT(*) as count FROM attendance WHERE present = 1 GROUP BY student_id");
        $studentStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Total present per activity
        $stmt = $db->query("SELECT activity_id, COUNT(*) as count FROM attendance WHERE present = 1 GROUP BY activity_id");
        $activityStats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Attendance over time (by week)
        $stmt = $db->query("SELECT week_start, COUNT(*) as count FROM attendance WHERE present = 1 GROUP BY week_start ORDER BY week_start");
        $weeklyStats = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'students' => $studentStats,
            'activities' => $activityStats,
            'weekly' => $weeklyStats
        ];
    }

    public static function getStudentStats(PDO $db, int $studentId): array {
        // Total sessions attended
        $stmt = $db->prepare("SELECT COUNT(*) FROM attendance WHERE student_id = :sid AND present = 1");
        $stmt->execute([':sid' => $studentId]);
        $total = $stmt->fetchColumn();

        // Breakdown by activity
        $stmt = $db->prepare("
            SELECT a.name, COUNT(*) as count 
            FROM attendance att
            JOIN activities a ON att.activity_id = a.id
            WHERE att.student_id = :sid AND att.present = 1
            GROUP BY a.name
        ");
        $stmt->execute([':sid' => $studentId]);
        $byActivity = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // History (Date, Activity, Session)
        $stmt = $db->prepare("
            SELECT att.week_start, a.name as activity_name, att.session_index
            FROM attendance att
            JOIN activities a ON att.activity_id = a.id
            WHERE att.student_id = :sid AND att.present = 1
            ORDER BY att.week_start DESC, att.session_index ASC
        ");
        $stmt->execute([':sid' => $studentId]);
        $history = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['total' => $total, 'by_activity' => $byActivity, 'history' => $history];
    }

    public static function getActivityStats(PDO $db, int $activityId): array {
        // Total attendance count
        $stmt = $db->prepare("SELECT COUNT(*) FROM attendance WHERE activity_id = :aid AND present = 1");
        $stmt->execute([':aid' => $activityId]);
        $total = $stmt->fetchColumn();

        // Breakdown by student
        $stmt = $db->prepare("
            SELECT s.name, COUNT(*) as count 
            FROM attendance att
            JOIN students s ON att.student_id = s.id
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY s.name
            ORDER BY count DESC
        ");
        $stmt->execute([':aid' => $activityId]);
        $byStudent = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Weekly trend
        $stmt = $db->prepare("
            SELECT week_start, COUNT(*) as count 
            FROM attendance att
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY week_start
            ORDER BY week_start
        ");
        $stmt->execute([':aid' => $activityId]);
        $weekly = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return ['total' => $total, 'by_student' => $byStudent, 'weekly' => $weekly];
    }

    public static function getActivityExportData(PDO $db, int $activityId): array {
        $sql = "
            SELECT 
                s.name as student_name,
                att.week_start,
                COUNT(*) as count
            FROM attendance att
            JOIN students s ON att.student_id = s.id
            WHERE att.activity_id = :aid AND att.present = 1
            GROUP BY s.name, att.week_start
            ORDER BY s.name, att.week_start
        ";
        $stmt = $db->prepare($sql);
        $stmt->execute([':aid' => $activityId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public static function getExportData(PDO $db): array {
        // Get per-week stats per student
        $sql = "
            SELECT 
                s.id as student_id,
                s.name as student_name,
                att.week_start,
                SUM(CASE WHEN att.present = 1 THEN 1 ELSE 0 END) as attended,
                SUM(CASE WHEN att.present = 0 THEN 1 ELSE 0 END) as missed
            FROM attendance att
            JOIN students s ON att.student_id = s.id
            GROUP BY s.id, att.week_start
            ORDER BY s.name, att.week_start
        ";
        $stmt = $db->query($sql);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Get total stats per student
        $sqlTotal = "
            SELECT 
                student_id,
                SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) as total_attended
            FROM attendance
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
