<?php

namespace App\Model;

use PDO;
use stdClass;
class Settings {
    public static function getAll(PDO $db): array {
        $stmt = $db->query('SELECT k, v FROM settings');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) $out[$r['k']] = $r['v'];
        return $out;
    }

    public static function getAllKeyPair(PDO $db) {
        $stmt = $db->query('SELECT k,v FROM settings');
        $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        return $rows ?: new stdClass();
    }

    public static function save(PDO $db, string $k, string $v): void {
        $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);
        
        if ($driver === 'mysql') {
            $sql = "INSERT INTO settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v2";
        } else {
            $sql = "INSERT INTO settings (k, v) VALUES (:k, :v) ON CONFLICT(k) DO UPDATE SET v = :v2";
        }
        
        $stmt = $db->prepare($sql);
        $stmt->execute([':k' => $k, ':v' => $v, ':v2' => $v]);
    }
}
