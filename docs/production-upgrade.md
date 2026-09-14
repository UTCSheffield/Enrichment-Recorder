# Upgrade an existing production installation

This release supports upgrades from the older MySQL schema, including releases before student year groups and per-activity mandatory flags/notes. The migration adds missing tables and columns, and widens the old department field if needed. It never drops tables, deletes records, renumbers IDs, or resets existing field values. Existing activities default to the normal Activities view; Events starts empty. Already-recorded demographic values and whole-school data are preserved.

This is deployment guidance, not a record of a production deployment. Test a restored production backup first: historical-schema fixture tests cannot establish the contents or customisations of your actual production database.

## The only new `.env` setting

Add this to the existing production `.env`, replacing the example text with a strong unique password:

```dotenv
SUPER_ADMIN_PASSWORD=replace-with-a-unique-super-admin-password
```

An empty or absent value disables Super Admin login. It must differ from `ADMIN_PASSWORD`, `HEAD_OF_SUBJECT_PASSWORD`, and `TEACHER_PASSWORD`; a collision causes login configuration to be rejected. The new Compose file passes this value to PHP. Recreate the app container after changing it; a container restart alone does not load new environment variables.

Keep all existing values for `AUTH_SECRET`, the other role passwords, `PORT`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, and `MYSQL_ROOT_PASSWORD`. Do not replace `.env` with `.env.example`. In particular, changing database settings does not migrate data and can point the app at another database. Preserve the existing Compose project name and database volume. Do not use `docker compose down -v` or remove the database volume.

## Rehearse first

Restore a verified production SQL backup into an isolated MySQL instance and use separate credentials/Compose settings. Capture normal reports, run the following fingerprint/migration/verification procedure there, and compare the reports afterwards. Verify both present and absent marks, assignment notes and mandatory flags, student details, settings and all four roles. Test a second migration run. Keep this rehearsal separate from the running production database.

## Docker upgrade sequence

Use the existing production checkout and Compose project. Resolve any local code modifications before pulling; `.env` is ignored by Git and remains local.

1. Add the new password to the existing `.env`. Pull and build the release while the old container is still serving:

   ```sh
   git pull --ff-only
   docker compose build app
   ```

2. Start the maintenance window, pause every writer, and back up the existing database. Run this and the following snippets in the same shell. `set -e` stops the sequence if a command fails.

   ```sh
   set -eu
   docker compose stop app
   upgrade_backup="$HOME/enrichment-backups/$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$upgrade_backup"
   chmod 700 "$upgrade_backup"
   umask 077
   docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces "$MYSQL_DATABASE"' > "$upgrade_backup/database.sql"
   test -s "$upgrade_backup/database.sql"
   docker compose run --rm --no-deps app php scripts/database-fingerprint.php > "$upgrade_backup/before.json"
   ```

   The file-size check only detects an empty dump. Verify restoration in the isolated environment before proceeding. Keep the database dump and the existing production `.env` securely outside the repository.

3. Apply the migration and verify that every original column and row remains identical. The fingerprint script stores only column names, counts and hashes, not student values:

   ```sh
   docker compose run --rm --no-deps app php scripts/migrate.php
   docker compose run --rm --no-deps -v "$upgrade_backup:/upgrade-backup:ro" app php scripts/database-fingerprint.php /upgrade-backup/before.json
   ```

4. Confirm a second migration run leaves the complete migrated data unchanged:

   ```sh
   docker compose run --rm --no-deps app php scripts/database-fingerprint.php > "$upgrade_backup/after-first.json"
   docker compose run --rm --no-deps app php scripts/migrate.php
   docker compose run --rm --no-deps app php scripts/database-fingerprint.php > "$upgrade_backup/after-second.json"
   cmp "$upgrade_backup/after-first.json" "$upgrade_backup/after-second.json"
   ```

5. Only after successful verification, start the new app:

   ```sh
   docker compose up -d --no-build app
   docker compose logs --tail=100 app
   ```

   Check existing Activities and their reports against the baseline, all role logins, and Super Admin's Events view before reopening writes. Retain the backups.

If a migration or verification fails, keep writes paused and investigate. MySQL schema changes can commit individually; the migration is rerunnable to complete missing additions. Do not restore a database over newer writes or remove added columns as a quick rollback. Once event or whole-school records exist, older apps may expose or mutate them incorrectly: use a forward fix or a coordinated application/database restore. See [rollback details](whole-school-deployment.md#rollback).

## Non-Docker installation

With writes paused and a verified SQL backup, install the new code, retain the original database configuration, and run `php scripts/migrate.php` from the project directory before serving the new code. The same fingerprint commands work directly with PHP. Ensure the CLI and web server use the same database environment; `.env` loading does not override existing environment variables. Configure `SUPER_ADMIN_PASSWORD` in the environment used by the PHP web process, and reload that process if needed.

## Missing `enrichment_db.students` after an attempted upgrade

The former short chat instructions listed independent commands, so the new app could start even after a failed migration. That is not a successful upgrade. The migration creates `students` as its first base-table operation; a missing table in the running application therefore cannot be explained by that migration having completed successfully against the same, unchanged database.

After a verified backup, `sh scripts/upgrade.sh` is the guarded upgrade path. It compares the running app's actual MySQL server/database with the proposed migration target, requires the original students table, pauses the app, migrates, checks original-record fingerprints, and starts only after success. It deliberately stops when the original students table is absent; creating an empty replacement would hide the problem rather than recover student records.

If the table is absent, reconnect the original database/Compose volume or restore the verified pre-upgrade backup into the intended database with writes paused. Which of these is appropriate depends on the production deployment; a browser screenshot cannot establish whether the volume was changed or data was lost. Do not use `--initialize` to repair production. That option now only permits a genuinely empty, new installation.
