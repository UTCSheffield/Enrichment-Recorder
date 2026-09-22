<?php
namespace App;

use PDO;
use RuntimeException;

/** Portable data snapshots. Uploaded content is never executed as SQL. */
class Backup {
    public const MAX_BYTES = 134217728;

    private static function quote(string $name): string {
        return '`' . str_replace('`', '``', $name) . '`';
    }

    private static function schema(PDO $db): array {
        $tables = [];
        foreach ($db->query('SHOW TABLE STATUS')->fetchAll() as $table) {
            if ($table['Engine'] !== 'InnoDB') throw new RuntimeException('Backup requires InnoDB tables only.');
            $name = $table['Name'];
            $ddl = $db->query('SHOW CREATE TABLE ' . self::quote($name))->fetch(PDO::FETCH_NUM)[1];
            $tables[$name] = preg_replace('/ AUTO_INCREMENT=\d+/', '', $ddl);
        }
        ksort($tables);
        return $tables;
    }

    public static function download(PDO $db): string {
        $schema = self::schema($db);
        $db->exec("SET time_zone = '+00:00'");
        $db->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $db->beginTransaction();
        try {
            $tables = [];
            foreach ($schema as $name => $ddl) {
                $tables[$name] = ['schema' => $ddl, 'rows' => $db->query('SELECT * FROM ' . self::quote($name))->fetchAll(PDO::FETCH_ASSOC)];
            }
            $payload = json_encode(['created_at' => gmdate('c'), 'tables' => $tables], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            $file = json_encode(['format' => 'enrichment-recorder-backup', 'version' => 1, 'sha256' => hash('sha256', $payload), 'payload' => $payload], JSON_THROW_ON_ERROR);
            if (strlen($file) > self::MAX_BYTES) throw new RuntimeException('Backup exceeds the 128 MiB restore limit. Use a database administrator backup.');
            $db->commit();
            return $file;
        } catch (\Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
    }

    public static function restore(PDO $db, string $file): void {
        if (strlen($file) > self::MAX_BYTES) throw new RuntimeException('Backup exceeds the 128 MiB limit.');
        $envelope = json_decode($file, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($envelope) || ($envelope['format'] ?? '') !== 'enrichment-recorder-backup' || ($envelope['version'] ?? null) !== 1 || !is_string($envelope['payload'] ?? null) || !is_string($envelope['sha256'] ?? null) || !hash_equals(hash('sha256', $envelope['payload']), $envelope['sha256'])) {
            throw new RuntimeException('Invalid or damaged backup file.');
        }
        $payload = json_decode($envelope['payload'], true, 512, JSON_THROW_ON_ERROR);
        $tables = $payload['tables'] ?? null;
        $schema = self::schema($db);
        if (!is_array($tables) || array_keys($tables) !== array_keys($schema)) throw new RuntimeException('Backup tables do not match this installation. Use the same application version as the backup.');
        foreach ($schema as $name => $ddl) {
            if (($tables[$name]['schema'] ?? null) !== $ddl || !is_array($tables[$name]['rows'] ?? null) || !array_is_list($tables[$name]['rows'])) throw new RuntimeException('Backup schema does not match this installation. Use the same application version as the backup.');
            $columns = $db->query('SHOW COLUMNS FROM ' . self::quote($name))->fetchAll(PDO::FETCH_COLUMN);
            foreach ($tables[$name]['rows'] as $row) {
                if (!is_array($row) || array_keys($row) !== $columns) throw new RuntimeException('Invalid backup row.');
                foreach ($row as $value) if (!is_null($value) && !is_string($value) && !is_int($value) && !is_float($value)) throw new RuntimeException('Invalid backup value.');
            }
        }
        // Current application tables have no foreign keys. Refuse schema extensions
        // requiring dependency ordering rather than disabling integrity checks.
        if ($db->query('SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()')->fetchColumn()) throw new RuntimeException('This database has custom foreign keys; restore requires a database administrator.');
        $db->exec("SET time_zone = '+00:00'");
        $db->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_AUTO_VALUE_ON_ZERO,NO_ENGINE_SUBSTITUTION'");
        $db->beginTransaction();
        try {
            foreach ($tables as $name => $table) {
                $quoted = self::quote($name);
                $db->exec('DELETE FROM ' . $quoted);
                if (!$table['rows']) continue;
                $columns = array_keys($table['rows'][0]);
                $insert = $db->prepare('INSERT INTO ' . $quoted . ' (' . implode(',', array_map([self::class, 'quote'], $columns)) . ') VALUES (' . implode(',', array_fill(0, count($columns), '?')) . ')');
                foreach ($table['rows'] as $row) $insert->execute(array_values($row));
            }
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw new RuntimeException('Restore failed. No records were changed. Check that the file is a valid backup for this version.', 0, $e);
        }
    }
}
