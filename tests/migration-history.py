#!/usr/bin/env python3
"""Exercise real historical MySQL schemas in an exclusively disposable database."""
import json, subprocess, tempfile
from pathlib import Path
CONTAINER='er-migration-history'
def cmd(*args,input=None): return subprocess.check_output(args,input=input,text=True,stderr=subprocess.STDOUT)
def sql(statement): return cmd('docker','compose','exec','-T','db','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot',input=statement)
def php(code): return cmd('docker','exec','-i',CONTAINER,'php',input='<?php\n'+code)
try:
    sql('DROP DATABASE IF EXISTS er_migration_history; CREATE DATABASE er_migration_history;')
    cmd('docker','compose','exec','-T','db','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "GRANT ALL ON er_migration_history.* TO \'$MYSQL_USER\'@\'%\';"')
    cmd('docker','compose','run','-d','--no-deps','--name',CONTAINER,'-e','DB_NAME=er_migration_history','app')
    # An upgrade must never silently replace a missing production students table.
    try:
        cmd('docker','exec',CONTAINER,'php','scripts/migrate.php')
        raise AssertionError('Empty production database accepted')
    except subprocess.CalledProcessError as error:
        assert 'UPGRADE STOPPED' in error.output
    assert json.loads(cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php'))==[]
    cmd('docker','exec',CONTAINER,'php','scripts/migrate.php','--initialize')
    sql('USE er_migration_history; DROP TABLE students;')
    missing_before=cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php')
    try:
        cmd('docker','exec',CONTAINER,'php','scripts/migrate.php')
        raise AssertionError('Missing students silently replaced')
    except subprocess.CalledProcessError as error:
        assert 'UPGRADE STOPPED' in error.output
    assert missing_before==cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php')
    print('PASS: empty/missing-students upgrades stop without changes; explicit fresh installation works')
    for revision in ['aba7fc7','7b779e8','38ccfaa','d5049ef']:
        sql('DROP DATABASE er_migration_history; CREATE DATABASE er_migration_history;')
        with tempfile.TemporaryDirectory() as directory:
            legacy=Path(directory)/'legacy.php'; legacy.write_text(cmd('git','show',revision+':src/Database.php'))
            cmd('docker','cp',str(legacy),CONTAINER+':/tmp/legacy.php')
        php(r'''
require '/tmp/legacy.php'; $db=App\Database::getConnection();
$db->exec("INSERT INTO students (id,name) VALUES (7,'O’Neill, Original'),(19,'Second Student')");
$db->exec("INSERT INTO activities (id,name,sessions_per_week) VALUES (4,'Original activity',2)");
$db->exec("INSERT INTO attendance (student_id,activity_id,week_start,session_index,present) VALUES (7,4,'2026-06-01',1,1),(7,4,'2026-06-01',2,0)");
if ($db->query("SHOW TABLES LIKE 'activity_students'")->fetchColumn()) {
    $db->exec('INSERT INTO activity_students (activity_id,student_id) VALUES (4,7)');
    if($db->query("SHOW COLUMNS FROM activity_students LIKE 'note'")->fetch()) $db->exec("UPDATE activity_students SET note='Original note',mandatory=1");
}
if($db->query("SHOW TABLES LIKE 'settings'")->fetchColumn())$db->exec("INSERT INTO settings VALUES ('fixture','Original setting')");
''')
        before=cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php')
        cmd('docker','exec','-i',CONTAINER,'sh','-c','cat > /tmp/baseline.json',input=before)
        cmd('docker','exec',CONTAINER,'php','scripts/migrate.php')
        cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php','/tmp/baseline.json')
        first=cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php')
        schema=php("require 'src/Database.php';$db=App\\Database::getConnection(false);foreach($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t)echo json_encode($db->query('SHOW CREATE TABLE `'.$t.'`')->fetch());")
        cmd('docker','exec',CONTAINER,'php','scripts/migrate.php')
        assert first==cmd('docker','exec',CONTAINER,'php','scripts/database-fingerprint.php')
        assert schema==php("require 'src/Database.php';$db=App\\Database::getConnection(false);foreach($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t)echo json_encode($db->query('SHOW CREATE TABLE `'.$t.'`')->fetch());")
        result=json.loads(php("require 'src/Database.php';require 'src/Model/Attendance.php';$db=App\\Database::getConnection(false);echo json_encode(App\\Model\\Attendance::getGlobalStats($db));"))
        assert result['students']=={'7':1} and result['activities']=={'4':1}
        print('PASS '+revision+': original records preserved; schema/data stable on rerun; normal attendance totals preserved')
finally:
    subprocess.run(['docker','rm','-f',CONTAINER],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    sql('DROP DATABASE IF EXISTS er_migration_history;')
