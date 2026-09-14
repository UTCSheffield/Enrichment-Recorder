#!/bin/sh
# Run from the existing production checkout after verifying a database backup.
set -eu
cd "$(dirname "$0")/.."
docker compose build app
# Compare the serving container and migration container using read-only PDO probes.
# Do not load the old Database helper: old versions ran schema writes on connection.
probe=' $db = new PDO("mysql:host=".getenv("DB_HOST").";dbname=".getenv("DB_NAME").";charset=utf8mb4", getenv("DB_USER"), getenv("DB_PASS"), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo json_encode($db->query("SELECT @@server_uuid, DATABASE()")->fetch(PDO::FETCH_NUM)); $db->query("SELECT id FROM students LIMIT 0"); '
running_target=$(docker compose exec -T app php -r "$probe") || {
    echo 'UPGRADE STOPPED: the running app cannot read its original students table. No migration or restart was attempted. The original database/volume must be reconnected, or its verified backup restored.' >&2
    exit 1
}
migration_target=$(docker compose run --rm --no-deps app php -r "$probe")
if [ "$running_target" != "$migration_target" ]; then
    echo 'UPGRADE STOPPED: the running app and migration point to different databases. Keep the original database settings and Docker volume. No migration or restart was attempted.' >&2
    exit 1
fi
docker compose stop app
# Every subsequent command must succeed; failures leave the app stopped.
verification_dir=$(mktemp -d)
trap 'rm -rf "$verification_dir"' EXIT HUP INT TERM
chmod 700 "$verification_dir"
docker compose run --rm --no-deps app php scripts/database-fingerprint.php > "$verification_dir/before.json"
docker compose run --rm --no-deps app php scripts/migrate.php
docker compose run --rm --no-deps -v "$verification_dir:/upgrade-verification:ro" app php scripts/database-fingerprint.php /upgrade-verification/before.json
docker compose up -d --no-build app
