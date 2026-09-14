<?php
// Snapshot hashes contain no student values. Store outside the repository with the backup.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../src/Env.php';
require __DIR__ . '/../src/Database.php';
App\Env::load(__DIR__ . '/../.env', false);
$db = App\Database::getConnection(false);
$baseline = isset($argv[1]) ? json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR) : null;
$tables = $baseline ? array_keys($baseline) : $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$output = [];
$db->beginTransaction();
try {
    foreach ($tables as $table) {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) throw new RuntimeException('Invalid table name');
        $columns = $baseline[$table]['columns'] ?? $db->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($columns as $column) if (!preg_match('/^[a-zA-Z0-9_]+$/', $column)) throw new RuntimeException('Invalid column name');
        $selection = implode(',', array_map(fn($c) => "`$c`", $columns));
        $hash = hash_init('sha256'); $count = 0;
        $rows = $db->query("SELECT $selection FROM `$table` ORDER BY $selection");
        while ($row = $rows->fetch(PDO::FETCH_ASSOC)) { hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR) . "\n"); $count++; }
        $output[$table] = ['columns' => $columns, 'rows' => $count, 'sha256' => hash_final($hash)];
        if ($baseline && $output[$table] !== $baseline[$table]) throw new RuntimeException("Existing records changed in $table");
    }
    $db->commit();
    echo $baseline ? "Verified: all original columns and records are unchanged.\n" : json_encode($output, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    fwrite(STDERR, $error->getMessage() . "\n"); exit(1);
}
