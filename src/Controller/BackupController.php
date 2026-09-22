<?php
namespace App\Controller;

use App\Auth;
use App\Backup;
use App\Database;

class BackupController {
    public function handle(string $action): void {
        Auth::requireRole(['super_admin']);
        header('Cache-Control: no-store');
        header('Content-Type: application/json; charset=utf-8');
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            header('Allow: POST');
            echo json_encode(['error' => 'POST required']);
            return;
        }
        if (!hash_equals(Auth::backupToken(), (string)($_SERVER['HTTP_X_BACKUP_TOKEN'] ?? ''))) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid request token. Reload the page and retry.']);
            return;
        }
        ini_set('memory_limit', '768M');
        set_time_limit(300);
        $db = null;
        $locks = [];
        try {
            $db = Database::getConnection(false);
            foreach (['er_schema_migration', 'er_roster_write'] as $lock) {
                if (!$db->query("SELECT GET_LOCK('$lock', 10)")->fetchColumn()) throw new \RuntimeException('Another database change is in progress. Please retry.');
                $locks[] = $lock;
            }
            if ($action === 'backup') {
                $file = Backup::download($db);
                header('Content-Disposition: attachment; filename="enrichment-backup-' . gmdate('Y-m-d-His') . '.json"');
                echo $file;
            } else {
                if (($_SERVER['HTTP_X_CONFIRM_RESTORE'] ?? '') !== 'replace-all-data') throw new \RuntimeException('Restore confirmation required.');
                $file = file_get_contents('php://input', false, null, 0, Backup::MAX_BYTES + 1);
                Backup::restore($db, $file);
                echo json_encode(['ok' => true]);
            }
        } catch (\Throwable $e) {
            http_response_code(400);
            echo json_encode(['error' => $e instanceof \JsonException ? 'Invalid backup JSON.' : $e->getMessage()]);
        } finally {
            foreach (array_reverse($locks) as $lock) $db->query("SELECT RELEASE_LOCK('$lock')");
        }
    }
}
