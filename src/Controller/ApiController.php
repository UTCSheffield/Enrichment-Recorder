<?php

namespace App\Controller;

use App\Database;
use App\Auth;
use App\ActivityScope;
use App\Model\Student;
use App\Model\Activity;
use App\Model\Event;
use App\Model\Attendance;
use App\Model\Settings;
use Exception;


// Handles API requests basically
class ApiController {
    private $db;

    public function __construct() {
        $this->db = Database::getConnection(false);
    }

    private function eventReportStudents(): array {
        $rows = $this->db->query('SELECT p.student_id AS id,p.name,p.year_group FROM event_participants p JOIN activities a ON a.id=p.event_id ORDER BY a.event_date DESC,a.id DESC')->fetchAll();
        $students = [];
        foreach (array_merge($rows, Student::getAll($this->db)) as $row) {
            if (!isset($students[$row['id']])) $students[$row['id']] = $row;
        }
        return array_values($students);
    }

    public function handle(string $action) {
        header('Content-Type: application/json; charset=utf-8');

        $role = Auth::role();
        if ($role === null) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $writing = false;
        ob_start();
        try {
            $scope = ActivityScope::validate((string)($_POST['scope'] ?? $_GET['scope'] ?? 'normal'));
            $writing = in_array($action, ['import_students', 'create_student', 'update_student', 'delete_student', 'delete_students', 'create_activity', 'update_activity', 'delete_activity', 'toggle_attendance', 'update_activity_student', 'save_setting'], true);
            if ($writing) {
                if (!$this->db->query("SELECT GET_LOCK('er_roster_write', 10)")->fetchColumn()) throw new Exception('Another change is in progress. Please retry.');
                $this->db->beginTransaction();
            }
            $activity = null;
            $idActions = ['update_activity', 'delete_activity', 'get_activity_stats', 'get_activity_export'];
            $activityId = in_array($action, $idActions, true) ? intval($_POST['id'] ?? $_GET['id'] ?? 0) : intval($_POST['activity_id'] ?? $_GET['activity_id'] ?? 0);
            if ($activityId) {
                $activity = ActivityScope::activity($this->db, $activityId);
                if ($activity['scope'] !== $scope) throw new Exception('Activity does not belong to the selected view');
            }
            if ($writing && $scope === 'whole_school') {
                http_response_code(403);
                echo json_encode(['error' => 'Archived whole-school activities are read-only']);
                return;
            }
            if ($scope === 'event' && in_array($action, ['create_activity','update_activity','toggle_attendance','update_activity_student'], true)) {
                Auth::requireRole(['super_admin']);
                if ($action === 'create_activity' || $action === 'update_activity') {
                    if ($action === 'update_activity' && !$activity) throw new Exception('Event not found');
                    $id = Event::save($this->db, $_POST, $activity);
                    echo json_encode(['ok'=>true,'id'=>$id]);
                } elseif ($action === 'toggle_attendance') {
                    if (!$activity) throw new Exception('Event not found');
                    if (isset($_POST['session_index']) && (string)$_POST['session_index'] !== '1') throw new Exception('Events have one attendance mark per student');
                    if (!in_array((string)($_POST['present'] ?? ''), ['0','1'], true)) throw new Exception('Attendance must be 0 or 1');
                    Event::mark($this->db, $activityId, (int)($_POST['student_id'] ?? 0), !empty($_POST['present']) ? 1 : 0);
                    echo json_encode(['ok'=>true]);
                } else {
                    if (!$activity) throw new Exception('Event not found');
                    if (isset($_POST['mandatory'])) throw new Exception('Edit the event rules to change mandatory status');
                    $sid = (int)($_POST['student_id'] ?? 0);
                    $member=$this->db->prepare('SELECT 1 FROM event_participants WHERE event_id=? AND student_id=?'); $member->execute([$activityId,$sid]);
                    if (!$member->fetchColumn()) throw new Exception('Student is not part of this event');
                    $this->db->prepare('UPDATE event_participants SET note=? WHERE event_id=? AND student_id=?')->execute([(string)($_POST['note'] ?? ''),$activityId,$sid]);
                    echo json_encode(['ok'=>true]);
                }
                Event::synchronize($this->db);
                $this->db->commit();
                echo ob_get_clean();
                return;
            }
            switch ($action) {
                case 'get_state':
                    echo json_encode([
                        'students' => $scope === 'whole_school' ? $this->db->query('SELECT * FROM archived_students ORDER BY name')->fetchAll() : Student::getAll($this->db),
                        'report_students' => $scope === 'event' ? $this->eventReportStudents() : [],
                        'school_student_count' => (int)$this->db->query('SELECT COUNT(*) FROM students')->fetchColumn(),
                        'today' => Event::today(),
                        'activities' => Activity::getAll($this->db, $scope),
                        'settings' => (Auth::isAdmin()) ? Settings::getAllKeyPair($this->db) : []
                    ]);
                    break;
                case 'get_students':
                    echo json_encode(['students' => Student::getAll($this->db)]);
                    break;
                case 'import_students':
                    Auth::requireRole(['admin']);
                    $rows = json_decode((string)($_POST['rows'] ?? ''), true, 512, JSON_THROW_ON_ERROR);
                    if (!is_array($rows)) throw new Exception('Invalid student import');
                    $count = Student::importRows($this->db, $rows);
                    echo json_encode(['ok' => true, 'created' => $count]);
                    break;
                case 'create_student':
                    Auth::requireRole(['admin']);
                    $name = trim($_POST['name'] ?? '');
                    $yearGroup = intval($_POST['year_group'] ?? 9);
                    if ($name === '') { throw new Exception('Name required'); }
                    $id = Student::create($this->db, $name, $yearGroup, $_POST);
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_student':
                    if (Auth::isAdmin()) {
                        // Admin can update any student
                    } elseif ($role === 'head' || $role === 'teacher') {
                        // Head/Teacher can only update students assigned to the provided activity
                        $activityId = intval($_POST['activity_id'] ?? 0);
                        if (!$activityId) { throw new Exception('activity_id required'); }
                        $studentId = intval($_POST['id'] ?? 0);
                        if (!$studentId) { throw new Exception('ID required'); }
                        $chk = $this->db->prepare('SELECT 1 FROM activity_students WHERE activity_id = :aid AND student_id = :sid');
                        $chk->execute([':aid' => $activityId, ':sid' => $studentId]);
                        if (!$chk->fetchColumn()) {
                            http_response_code(403);
                            echo json_encode(['error' => 'Not allowed']);
                            return;
                        }
                    } else {
                        Auth::requireRole(['admin']);
                    }
                    $id = intval($_POST['id'] ?? 0);
                    $name = trim($_POST['name'] ?? '');
                    $yearGroup = intval($_POST['year_group'] ?? 9);
                    if (!$id) { throw new Exception('ID required'); }
                    if ($name === '') { throw new Exception('Name required'); }
                    Student::update($this->db, $id, $name, $yearGroup, $_POST);
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
                    echo json_encode(['activities' => Activity::getAll($this->db, $scope)]);
                    break;
                case 'create_activity':
                    Auth::requireRole(['admin', 'head']);
                    $name = trim($_POST['name'] ?? '');
                    $description = trim($_POST['description'] ?? '');
                    $department = trim($_POST['department'] ?? 'Other');
                    $sessions = intval($_POST['sessions_per_week'] ?? 1);
                    $hasMandatory = intval($_POST['has_mandatory'] ?? 1) ? 1 : 0;
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];
                    
                    if ($name === '') { throw new Exception('Name required'); }
                    if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }
                    // Activity::create defaults has_mandatory to 1 for backward compatibility.
                    $id = Activity::create($this->db, $name, $description, $department, $sessions, $studentIds);
                    $stmt = $this->db->prepare('UPDATE activities SET has_mandatory = :hm WHERE id = :id');
                    $stmt->execute([':hm' => $hasMandatory, ':id' => $id]);
                    $this->db->prepare('UPDATE activities SET scope = ? WHERE id = ?')->execute([$scope, $id]);
                    ActivityScope::configure($this->db, $id, $_POST, ['scope' => $scope, 'all_students_mandatory' => 0, 'new' => true], $studentIds);
                    if ($scope === 'whole_school' && !empty($_POST['all_students_mandatory']) && isset($_POST['student_ids'])) throw new Exception('Automatic registers do not accept manual assignments');
                    echo json_encode(['ok' => true, 'id' => $id]);
                    break;
                case 'update_activity':
                    $id = intval($_POST['id'] ?? 0);
                    $sids_str = $_POST['student_ids'] ?? '';
                    $studentIds = $sids_str ? array_map('intval', explode(',', $sids_str)) : [];
                    $hasMandatory = intval($_POST['has_mandatory'] ?? 0) ? 1 : 0;

                    if (!$id) { throw new Exception('ID required'); }

                    if ($activity['scope'] === 'whole_school' && !isset($_POST['student_ids'])) {
                        $members = $this->db->prepare('SELECT student_id FROM activity_students WHERE activity_id = ?');
                        $members->execute([$id]);
                        $studentIds = array_map('intval', $members->fetchAll(\PDO::FETCH_COLUMN));
                    }
                    ActivityScope::configure($this->db, $id, $_POST, $activity, $studentIds);
                    if ($activity['scope'] === 'whole_school' && !empty($_POST['all_students_mandatory'] ?? $activity['all_students_mandatory'])) {
                        if (isset($_POST['student_ids'])) throw new Exception('Automatic registers do not accept manual assignments');
                    }
                    if ($role === 'teacher') {
                        // Teachers can only assign students to an existing activity
                        $stmt = $this->db->prepare('SELECT name, description, department, sessions_per_week, has_mandatory FROM activities WHERE id = :id');
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
                            (int)($existing['has_mandatory'] ?? 1),
                            $studentIds
                        );
                    } else {
                        Auth::requireRole(['admin', 'head']);
                        $name = trim($_POST['name'] ?? '');
                        $description = trim($_POST['description'] ?? '');
                        $department = trim($_POST['department'] ?? '');
                        $sessions = intval($_POST['sessions_per_week'] ?? 1);
                        if ($name === '') { throw new Exception('Name required'); }
                        if ($sessions < 1 || $sessions > 7) { throw new Exception('sessions_per_week must be 1..7'); }

                        // Preserve existing values if optional params are omitted
                        if ($department === '' || !isset($_POST['has_mandatory'])) {
                            $stmt = $this->db->prepare('SELECT department, has_mandatory FROM activities WHERE id = :id');
                            $stmt->execute([':id' => $id]);
                            $existing = $stmt->fetch();
                            if ($existing) {
                                if ($department === '') {
                                    $department = (string)($existing['department'] ?? 'Other');
                                }
                                if (!isset($_POST['has_mandatory'])) {
                                    $hasMandatory = (int)($existing['has_mandatory'] ?? 1);
                                }
                            }
                        }

                        Activity::update($this->db, $id, $name, $description, $department, $sessions, $hasMandatory, $studentIds);
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
                    echo json_encode(['attendance' => $scope === 'event' ? Event::attendance($this->db, $activity_id) : Attendance::getForActivity($this->db, $activity_id, $week_start, $scope)]);
                    break;
                case 'get_stats':
                    Auth::requireRole(['admin']);
                    echo json_encode(['stats' => Attendance::getGlobalStats($this->db, $scope)]);
                    break;
                case 'get_student_stats':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getStudentStats($this->db, $id, $scope)]);
                    break;
                case 'get_activity_stats':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['stats' => Attendance::getActivityStats($this->db, $id, $scope)]);
                    break;
                case 'get_activity_export':
                    Auth::requireRole(['admin']);
                    $id = intval($_GET['id'] ?? 0);
                    if (!$id) throw new Exception('ID required');
                    echo json_encode(['data' => Attendance::getActivityExportData($this->db, $id, $scope)]);
                    break;
                case 'get_year_group_export':
                    Auth::requireRole(['admin']);
                    $yg = intval($_GET['year_group'] ?? 0);
                    if (!$yg) throw new Exception('Year Group required');
                    echo json_encode(['data' => Attendance::getYearGroupExportData($this->db, $yg, $scope)]);
                    break;
                case 'get_department_export':
                    Auth::requireRole(['admin']);
                    $dept = $_GET['department'] ?? '';
                    if (!$dept) throw new Exception('Department required');
                    echo json_encode(['data' => Attendance::getDepartmentExportData($this->db, $dept, $scope)]);
                    break;
                case 'get_export_stats':
                    Auth::requireRole(['admin']);
                    echo json_encode(['data' => Attendance::getExportData($this->db, $scope)]);
                    break;
                case 'toggle_attendance':
                    Auth::requireRole(['admin', 'head', 'teacher']);
                    $student_id = intval($_POST['student_id'] ?? 0);
                    $activity_id = intval($_POST['activity_id'] ?? 0);
                    $week_start = $_POST['week_start'] ?? null;
                    $session_index = intval($_POST['session_index'] ?? 1);
                    $present = intval($_POST['present'] ?? 0) ? 1 : 0;
                    if (!$student_id || !$activity_id || !$week_start) throw new Exception('Missing params');

                    // Enforce that the student is assigned to the activity
                    $chk = $this->db->prepare('SELECT 1 FROM activity_students WHERE activity_id = :aid AND student_id = :sid');
                    $chk->execute([':aid' => $activity_id, ':sid' => $student_id]);
                    if (!$chk->fetchColumn()) {
                        http_response_code(403);
                        echo json_encode(['error' => 'Student not assigned to activity']);
                        return;
                    }
                    Attendance::toggle($this->db, $student_id, $activity_id, $week_start, $session_index, $present);
                    echo json_encode(['ok' => true]);
                    break;

                case 'update_activity_student':
                    Auth::requireRole(['admin', 'head', 'teacher']);
                    $activityId = intval($_POST['activity_id'] ?? 0);
                    $studentId = intval($_POST['student_id'] ?? 0);
                    $mandatory = intval($_POST['mandatory'] ?? 0) ? 1 : 0;
                    $note = (string)($_POST['note'] ?? '');
                    if (!$activityId || !$studentId) { throw new Exception('Missing params'); }

                    $chk = $this->db->prepare('SELECT 1 FROM activity_students WHERE activity_id = :aid AND student_id = :sid');
                    $chk->execute([':aid' => $activityId, ':sid' => $studentId]);
                    if (!$chk->fetchColumn()) {
                        http_response_code(403);
                        echo json_encode(['error' => 'Student not assigned to activity']);
                        return;
                    }

                    $meta = $this->db->prepare('SELECT mandatory FROM activity_students WHERE activity_id = ? AND student_id = ?');
                    $meta->execute([$activityId, $studentId]);
                    $storedMandatory = (int)$meta->fetchColumn();
                    if ($activity['all_students_mandatory'] && isset($_POST['mandatory'])) throw new Exception('Mandatory status is automatic for this activity');
                    if (!isset($_POST['mandatory'])) $mandatory = $storedMandatory;
                    $stmt = $this->db->prepare('UPDATE activity_students SET mandatory = :mandatory, note = :note WHERE activity_id = :aid AND student_id = :sid');
                    $stmt->execute([
                        ':mandatory' => $mandatory,
                        ':note' => $note,
                        ':aid' => $activityId,
                        ':sid' => $studentId,
                    ]);

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
            if ($writing) {
                ActivityScope::synchronize($this->db);
                $this->db->commit();
            }
            echo ob_get_clean();
        } catch (Exception $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            ob_end_clean();
            http_response_code(400);
            echo json_encode(['error' => $e->getMessage()]);
        } finally {
            if ($this->db->inTransaction()) $this->db->rollBack();
            if ($writing) $this->db->query("SELECT RELEASE_LOCK('er_roster_write')");
        }
    }
}
