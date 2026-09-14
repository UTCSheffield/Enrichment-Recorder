<?php
// Explicit CLI migration. Never served over HTTP.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../src/Env.php';
require __DIR__ . '/../src/Database.php';
App\Env::load(__DIR__ . '/../.env', false);
$db = App\Database::getConnection(false);
if (!$db->query("SELECT GET_LOCK('er_schema_migration', 30)")->fetchColumn()) throw new RuntimeException('Migration lock unavailable');
try {
    $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $initializing = in_array('--initialize', $argv, true);
    if (!in_array('students', $tables, true) && !($initializing && !$tables)) {
        throw new RuntimeException('UPGRADE STOPPED: the selected database has no students table. No schema changes were made. Reconnect the original database/volume or restore the verified backup; do not initialise replacement tables over a production installation. Use --initialize only for a genuinely new, empty installation.');
    }
    if ($initializing && $tables) throw new RuntimeException('--initialize requires an entirely empty database. Use the normal migration for an existing installation.');
    require __DIR__ . '/legacy-schema.php';
    foreach ([
        'scope' => "VARCHAR(20) NOT NULL DEFAULT 'normal'",
        'all_students_mandatory' => 'TINYINT(1) NOT NULL DEFAULT 0',
    ] as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM activities LIKE '$column'")->fetch()) {
            $db->exec("ALTER TABLE activities ADD COLUMN $column $definition");
            echo "Added activities.$column\n";
        }
    }
    $db->exec('CREATE TABLE IF NOT EXISTS activity_year_groups (
        activity_id INT NOT NULL,
        year_group INT NOT NULL,
        PRIMARY KEY (activity_id, year_group)
    ) ENGINE=InnoDB');
    foreach ([
        'pp' => 'TINYINT(1) NULL DEFAULT NULL',
        'fsm_ever' => 'TINYINT(1) NULL DEFAULT NULL',
        'gender' => 'CHAR(1) NULL DEFAULT NULL',
        'sen_status' => 'VARCHAR(10) NULL DEFAULT NULL',
    ] as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM students LIKE '$column'")->fetch()) {
            $db->exec("ALTER TABLE students ADD COLUMN $column $definition");
            echo "Added students.$column\n";
        }
    }
    foreach (['event_date' => 'DATE NULL', 'event_rules' => 'JSON NULL'] as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM activities LIKE '$column'")->fetch()) $db->exec("ALTER TABLE activities ADD COLUMN $column $definition");
    }
    $db->exec('CREATE TABLE IF NOT EXISTS event_participants (
        event_id INT NOT NULL, student_id INT NOT NULL, name VARCHAR(255) NOT NULL,
        year_group INT NOT NULL, mandatory TINYINT(1) NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1, note TEXT NULL,
        PRIMARY KEY (event_id,student_id)
    ) ENGINE=InnoDB');
    $db->exec('CREATE TABLE IF NOT EXISTS event_attendance (
        event_id INT NOT NULL, student_id INT NOT NULL, present TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (event_id,student_id)
    ) ENGINE=InnoDB');
    $db->exec('CREATE TABLE IF NOT EXISTS archived_students (
        id INT PRIMARY KEY, name VARCHAR(255) NOT NULL, year_group INT NULL,
        pp TINYINT(1) NULL, fsm_ever TINYINT(1) NULL, gender CHAR(1) NULL, sen_status VARCHAR(10) NULL
    ) ENGINE=InnoDB');
    // INSERT IGNORE never rewrites a captured archive snapshot on a later migration.
    $db->exec("INSERT IGNORE INTO archived_students (id,name,year_group,pp,fsm_ever,gender,sen_status)
        SELECT linked.student_id,COALESCE(s.name,CONCAT('Student #',linked.student_id)),s.year_group,s.pp,s.fsm_ever,s.gender,s.sen_status
        FROM (SELECT m.student_id FROM activity_students m JOIN activities a ON a.id=m.activity_id WHERE a.scope='whole_school'
              UNION SELECT att.student_id FROM attendance att JOIN activities a ON a.id=att.activity_id WHERE a.scope='whole_school') linked
        LEFT JOIN students s ON s.id=linked.student_id");
    echo "Migration complete. Existing whole-school records are archived; normal activities are unchanged.\n";
} finally {
    $db->query("SELECT RELEASE_LOCK('er_schema_migration')");
}
