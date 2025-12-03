<?php
// Creates the data directory and the SQLite DB with required tables.
// This is only used on SQLite local, so not at all anymore really, and was
// only legacy before Docker/MySQL was implemented.
$dir = __DIR__ . '/../data';
if (!is_dir($dir)) {
    mkdir($dir, 0750, true);
}
$dbFile = $dir . '/enrichment.sqlite';
$needCreate = !file_exists($dbFile);
try {
    $db = new PDO('sqlite:' . $dbFile);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    if ($needCreate) {
        $db->exec("PRAGMA journal_mode = WAL;");
        $db->exec("CREATE TABLE students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );");

        $db->exec("CREATE TABLE activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sessions_per_week INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );");

        $db->exec("CREATE TABLE attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            activity_id INTEGER NOT NULL,
            week_start TEXT NOT NULL,
            session_index INTEGER NOT NULL,
            present INTEGER NOT NULL DEFAULT 0,
            UNIQUE(student_id, activity_id, week_start, session_index)
        );");

        $db->exec("CREATE TABLE settings (
            k TEXT PRIMARY KEY,
            v TEXT
        );");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB init failed: ' . $e->getMessage()]);
    exit;
}

return $db;
