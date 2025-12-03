<?php

namespace App\Controller;

use App\Database;
use App\Model\Student;
use App\Model\Activity;
use App\Model\Attendance;
use App\Model\Settings;
use Exception;


// Handles API requests basically
class ApiController {
    private $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function handle(string $action) {
        header('Content-Type: application/json; charset=utf-8');
        try {
            switch ($action) {
                case 'get_state':
                    echo json_encode([
                        'students' => Student::getAll($this->db),
                        'activities' => Activity::getAll($this->db),
                        'settings' => Settings::getAllKeyPair($this->db)
                    ]);
                    break;
                case 'get_students':
                    echo json_encode(['students' => Student::getAll($this->db)]);
                    break;
                case 'create_student':
                    $name = trim($_POST['name'] ?? '');
                    if ($name === '') { throw new Exception('Name required'); }
                    $id = Student::create($this->db, $name);
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_student':
                    $id = intval($_POST['id'] ?? 0);
                    $name = trim($_POST['name'] ?? '');
                    if (!$id) { throw new Exception('ID required'); }
                    if ($name === '') { throw new Exception('Name required'); }
                    Student::update($this->db, $id, $name);
                    echo json_encode(['ok' => true]);
                    break;
                case 'delete_student':
                    $id = intval($_POST['id'] ?? 0);
                    if (!$id) { throw new Exception('ID required'); }
                    Student::delete($this->db, $id);
                    echo json_encode(['ok' => true]);
                    break;
                case 'get_activities':
                    echo json_encode(['activities' => Activity::getAll($this->db)]);
                    break;
                case 'create_activity':
                    $name = trim($_POST['name'] ?? '');
                    $description = trim($_POST['description'] ?? '');
                    $sessions = intval($_POST['sessions_per_week'] ?? 1);
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];
                    
                    if ($name === '') { throw new Exception('Name required'); }
                    if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }
                    $id = Activity::create($this->db, $name, $description, $sessions, $studentIds);
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_activity':
                    $id = intval($_POST['id'] ?? 0);
                    $name = trim($_POST['name'] ?? '');
                    $description = trim($_POST['description'] ?? '');
                    $sessions = intval($_POST['sessions_per_week'] ?? 1);
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];

                    if (!$id) { throw new Exception('ID required'); }
                    if ($name === '') { throw new Exception('Name required'); }
                    if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }
                    Activity::update($this->db, $id, $name, $description, $sessions, $studentIds);
                    echo json_encode(['ok' => true]);
                    break;
                case 'delete_activity':
                    $id = intval($_POST['id'] ?? 0);
                    if (!$id) { throw new Exception('ID required'); }
                    Activity::delete($this->db, $id);
                    echo json_encode(['ok' => true]);
                    break;
                case 'get_attendance':
                    $activity_id = intval($_GET['activity_id'] ?? 0);
                    $week_start = $_GET['week_start'] ?? date('Y-m-d', strtotime('monday this week'));
                    if (!$activity_id) throw new Exception('activity_id required');
                    echo json_encode(['attendance' => Attendance::getForActivity($this->db, $activity_id, $week_start)]);
                    break;
                case 'get_stats':
                    echo json_encode(['stats' => Attendance::getGlobalStats($this->db)]);
                    break;
                case 'get_student_stats':
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getStudentStats($this->db, $id)]);
                    break;
                case 'get_activity_stats':
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getActivityStats($this->db, $id)]);
                    break;
                case 'toggle_attendance':
                    $student_id = intval($_POST['student_id'] ?? 0);
                    $activity_id = intval($_POST['activity_id'] ?? 0);
                    $week_start = $_POST['week_start'] ?? null;
                    $session_index = intval($_POST['session_index'] ?? 1);
                    $present = intval($_POST['present'] ?? 0) ? 1 : 0;
                    if (!$student_id || !$activity_id || !$week_start) throw new Exception('Missing params');
                    Attendance::toggle($this->db, $student_id, $activity_id, $week_start, $session_index, $present);
                    echo json_encode(['ok' => true]);
                    break;
                case 'save_setting':
                    $k = $_POST['k'] ?? null; $v = $_POST['v'] ?? null;
                    if (!$k) throw new Exception('key required');
                    Settings::save($this->db, $k, $v);
                    echo json_encode(['ok' => true]);
                    break;
                case 'get_settings':
                    echo json_encode(['settings' => Settings::getAll($this->db)]);
                    break;
                default:
                    throw new Exception('Unknown action');
            }
        } catch (Exception $e) {
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
}
