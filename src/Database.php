<?php

namespace App;

use PDO;
use Exception;

// Database handler class
// This has code for both MySQL (Docker) and SQLite (local dev).
// Even though SQLite may not be fully functional and was used only in early testing.
class Database {
    private static $pdo;

    public static function getConnection(): PDO {
        if (self::$pdo === null) {
            $host = getenv('DB_HOST');
            $dbName = getenv('DB_NAME');
            $user = getenv('DB_USER');
            $pass = getenv('DB_PASS');

            if ($host && $dbName && $user && $pass) {
                // MySQL Connection
                $dsn = "mysql:host=$host;dbname=$dbName;charset=utf8mb4";
                try {
                    self::$pdo = new PDO($dsn, $user, $pass);
                    self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    self::$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
                    
                    // Initialize schema if tables don't exist
                    self::initSchemaMySQL(self::$pdo);
                } catch (Exception $e) {
                    throw new Exception('DB Connection failed: ' . $e->getMessage());
                }
            } else {
                // Fallback to SQLite for local dev without docker env vars
                $dir = __DIR__ . '/../../data';
                if (!is_dir($dir)) {
                    mkdir($dir, 0750, true);
                }
                $dbFile = $dir . '/enrichment.sqlite';
                $needCreate = !file_exists($dbFile);
                
                try {
                    self::$pdo = new PDO('sqlite:' . $dbFile);
                    self::$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                    
                    if ($needCreate) {
                        self::initSchemaSQLite(self::$pdo);
                    }
                } catch (Exception $e) {
                    throw new Exception('DB Connection failed: ' . $e->getMessage());
                }
            }
        }
        return self::$pdo;
    }

    // Used to create DB if it's needed
    private static function initSchemaMySQL(PDO $db) {
        $db->exec("CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;");

        $db->exec("CREATE TABLE IF NOT EXISTS activities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            sessions_per_week INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;");
        
        // Attempt to add description column if it doesn't exist (for existing DBs)
        try {
            $db->exec("ALTER TABLE activities ADD COLUMN description TEXT");
        } catch (Exception $e) { /* Ignore if already exists */ }

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
            PRIMARY KEY (activity_id, student_id)
        ) ENGINE=InnoDB;");
    }

    private static function initSchemaSQLite(PDO $db) {
        $db->exec("PRAGMA journal_mode = WAL;");
        
        $db->exec("CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            sessions_per_week INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );");

        $db->exec("CREATE TABLE IF NOT EXISTS activity_students (
            activity_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            PRIMARY KEY (activity_id, student_id)
        );");

        
        // Attempt to add description column if it doesn't exist
        try {
            $db->exec("ALTER TABLE activities ADD COLUMN description TEXT");
        } catch (Exception $e) { /* Ignore if exists */ }

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
}
