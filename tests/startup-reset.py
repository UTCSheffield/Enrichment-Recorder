#!/usr/bin/env python3
"""Verify real Docker startup/reset using only an isolated test volume."""
import json, subprocess, tempfile, time
from pathlib import Path

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)

image = run('docker', 'compose', 'images', '-q', 'app').strip()
with tempfile.TemporaryDirectory() as directory:
    config = Path(directory) / 'compose.json'
    config.write_text(json.dumps({'services': {
        'db': {'image': 'mysql:8.0', 'environment': {'MYSQL_ROOT_PASSWORD': 'startup-test', 'MYSQL_DATABASE': 'startup_test'}, 'volumes': ['test_data:/var/lib/mysql']},
        'app': {'image': image, 'environment': {'DB_HOST': 'db', 'DB_NAME': 'startup_test', 'DB_USER': 'root', 'DB_PASS': 'startup-test'}, 'depends_on': ['db']}
    }, 'volumes': {'test_data': {}}}))
    base = ['docker', 'compose', '-p', 'er-startup-reset-test', '-f', str(config)]
    def compose(*args): return run(*base, *args)
    def php(code): return compose('exec', '-T', 'app', 'php', '-r', code)
    connect = "require 'src/Database.php'; $db=App\\Database::getConnection(false);"
    def ready():
        for _ in range(90):
            try:
                result = php("echo file_get_contents('http://127.0.0.1/');")
                if '<html' in result.lower(): return
            except subprocess.CalledProcessError: pass
            time.sleep(2)
        raise AssertionError(compose('logs'))
    try:
        for cycle in range(2):
            compose('up', '-d')
            ready()
            fingerprint = json.loads(compose('exec', '-T', 'app', 'php', 'scripts/database-fingerprint.php'))
            assert 'students' in fingerprint and 'event_attendance' in fingerprint
            assert {'pp','fsm_ever','gender','sen_status'} <= set(fingerprint['students']['columns'])
            assert fingerprint['students']['rows'] == 0
            php(connect + "$db->exec(\"INSERT INTO students(name) VALUES ('Preserve on restart')\");")
            before = compose('exec', '-T', 'app', 'php', 'scripts/database-fingerprint.php')
            compose('restart', 'app'); ready()
            assert before == compose('exec', '-T', 'app', 'php', 'scripts/database-fingerprint.php')
            print('PASS: fresh startup/reset creates complete schema; restart preserves data', flush=True)
            compose('down', '--volumes')
        # Startup must not silently migrate an existing, older database.
        compose('up', '-d'); ready()
        php(connect + "$db->exec('ALTER TABLE students DROP COLUMN pp');")
        before = compose('exec', '-T', 'app', 'php', 'scripts/database-fingerprint.php')
        compose('restart', 'app'); ready()
        assert before == compose('exec', '-T', 'app', 'php', 'scripts/database-fingerprint.php')
        print('PASS: existing schema is not automatically migrated', flush=True)
    finally:
        compose('down', '--volumes')
