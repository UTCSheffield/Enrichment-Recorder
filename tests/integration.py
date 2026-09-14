#!/usr/bin/env python3
"""Disposable MySQL/API regression suite. Run after `docker compose build app`.
KEEP_TEST_APP=1 retains the fixture app at localhost:8081 for browser QA.
"""
import http.cookiejar
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request

DB = 'er_feature_test'
CONTAINER = 'er-feature-test'
BASE = 'http://localhost:8081/'

def command(*args, input=None):
    return subprocess.check_output(args, input=input, text=True, stderr=subprocess.STDOUT)

def db_sql(sql):
    return command('docker', 'compose', 'exec', '-T', 'db', 'sh', '-c',
                   'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot', input=sql)

def php(code):
    return command('docker', 'exec', '-i', CONTAINER, 'php', input='<?php\n' + code)

class Client:
    def __init__(self, role=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if role:
            self.opener.open(BASE+'?action=auth_login', urllib.parse.urlencode({'password':'qa-'+role}).encode()).read()
    def request(self, action, post=False, status=200, **data):
        url = BASE + '?action=' + action
        body = urllib.parse.urlencode(data).encode() if post else None
        if not post: url += '&' + urllib.parse.urlencode(data)
        try:
            response = self.opener.open(url, body)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read().decode()
        assert response.code == status, (action, response.code, raw)
        result = json.loads(raw)
        if status == 200: assert 'error' not in result, result
        return result

try:
    # This fixed database is exclusively owned by this test suite.
    db_sql("DROP DATABASE IF EXISTS er_feature_test; CREATE DATABASE er_feature_test;")
    command('docker','compose','exec','-T','db','sh','-c',
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "GRANT ALL ON er_feature_test.* TO \'$MYSQL_USER\'@\'%\';"')
    command('docker','compose','run','-d','--no-deps','--name',CONTAINER,
            '-p','127.0.0.1:8081:80','-e','DB_NAME='+DB,'-e','SUPER_ADMIN_PASSWORD=qa-super',
            '-e','ADMIN_PASSWORD=qa-admin','-e','HEAD_OF_SUBJECT_PASSWORD=qa-head',
            '-e','TEACHER_PASSWORD=qa-teacher','app')
    php(r"""
require 'src/Database.php';
$db = App\Database::getConnection();
$db->exec("INSERT INTO students (id,name,year_group) VALUES (1,'Legacy Student',9),(2,'Year Ten',10),(3,'Year Eleven',11)");
$db->exec("INSERT INTO activities (id,name,description,department,sessions_per_week,has_mandatory) VALUES (1,'Legacy activity','Keep description','Science',2,1)");
$db->exec("INSERT INTO activity_students VALUES (1,1,1,'Keep note')");
$db->exec("INSERT INTO attendance (id,student_id,activity_id,week_start,session_index,present) VALUES (1,1,1,'2026-09-07',1,1)");
$db->exec("INSERT INTO settings VALUES ('fixture','Keep setting')");
""")
    snapshot = "require 'src/Database.php'; $db=App\\Database::getConnection(false); foreach (['students','activities','activity_students','attendance','settings'] as $table) { $rows=$db->query('SELECT * FROM '.$table)->fetchAll(); foreach ($rows as &$row) { unset($row['scope'], $row['all_students_mandatory'], $row['pp'], $row['fsm_ever'], $row['gender'], $row['sen_status'], $row['event_date'], $row['event_rules']); } unset($row); echo json_encode($rows); }"
    before = php(snapshot)
    print(command('docker','exec',CONTAINER,'php','scripts/migrate.php').strip())
    assert before == php(snapshot), 'Migration altered legacy records'
    first = php("require 'src/Database.php'; $db=App\\Database::getConnection(false); foreach (['students','activities','activity_students','attendance','settings','activity_year_groups','event_participants','event_attendance','archived_students'] as $table) echo json_encode($db->query('SELECT * FROM '.$table)->fetchAll());")
    command('docker','exec',CONTAINER,'php','scripts/migrate.php')
    second = php("require 'src/Database.php'; $db=App\\Database::getConnection(false); foreach (['students','activities','activity_students','attendance','settings','activity_year_groups','event_participants','event_attendance','archived_students'] as $table) echo json_encode($db->query('SELECT * FROM '.$table)->fetchAll());")
    assert first == second, 'Migration changed data on second run'
    superadmin, admin, head, teacher = [Client(role) for role in ['super','admin','head','teacher']]
    Client().request('get_state', status=401)
    legacy = admin.request('get_state')['activities'][0]
    assert legacy['scope']=='normal' and legacy['id']==1 and legacy['description']=='Keep description'
    assert legacy['student_meta']['1']=={'mandatory':1,'note':'Keep note'}
    assert admin.request('get_stats')['stats']['students']=={'1':1}
    assert superadmin.request('get_state',scope='whole_school')['activities']==[]
    for client in [admin,head,teacher]:
        client.request('get_state',scope='whole_school',status=403)
    from datetime import date, timedelta
    today = superadmin.request('get_state')['today']
    future = (date.fromisoformat(today) + timedelta(days=2)).isoformat()
    past = (date.fromisoformat(today) - timedelta(days=2)).isoformat()
    # Seed legacy records directly, then snapshot with the explicit migration.
    php(r"""
require 'src/Database.php'; $db=App\Database::getConnection(false);
$db->exec("INSERT INTO activities (id,name,scope,sessions_per_week,department,has_mandatory) VALUES (2,'Archived Assembly','whole_school',2,'Science',1)");
$db->exec("INSERT INTO activity_students VALUES (2,1,1,'Archive note')");
$db->exec("INSERT INTO attendance (student_id,activity_id,week_start,session_index,present) VALUES (1,2,'2026-09-07',1,1)");
""")
    command('docker','exec',CONTAINER,'php','scripts/migrate.php')
    def archive(): return superadmin.request('get_state',scope='whole_school')
    archived = archive()
    assert archived['activities'][0]['recorded_weeks']==['2026-09-07']
    for action,data in [('create_activity',{}),('update_activity',dict(id=2)),('delete_activity',dict(id=2)),('toggle_attendance',dict(activity_id=2,student_id=1)),('update_activity_student',dict(activity_id=2,student_id=1)),('update_student',dict(activity_id=2,id=1)),('delete_student',dict(id=1)),('import_students',dict(rows='[]')),('save_setting',dict(k='x',v='y'))]:
        superadmin.request(action,post=True,status=403,scope='whole_school',**data)
    school = dict(scope='event',name='Assembly',description='One time',department='Science',event_date=future,year_groups='9,10',mandatory_year_groups='9',manual_student_ids='2')
    aid = superadmin.request('create_activity',post=True,**school)['id']
    def activity(): return next(a for a in superadmin.request('get_state',scope='event')['activities'] if a['id']==aid)
    assert sorted(activity()['student_ids'])==[1,2]
    assert activity()['student_meta']['1']['mandatory']==1 and activity()['student_meta']['2']['mandatory']==0
    for client in [admin,head,teacher]:
        client.request('get_state',scope='event',status=403)
        for action, post, data in [
            ('get_attendance',False,dict(activity_id=aid)),('get_activity_stats',False,dict(id=aid)),
            ('get_activity_export',False,dict(id=aid)),('update_activity',True,dict(id=aid)),
            ('delete_activity',True,dict(id=aid)),('toggle_attendance',True,dict(activity_id=aid,student_id=1)),
            ('update_activity_student',True,dict(activity_id=aid,student_id=1)),
            ('update_student',True,dict(activity_id=aid,id=1,name='Forbidden',year_group=9))]:
            client.request(action,post=post,status=403,**data)
    def edit(**fields): return superadmin.request('update_activity',post=True,scope='event',id=aid,**fields)
    def invalid(**fields): return superadmin.request('update_activity',post=True,status=400,scope='event',id=aid,**fields)
    invalid(mandatory_year_groups='11'); invalid(included_student_ids='3'); invalid(included_student_ids='1',excluded_student_ids='1')
    invalid(event_date='2026-02-30'); invalid(year_groups=''); invalid(student_ids='1')
    superadmin.request('update_activity_student',post=True,status=400,scope='event',activity_id=aid,student_id=1,mandatory=0)
    superadmin.request('toggle_attendance',post=True,status=400,scope='event',activity_id=aid,student_id=1,session_index=2,present=1)
    superadmin.request('update_activity_student',post=True,scope='event',activity_id=aid,student_id=1,note='Event note')
    superadmin.request('toggle_attendance',post=True,scope='event',activity_id=aid,student_id=1,present=1)
    edit(excluded_student_ids='1',included_student_ids='2')
    assert activity()['student_meta']['1']==dict(mandatory=0,note='Event note')
    assert activity()['student_meta']['2']['mandatory']==1
    edit(excluded_student_ids='',included_student_ids='1',mandatory_year_groups='')
    assert activity()['student_meta']['1']['mandatory']==1
    edit(included_student_ids='',mandatory_year_groups='9')
    sid=admin.request('create_student',post=True,name='New Joiner',year_group=9)['id']
    assert sid in activity()['student_ids']
    admin.request('update_student',post=True,id=sid,name='New Joiner',year_group=11)
    assert sid not in activity()['student_ids']
    edit(event_date=past)
    frozen=activity()['participants']
    admin.request('update_student',post=True,id=1,name='Changed Directory',year_group=10)
    assert activity()['participants']==frozen
    edit(description='Description only')
    assert activity()['participants']==frozen
    edit(mandatory_year_groups='10')
    assert next(p for p in activity()['participants'] if p['id']==1)['name']=='Changed Directory'
    edit(event_date=today)
    admin.request('update_student',post=True,id=1,name='Legacy Student',year_group=9)
    assert 1 in activity()['student_ids'] and activity()['student_meta']['1']['mandatory']==0
    assert superadmin.request('get_student_stats',scope='event',id=1)['stats']['total']==1
    edit(mandatory_year_groups='9')
    assert activity()['student_meta']['1']['note']=='Event note'
    assert superadmin.request('get_attendance',scope='event',activity_id=aid)['attendance']['1']['1']==1
    edit(event_date=future)
    assert superadmin.request('get_student_stats',scope='event',id=1)['stats']['history'][0]['date']==future
    # All eligible students stay enrolled when no years are mandatory.
    edit(mandatory_year_groups='',manual_student_ids='1')
    assert sorted(activity()['student_ids'])==[1,2]
    assert all(not p['mandatory'] for p in activity()['participants'] if p['active'])
    for scope in ['normal','whole_school','event']:
        assert superadmin.request('get_stats',scope=scope)['stats']['students']=={'1':1}
        assert superadmin.request('get_student_stats',scope=scope,id=1)['stats']['total']==1
        for action,data in [('get_year_group_export',dict(year_group=9)),('get_department_export',dict(department='Science')),('get_export_stats',{})]:
            rows=superadmin.request(action,scope=scope,**data)['data']
            assert len(rows)==1, (action,rows)
            assert int(rows[0].get('count',rows[0].get('total_attended_all_time',0)))==1
    # Deleting a directory record preserves both event and archive history.
    dead=admin.request('create_student',post=True,name='Leaving Student',year_group=9)['id']
    edit(manual_student_ids=f'1,{dead}')
    superadmin.request('toggle_attendance',post=True,scope='event',activity_id=aid,student_id=dead,present=1)
    admin.request('delete_student',post=True,id=dead)
    assert superadmin.request('get_student_stats',scope='event',id=dead)['stats']['total']==1
    assert next(p for p in activity()['participants'] if p['id']==dead)['active']==0
    assert archive()['students']==archived['students'] and archive()['activities']==archived['activities']
    command('docker','exec',CONTAINER,'php','scripts/migrate.php')
    assert archive()['students']==archived['students']
    assert admin.request('get_state')['activities']==[legacy]
    superadmin.request('get_state',scope='invalid',status=400)
    assert php("require 'src/Model/Event.php'; echo App\\Model\\Event::today(new DateTimeImmutable('2026-06-01T23:30:00Z'));").strip()=='2026-06-02'
    auth_checks = php(r"""
require 'src/Auth.php';
putenv('SUPER_ADMIN_PASSWORD=');
if (App\Auth::login('qa-super') !== null) throw new RuntimeException('Unset super login enabled');
putenv('SUPER_ADMIN_PASSWORD=qa-admin');
try { App\Auth::login('qa-admin'); throw new Exception('Collision accepted'); }
catch (RuntimeException $e) { echo 'Collision rejected'; }
""")
    assert 'Collision rejected' in auth_checks
    # Normal role capabilities and Super Admin inheritance.
    nid=head.request('create_activity',post=True,name='Head activity',sessions_per_week=1,student_ids='1')['id']
    teacher.request('update_activity',post=True,id=nid,student_ids='1,2')
    teacher.request('create_activity',post=True,status=403,name='Denied')
    teacher.request('get_stats',status=403)
    superadmin.request('save_setting',post=True,k='qa',v='ok')
    assert superadmin.request('get_settings')['settings']
    # Nullable characteristics, partial edits and import semantics.
    def students(): return admin.request('get_students')['students']
    def student(sid): return next(s for s in students() if s['id']==sid)
    assert all(student(1)[field] is None for field in ['pp','fsm_ever','gender','sen_status'])
    admin.request('update_student',post=True,id=1,name='Legacy Student',year_group=9,pp='T',fsm_ever='F',gender='O',sen_status='Special Educational Needs')
    assert {key:student(1)[key] for key in ['pp','fsm_ever','gender','sen_status']} == dict(pp=1,fsm_ever=0,gender='O',sen_status='sen')
    admin.request('update_student',post=True,id=1,name='Legacy Student',year_group=9)
    assert student(1)['pp']==1 and student(1)['sen_status']=='sen'
    admin.request('update_student',post=True,id=1,name='Legacy Student',year_group=9,pp='',sen_status='')
    assert student(1)['pp'] is None and student(1)['sen_status'] is None
    for client in [head,teacher]:
        client.request('update_student',post=True,id=1,activity_id=nid,name='Legacy Student',year_group=9,pp='F',gender='F')
        client.request('update_student',post=True,status=403,id=3,activity_id=nid,name='Year Eleven',year_group=11,pp='T')
        client.request('import_students',post=True,status=403,rows='[]')
    for field,value in [('pp','yes'),('fsm_ever','unknown'),('gender','X'),('sen_status','maybe')]:
        admin.request('update_student',post=True,status=400,id=1,name='Legacy Student',year_group=9,**{field:value})
    auto=superadmin.request('create_activity',post=True,scope='event',name='Import register',event_date=future,year_groups='9',mandatory_year_groups='9')['id']
    existing=student(1).copy()
    batch=[
        dict(name='Legacy Student',year_group=9,pp=' t ',fsm_ever='f',gender='m',sen_status='No Special Educational Need'),
        dict(name='Import Singular',year_group='y9',pp='F',fsm_ever='T',gender='F',sen_status='Special Educational Need'),
        dict(name='Import Plural',year_group='year 10',pp='T',fsm_ever='F',gender='O',sen_status='Special Educational Needs'),
        dict(name='Import No Plural',year_group=9,sen_status='No Special Educational Needs'),
        dict(name='Import Blank',year_group=9,pp='',fsm_ever='',gender='',sen_status=''),
        dict(name='Import Missing',year_group=9),
    ]
    before=len(students())
    # A database failure after the first insert must roll back the whole batch.
    db_sql("USE er_feature_test;\nDELIMITER //\nCREATE TRIGGER reject_fixture BEFORE INSERT ON students FOR EACH ROW BEGIN IF NEW.name = 'Reject Fixture' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Fixture insertion failure'; END IF; END//\nDELIMITER ;\n")
    try:
        admin.request('import_students',post=True,status=400,rows=json.dumps([dict(name='Rollback First',year_group=9),dict(name='Reject Fixture',year_group=9)]))
        assert len(students())==before
    finally:
        db_sql('USE er_feature_test; DROP TRIGGER reject_fixture;')
    invalid=batch+[dict(row_number=18,name='Invalid Last',year_group=9,gender='X')]
    error=admin.request('import_students',post=True,status=400,rows=json.dumps(invalid))
    assert 'Row 18' in error['error'] and len(students())==before
    assert admin.request('import_students',post=True,rows=json.dumps(batch))['created']==6
    assert len(students())==before+6 and student(1)==existing
    imported=students()
    blank=next(s for s in imported if s['name']=='Import Blank')
    missing=next(s for s in imported if s['name']=='Import Missing')
    assert blank['sen_status']=='none' and missing['sen_status'] is None and blank['pp'] is None
    register=next(a for a in superadmin.request('get_state',scope='event')['activities'] if a['id']==auto)
    assert blank['id'] in register['student_ids'] and missing['id'] in register['student_ids']
    superadmin.request('import_students',post=True,rows=json.dumps([dict(name='Super Import',year_group=9,gender='O')]))
    assert admin.request('get_stats')['stats']['students']=={'1':1}
    print('PASS: student characteristics, preservation/clearing, SEN variants, create-only atomic imports, permissions and roster synchronization')
    print('PASS: migration preservation/idempotency, role/API boundaries, event rules, frozen registers, rescheduling, archive immutability, historical attendance, scoped reports, inherited permissions')
    print('Test app retained at '+BASE if os.getenv('KEEP_TEST_APP') else 'Removing disposable test app and database')
finally:
    if not os.getenv('KEEP_TEST_APP'):
        subprocess.run(['docker','rm','-f',CONTAINER],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        db_sql('DROP DATABASE IF EXISTS er_feature_test;')
