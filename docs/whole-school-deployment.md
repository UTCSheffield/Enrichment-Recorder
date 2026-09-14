# Events and archived whole-school activities: deployment and migration

Super Admin uses the existing login page with `SUPER_ADMIN_PASSWORD`. Leave it empty to disable the new login. Set a distinct password; sharing a password with any other role causes login configuration to be rejected. Keep `AUTH_SECRET` unchanged to preserve existing sessions.

Recurring Activities and one-time Events share the school directory and settings. Events and the read-only whole-school archive are Super Admin only. Lists, attendance statistics, histories, and exports remain separate for all three scopes. Activities retain their existing permissions and weekly registers.

## Local installation

```sh
docker compose build app
docker compose run --rm --no-deps app php scripts/migrate.php --initialize
docker compose up -d app
```

Set `SUPER_ADMIN_PASSWORD` in `.env`, then recreate the app with `docker compose up -d app`. The password is passed through the container environment; `.env` is excluded from the application image.

The migration initializes the existing base schema for a new database, then adds `activities.scope` (default `normal`), `activities.all_students_mandatory` (default `0`), and `activity_year_groups`. It is CLI-only and rerunnable. Web requests never run this migration. It preserves existing IDs and values. It also adds nullable student characteristics, nullable event_date/event_rules, event_participants and event_attendance, and archived_students snapshots. Existing whole_school rows remain in that scope and become read-only; they are never converted into dated events. Events start empty. Snapshot insertion uses INSERT IGNORE, so rerunning does not refresh or replace archived names or years.

## Production rehearsal — required before deployment

Use an isolated MySQL instance restored from a recent production backup, with its own Compose configuration and credentials. Never run the regression fixture against production. The repository does not contain a production backup, so automated fixture tests are not a substitute for this rehearsal.

1. Restore the backup and verify restoration succeeds. Save table row counts and exports from the current application, including per-student, weekly, department, and year-group totals.
2. Capture existing table data, ordered by primary key. Compare each table using the columns present before migration, excluding newly added columns from the after snapshot.
3. Build the new app and run `php scripts/migrate.php` against the restored database.
4. Compare all original IDs and values in students, activities, activity_students, attendance, and settings. Existing scopes, assignments, notes, flags, demographic values, attendance and settings must remain identical. On older installations, newly added scope defaults to normal and characteristics default to NULL. Check archive snapshots against associated student records, including students with attendance but no current assignment.
5. Run the migration again and compare schema and data. There must be no additional change.
6. Run all four login smoke tests. Normal reports and exports must match the saved baseline. Super Admin's Events view must initially be empty; prior whole-school activities must remain read-only with their original weeks and sessions (the archive navigation is currently hidden).
7. Create an event; test eligible/mandatory years, manual assignment, individual inclusions/exclusions, notes and attendance. Test same-day/future synchronization, past-date freezing, descriptive edits, explicit roster edits and rescheduling. Verify imports and student deletions preserve historical attendance. Check date-based event reports against the marked fixture and ensure Activities and archive totals remain unchanged.

For the copy-and-run production upgrade sequence and exact `.env` delta, see [production-upgrade.md](production-upgrade.md).

## Production deployment

Use a maintenance window and pause app writes before taking the final backup. Build the new image before stopping the running service. Store backups outside the repository and image build context.

```sh
docker compose build app
docker compose stop app
mkdir -p "$HOME/enrichment-backups"
chmod 700 "$HOME/enrichment-backups"
(umask 077; docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces "$MYSQL_DATABASE"' > "$HOME/enrichment-backups/before-events.sql")
```

Verify the dump command succeeded and verify restoration in the isolated environment. Configure the distinct production `SUPER_ADMIN_PASSWORD`, then:

```sh
docker compose run --rm --no-deps app php scripts/migrate.php
docker compose up -d app
```

If migration fails, keep the app in maintenance until the cause is resolved. MySQL DDL can commit individual changes; rerunning the migration safely completes any remaining additions.

Before reopening writes, check normal report totals against the baseline, all four logins, existing attendance marking, Super Admin settings access, and event creation. Confirm direct event and archive API requests receive 403 for the other three roles. Inspect `docker compose logs --tail=100 app db` for errors and verify that a failed save has not partially changed a roster.

## Rollback

The schema is additive, but older app versions do not understand Events or archive immutability. Once whole-school or event records exist, use a forward fix or a coordinated database/application restore. An older version may expose mixed scopes, permit archive edits or synchronize archived registers incorrectly. Do not blindly deploy it against this database.

