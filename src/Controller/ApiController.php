<?php

namespace App\Controller;

use App\Database;
use App\Auth;
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

        $role = Auth::role();
        if ($role === null) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        try {
            switch ($action) {
                case 'get_state':
                    echo json_encode([
                        'students' => Student::getAll($this->db),
                        'activities' => Activity::getAll($this->db),
                        'settings' => ($role === 'admin') ? Settings::getAllKeyPair($this->db) : []
                    ]);
                    break;
                case 'get_students':
                    echo json_encode(['students' => Student::getAll($this->db)]);
                    break;
                case 'create_student':
                    Auth::requireRole(['admin']);
                    $name = trim($_POST['name'] ?? '');
                    $yearGroup = intval($_POST['year_group'] ?? 9);
                    if ($name === '') { throw new Exception('Name required'); }
                    $id = Student::create($this->db, $name, $yearGroup);
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_student':
                    Auth::requireRole(['admin']);
                    $id = intval($_POST['id'] ?? 0);
                    $name = trim($_POST['name'] ?? '');
                    $yearGroup = intval($_POST['year_group'] ?? 9);
                    if (!$id) { throw new Exception('ID required'); }
                    if ($name === '') { throw new Exception('Name required'); }
                    Student::update($this->db, $id, $name, $yearGroup);
                    echo json_encode(['ok' => true]);
                    break;
                case 'delete_student':
                    Auth::requireRole(['admin']);
                    $id = intval($_POST['id'] ?? 0);
                    if (!$id) { throw new Exception('ID required'); }
                    Student::delete($this->db, $id);
                    echo json_encode(['ok' => true]);
                    break;
                case 'delete_students':
                    Auth::requireRole(['admin']);
                    $ids_str = $_POST['ids'] ?? '';
                    $ids = $ids_str ? array_map('intval', explode(',', $ids_str)) : [];
                    if (empty($ids)) { throw new Exception('IDs required'); }
                    Student::deleteMany($this->db, $ids);
                    echo json_encode(['ok' => true]);
                    break;
                case 'get_activities':
                    echo json_encode(['activities' => Activity::getAll($this->db)]);
                    break;
                case 'create_activity':
                    Auth::requireRole(['admin', 'head']);
                    $name = trim($_POST['name'] ?? '');
                    $description = trim($_POST['description'] ?? '');
                    $department = trim($_POST['department'] ?? 'Other');
                    $sessions = intval($_POST['sessions_per_week'] ?? 1);
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];
                    
                    if ($name === '') { throw new Exception('Name required'); }
                    if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }
                    $id = Activity::create($this->db, $name, $description, $department, $sessions, $studentIds);
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_activity':
                    $id = intval($_POST['id'] ?? 0);
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];

                    if (!$id) { throw new Exception('ID required'); }

                    if ($role === 'teacher') {
                        // Teachers can only assign students to an existing activity
                        $stmt = $this->db->prepare('SELECT name, description, department, sessions_per_week FROM activities WHERE id = :id');
                        $stmt->execute([':id' => $id]);
                        $existing = $stmt->fetch();
                        if (!$existing) { throw new Exception('Activity not found'); }
                        Activity::update(
                            $this->db,
                            $id,
                            (string)$existing['name'],
                            (string)($existing['description'] ?? ''),
                            (string)($existing['department'] ?? 'Other'),
                            (int)($existing['sessions_per_week'] ?? 1),
                            $studentIds
                        );
                    } else {
                        Auth::requireRole(['admin', 'head']);
                        $name = trim($_POST['name'] ?? '');
                        $description = trim($_POST['description'] ?? '');
                        $department = trim($_POST['department'] ?? 'Other');
                        $sessions = intval($_POST['sessions_per_week'] ?? 1);
                        if ($name === '') { throw new Exception('Name required'); }
                        if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }
                        Activity::update($this->db, $id, $name, $description, $department, $sessions, $studentIds);
                    }
                    echo json_encode(['ok' => true]);
                    break;
                case 'delete_activity':
                    Auth::requireRole(['admin']);
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
                    Auth::requireRole(['admin']);
                    echo json_encode(['stats' => Attendance::getGlobalStats($this->db)]);
                    break;
                case 'get_student_stats':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getStudentStats($this->db, $id)]);
                    break;
                case 'get_activity_stats':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getActivityStats($this->db, $id)]);
                    break;
                case 'get_activity_export':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['data' => Attendance::getActivityExportData($this->db, $id)]);
                    break;
                case 'get_year_group_export':
                    Auth::requireRole(['admin']);
                    $yg = intval($_GET['year_group'] ?? 0);
                    if (!$yg) throw new Exception('Year Group required');
                    echo json_encode(['data' => Attendance::getYearGroupExportData($this->db, $yg)]);
                    break;
                case 'get_department_export':
                    Auth::requireRole(['admin']);
                    $dept = $_GET['department'] ?? '';
                    if (!$dept) throw new Exception('Department required');
                    echo json_encode(['data' => Attendance::getDepartmentExportData($this->db, $dept)]);
                    break;
                case 'get_export_stats':
                    Auth::requireRole(['admin']);
                    echo json_encode(['data' => Attendance::getExportData($this->db)]);
                    break;
                case 'toggle_attendance':
                    Auth::requireRole(['admin', 'head', 'teacher']);
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
                    Auth::requireRole(['admin']);
                    $k = $_POST['k'] ?? null; $v = $_POST['v'] ?? null;
                    if (!$k) throw new Exception('key required');
                    Settings::save($this->db, $k, $v);
                    echo json_encode(['ok' => true]);
                    break;
                case 'get_settings':
                    Auth::requireRole(['admin']);
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
