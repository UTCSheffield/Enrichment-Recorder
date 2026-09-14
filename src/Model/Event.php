<?php
namespace App\Model;

use PDO;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;

final class Event {
    public static function today(?DateTimeImmutable $now = null): string {
        return ($now ?? new DateTimeImmutable('now'))->setTimezone(new DateTimeZone('Europe/London'))->format('Y-m-d');
    }

    public static function listIds(mixed $value, string $field, bool $years = false): array {
        if (is_string($value)) $value = $value === '' ? [] : explode(',', $value);
        if (!is_array($value) || !array_is_list($value)) throw new InvalidArgumentException("Invalid $field");
        $result = [];
        foreach ($value as $id) {
            if (!is_scalar($id) || !preg_match('/^[1-9][0-9]*$/', (string)$id)) throw new InvalidArgumentException("Invalid $field");
            $id = (int)$id;
            if ($years && ($id < 9 || $id > 13)) throw new InvalidArgumentException('Year groups must be 9–13');
            $result[] = $id;
        }
        $result = array_values(array_unique($result)); sort($result);
        return $result;
    }

    public static function rules(array $activity): array {
        return json_decode($activity['event_rules'] ?? '{}', true) ?: [];
    }

    public static function save(PDO $db, array $input, ?array $previous = null): int {
        $date = $input['event_date'] ?? $previous['event_date'] ?? '';
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new InvalidArgumentException('Event date required (YYYY-MM-DD)');
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Invalid event date');
        $name = trim($input['name'] ?? $previous['name'] ?? '');
        if ($name === '') throw new InvalidArgumentException('Name required');
        foreach (['student_ids', 'all_students_mandatory'] as $legacy) {
            if (isset($input[$legacy])) throw new InvalidArgumentException('Use event roster rules for events');
        }
        $old = $previous ? self::rules($previous) : [];
        $rules = [];
        foreach (['year_groups','mandatory_year_groups','manual_student_ids','included_student_ids','excluded_student_ids'] as $field) {
            $rules[$field] = self::listIds($input[$field] ?? $old[$field] ?? [], $field, str_contains($field, 'year_groups'));
        }
        if (!$rules['year_groups']) throw new InvalidArgumentException('Select at least one eligible year group');
        if (array_diff($rules['mandatory_year_groups'], $rules['year_groups'])) throw new InvalidArgumentException('Mandatory years must be eligible');
        if (array_intersect($rules['included_student_ids'], $rules['excluded_student_ids'])) throw new InvalidArgumentException('A student cannot be both included and excluded');
        $changed = !$previous || $rules != $old;
        // Unchanged historical rules can refer to students who have since left or changed year.
        if ($changed) {
            $eligible = $db->query('SELECT id FROM students WHERE year_group IN (' . implode(',', $rules['year_groups']) . ')')->fetchAll(PDO::FETCH_COLUMN);
            foreach (['manual_student_ids','included_student_ids','excluded_student_ids'] as $field) {
                if (array_diff($rules[$field], $eligible)) throw new InvalidArgumentException('Selected students must belong to eligible year groups');
            }
        }
        $description = $input['description'] ?? $previous['description'] ?? '';
        $department = $input['department'] ?? $previous['department'] ?? 'Other';
        if ($previous) {
            $id = (int)$previous['id'];
            $db->prepare('UPDATE activities SET name=?, description=?, department=?, event_date=?, event_rules=? WHERE id=?')->execute([$name,$description,$department,$date,json_encode($rules),$id]);
        } else {
            $db->prepare("INSERT INTO activities (name,description,department,scope,sessions_per_week,has_mandatory,event_date,event_rules) VALUES (?,?,?,'event',1,1,?,?)")->execute([$name,$description,$department,$date,json_encode($rules)]);
            $id = (int)$db->lastInsertId();
        }
        if ($changed || $date >= self::today()) self::rebuild($db, $id, $rules);
        return $id;
    }

    public static function rebuild(PDO $db, int $id, array $rules): void {
        $db->prepare('UPDATE event_participants SET active=0 WHERE event_id=?')->execute([$id]);
        $students = $db->query('SELECT id,name,year_group FROM students')->fetchAll();
        $save = $db->prepare('INSERT INTO event_participants (event_id,student_id,name,year_group,mandatory,active) VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),year_group=VALUES(year_group),mandatory=VALUES(mandatory),active=1');
        foreach ($students as $student) {
            $sid = (int)$student['id']; $year = (int)$student['year_group'];
            if (!in_array($year, $rules['year_groups'], true)) continue;
            $byYear = in_array($year, $rules['mandatory_year_groups'], true);
            $included = in_array($sid, $rules['included_student_ids'], true);
            $excluded = in_array($sid, $rules['excluded_student_ids'], true);
            $save->execute([$id,$sid,$student['name'],$year,($byYear || $included) && !$excluded ? 1 : 0]);
        }
    }

    public static function synchronize(PDO $db): void {
        $stmt = $db->prepare("SELECT id,event_rules FROM activities WHERE scope='event' AND event_date>=?");
        $stmt->execute([self::today()]);
        foreach ($stmt->fetchAll() as $event) {
            $rules = self::rules($event);
            $eligible = array_map('intval', $db->query('SELECT id FROM students WHERE year_group IN (' . implode(',', $rules['year_groups']) . ')')->fetchAll(PDO::FETCH_COLUMN));
            foreach (['manual_student_ids','included_student_ids','excluded_student_ids'] as $field) $rules[$field] = array_values(array_intersect($rules[$field], $eligible));
            $db->prepare('UPDATE activities SET event_rules=? WHERE id=?')->execute([json_encode($rules), $event['id']]);
            self::rebuild($db, (int)$event['id'], $rules);
        }
    }

    public static function decorate(PDO $db, array $event): array {
        $event = array_merge($event, self::rules($event));
        unset($event['event_rules']);
        $stmt = $db->prepare('SELECT student_id AS id,name,year_group,mandatory,note,active FROM event_participants WHERE event_id=? ORDER BY name,student_id');
        $stmt->execute([$event['id']]);
        $event['participants'] = $stmt->fetchAll();
        $event['student_ids'] = [];
        $event['student_meta'] = [];
        foreach ($event['participants'] as $p) {
            if ($p['active']) $event['student_ids'][] = (int)$p['id'];
            $event['student_meta'][(string)$p['id']] = ['mandatory'=>(int)$p['mandatory'],'note'=>$p['note'] ?? ''];
        }
        $event['student_meta'] = (object)$event['student_meta'];
        $event['frozen'] = $event['event_date'] < self::today();
        return $event;
    }

    public static function attendance(PDO $db, int $id): array {
        $stmt = $db->prepare('SELECT student_id,present FROM event_attendance WHERE event_id=?'); $stmt->execute([$id]);
        $out=[]; foreach ($stmt->fetchAll() as $row) $out[$row['student_id']] = [1=>(int)$row['present']];
        return $out;
    }

    public static function mark(PDO $db, int $id, int $sid, int $present): void {
        $stmt=$db->prepare('SELECT 1 FROM event_participants WHERE event_id=? AND student_id=?'); $stmt->execute([$id,$sid]);
        if (!$stmt->fetchColumn()) throw new InvalidArgumentException('Student is not part of this event');
        $db->prepare('INSERT INTO event_attendance (event_id,student_id,present) VALUES (?,?,?) ON DUPLICATE KEY UPDATE present=VALUES(present)')->execute([$id,$sid,$present]);
    }
}