Only when neither whole-school nor event records exist can an older app use the additive schema unchanged. Leave the new tables/columns in place. A coordinated restore requires another write pause and an explicit decision about preserving or reconciling changes made since the backup.

## Regression suite

```sh
docker compose build app
python3 tests/integration.py
```

The suite uses the running Compose database service, creates an exclusively test-owned `er_feature_test` database, and starts an isolated app on port 8081 with fixture passwords. It tests migration preservation and idempotency, access boundaries, roster changes, attendance history, reports, and existing role permissions. It removes its container/database on completion. Do not run concurrent copies. `KEEP_TEST_APP=1` retains the fixture for browser checks; afterward remove `er-feature-test` and drop only `er_feature_test`.


## Student characteristics update

The same `scripts/migrate.php` command also adds nullable `students.pp`, `fsm_ever`, `gender`, and `sen_status`. Existing students retain every original value and receive NULL (Not recorded) in the new fields. Rehearse and deploy using the backup/write-pause procedure above. Compare original student columns separately from the new columns, verify all new values are NULL on existing records, and rerun the migration to verify idempotency. This change does not alter attendance reports.

Student forms allow Not recorded, PP/FSM True or False, gender Female/Male/Other, and SEN none/needs. Admin and Super Admin can create/import and edit globally. Heads and Teachers can edit assigned students only through an activity they can access. An API update omitting a characteristic preserves it; an empty manual-form value clears it.

CSV uploads are create-only and show a mapping/preview before importing. The importer never matches or updates existing students; importing the same file twice creates duplicates. Header names PP, FSM, GENDER, SEN, common name headers, and Year Group are automatically recognised regardless of case/whitespace. Select another source column in the preview if needed. Map Full name OR both First name and Last name. Full names containing a comma are interpreted as Surname, First name. For other combined names, select the displayed name order. Headerless legacy files retain surname-first order and Year 9 when no year column is mapped. Quotes, escaped quotes, embedded commas/newlines, apostrophes, and UTF-8 BOMs are supported without changing name capitalisation.

PP/FSM accept T/F (case-insensitive); blank means Not recorded. Gender accepts F/M/O; blank means Not recorded. SEN accepts both singular and plural “No Special Educational Need(s)” and “Special Educational Need(s)”, ignoring case and surrounding whitespace. A blank mapped SEN cell means no needs, while an unmapped SEN column means Not recorded. Invalid values or missing mapped cells reject the entire import with a row-specific error. The import saves all rows and synchronizes upcoming and same-day event registers in one transaction. On a lost network response, check the student list before retrying.

Run `node tests/student-csv.cjs` for parser/mapping checks and `python3 tests/integration.py` for migration, student characteristics, import atomicity, permissions, and roster checks.

## Event register lifecycle

The event date is a Europe/London calendar date. Each event/student has one attendance record, independent of date; rescheduling cannot duplicate marks. Eligible years automatically enrol every student, including optional attendees. Mandatory years determine the attendance obligation; inclusions are mandatory; exclusions make students optional while retaining their place. Every rule is limited to eligible years.

Upcoming and same-day registers synchronize inside the transaction for student creation, import, year changes and deletion. Ineligible individual selections are removed from upcoming rules. Past registers retain saved participant names, years, mandatory status and notes, including deleted students. Descriptive edits alone do not recalculate them. Explicitly changing roster rules recalculates from the current school directory; moving a past event into the future resumes synchronization. Removed participants remain accessible through Show historical participants; their recorded attendance still contributes to reports.

Archive records never synchronize and every scoped write endpoint rejects them. Global student edits/deletions do not alter the archived snapshot, assignments or attendance. No historical weekly/session attendance is merged or assigned invented dates.

Additional checks: `node tests/event-rules.cjs`. Browser regression: set `KEEP_TEST_APP=1`, run `node tests/events-browser.cjs` with Playwright available (or set PLAYWRIGHT_MODULE to its module path). Test data stays isolated on port 8081. Clean up the retained test container/database afterwards. Production backup restoration and rehearsal remain a separate deployment step.

Historical schema checks: `python3 tests/migration-history.py` migrates real MySQL schemas from Git revisions `aba7fc7`, `7b779e8`, `38ccfaa`, and `d5049ef` in the disposable `er_migration_history` database. It verifies original-column hashes, normal attendance totals, and unchanged schema/data after a second run.
