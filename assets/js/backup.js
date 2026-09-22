(() => {
    const backup = document.querySelector('#backupBtn');
    if (!backup) return;
    const restore = document.querySelector('#restoreBtn');
    const input = document.querySelector('#restoreFile');
    const status = document.querySelector('#backupStatus');
    const busy = value => { backup.disabled = restore.disabled = value; };
    async function request(action, body) {
        const response = await fetch(`/?action=${action}`, {
            method: 'POST', body,
            headers: {'X-Backup-Token': window.__ER_BACKUP_TOKEN__, 'X-Confirm-Restore': 'replace-all-data', 'Content-Type': 'application/octet-stream'}
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Request failed (${response.status}).`);
        }
        return response;
    }
    backup.addEventListener('click', async () => {
        busy(true);
        status.textContent = 'Preparing complete backup…';
        try {
            const response = await request('backup');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'enrichment-backup.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            status.textContent = 'Backup download started. Keep the file somewhere safe.';
        } catch (error) { status.textContent = error.message; }
        finally { busy(false); }
    });
    restore.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        if (file.size > 128 * 1024 * 1024) { status.textContent = 'Backup exceeds the 128 MiB limit.'; return; }
        if (!confirm(`Restore "${file.name}"? This replaces ALL current data with the backup. Changes made since the backup will be lost. Continue only if you have saved a current backup.`)) return;
        busy(true);
        status.textContent = 'Restoring all data. Please keep this page open…';
        try {
            await request('restore', file);
            alert('Restore complete. All data has been restored. The page will now reload.');
            location.reload();
        } catch (error) { status.textContent = error.message; }
        finally { busy(false); }
    });
})();
