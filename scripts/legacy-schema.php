<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// CLI migration helper: create missing base tables without rebuilding existing ones.
$db->exec("CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            year_group INT DEFAULT 9,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;");
$db->exec("CREATE TABLE IF NOT EXISTS activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            department VARCHAR(255) DEFAULT 'Other',
            sessions_per_week INT NOT NULL DEFAULT 1,
            has_mandatory TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;");
$db->exec("CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            activity_id INT NOT NULL,
            week_start VARCHAR(20) NOT NULL,
            session_index INT NOT NULL,
            present TINYINT(1) NOT NULL DEFAULT 0,
            UNIQUE KEY unique_attendance (student_id, activity_id, week_start, session_index)
        ) ENGINE=InnoDB;");
$db->exec("CREATE TABLE IF NOT EXISTS settings (
            k VARCHAR(50) PRIMARY KEY,
            v TEXT
        ) ENGINE=InnoDB;");
$db->exec("CREATE TABLE IF NOT EXISTS activity_students (
            activity_id INT NOT NULL,
            student_id INT NOT NULL,
            mandatory TINYINT(1) NOT NULL DEFAULT 0,
            note TEXT NULL,
            PRIMARY KEY (activity_id, student_id)
        ) ENGINE=InnoDB;");
foreach ([
    'students' => ['year_group' => 'INT DEFAULT 9'],
    'activities' => ['description' => 'TEXT NULL', 'department' => "VARCHAR(255) DEFAULT 'Other'", 'has_mandatory' => 'TINYINT(1) NOT NULL DEFAULT 1'],
    'activity_students' => ['mandatory' => 'TINYINT(1) NOT NULL DEFAULT 0', 'note' => 'TEXT NULL'],
] as $table => $columns) {
    foreach ($columns as $column => $definition) {
        if (!$db->query("SHOW COLUMNS FROM `$table` LIKE '$column'")->fetch()) {
            $db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            echo "Added $table.$column\n";
        }
    }
}
// Older releases used VARCHAR(50). Only widen; retain nullability, default and collation.
$column = $db->query("SHOW FULL COLUMNS FROM activities LIKE 'department'")->fetch();
if (preg_match('/^varchar\((\d+)\)$/i', $column['Type'], $match) && (int)$match[1] < 255) {
    $nullable = $column['Null'] === 'YES' ? 'NULL' : 'NOT NULL';
    $default = $column['Default'] === null ? ($column['Null'] === 'YES' ? ' DEFAULT NULL' : '') : ' DEFAULT ' . $db->quote($column['Default']);
    $collation = $column['Collation'];
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $collation)) throw new RuntimeException('Unexpected department collation');
    $charset = explode('_', $collation)[0];
    $db->exec("ALTER TABLE activities MODIFY COLUMN department VARCHAR(255) CHARACTER SET $charset COLLATE $collation $nullable $default COMMENT " . $db->quote($column['Comment']));
    echo "Widened activities.department to 255 characters\n";
}
