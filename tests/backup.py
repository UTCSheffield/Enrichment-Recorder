#!/usr/bin/env python3
"""Run after KEEP_TEST_APP=1 python3 tests/integration.py. Uses its disposable database."""
import hashlib
import http.cookiejar
import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

BASE = 'http://localhost:8081/'

def php(code):
    return subprocess.check_output(['docker','exec','-i','er-feature-test','php'], input='<?php require "src/Database.php"; $db=App\\Database::getConnection(false); '+code, text=True)

class Client:
    def __init__(self, role=None):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if role:
            page = self.opener.open(BASE+'?action=auth_login', urllib.parse.urlencode({'password':'qa-'+role}).encode()).read().decode()
        else:
            page = self.opener.open(BASE).read().decode()
        token = re.search(r'window.__ER_BACKUP_TOKEN__ = "([a-f0-9]+)"', page)
        self.token = token[1] if token else ''
        assert ('id="backupBtn"' in page) == (role == 'super')
        assert ('id="restoreBtn"' in page) == (role == 'super')

    def call(self, action, body=b'', status=200, token=None, method='POST', confirm=True):
        headers = {'X-Backup-Token': self.token if token is None else token, 'Content-Type':'application/octet-stream'}
        if confirm: headers['X-Confirm-Restore']='replace-all-data'
        req=urllib.request.Request(BASE+'?action='+action, data=body if method=='POST' else None, headers=headers, method=method)
        try: response=self.opener.open(req)
        except urllib.error.HTTPError as error: response=error
        raw=response.read()
        assert response.code==status, (action, response.code, raw)
        return raw, response.headers

def repack(envelope, payload):
    envelope=dict(envelope)
    envelope['payload']=json.dumps(payload,ensure_ascii=False)
    envelope['sha256']=hashlib.sha256(envelope['payload'].encode()).hexdigest()
    return json.dumps(envelope).encode()

def snapshot(client):
    raw,_=client.call('backup')
    tables=json.loads(json.loads(raw)['payload'])['tables']
    for table in tables.values(): table['rows']=sorted(table['rows'], key=lambda r:json.dumps(r,sort_keys=True))
    return tables

superadmin=Client('super')
for role in [None,'admin','head','teacher']:
    client=Client(role)
    for action in ['backup','restore']: client.call(action,status=401 if role is None else 403)
for action in ['backup','restore']:
    superadmin.call(action,status=405,method='GET')
    superadmin.call(action,status=403,token='bad')
    superadmin.call(action,status=403,token='')
# Include Unicode, NULL, long text, quotes, multiline text, and an ID of zero.
php('''$db->exec("SET SESSION sql_mode='NO_AUTO_VALUE_ON_ZERO'");
$db->prepare('REPLACE INTO students (id,name,year_group) VALUES (0,?,9)')->execute(["Zero Ω 学生"]);
$db->exec("REPLACE INTO activity_year_groups (activity_id,year_group) VALUES (2,9)");
$db->prepare('REPLACE INTO settings (k,v) VALUES (?,?)')->execute(['backup-edge',str_repeat("Quote \\" and newline\\n Ω ",5000)]);''')
original,headers=superadmin.call('backup')
assert 'attachment;' in headers['Content-Disposition'] and headers['Cache-Control']=='no-store'
envelope=json.loads(original)
payload=json.loads(envelope['payload'])
expected=snapshot(superadmin)
assert len(expected)==9
assert all(t['rows'] for t in expected.values()), 'Fixture must cover every table'
# Change every table, restore and compare every column of every row.
php('foreach ($db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN) as $t) $db->exec("DELETE FROM `$t`");')
empty_file,_=superadmin.call('backup')
assert all(not table['rows'] for table in snapshot(superadmin).values())
superadmin.call('restore', original)
assert snapshot(superadmin)==expected
superadmin.call('restore', empty_file)
assert all(not table['rows'] for table in snapshot(superadmin).values())
superadmin.call('restore', original)
assert snapshot(superadmin)==expected
# Bad files and incompatibilities must not change any rows.
for bad in [b'',b'not json',b'{}',original[:-20],json.dumps(dict(envelope,sha256='0'*64)).encode()]:
    superadmin.call('restore',bad,status=400)
    assert snapshot(superadmin)==expected
superadmin.call('restore',original,status=400,confirm=False)
for kind in ['missing_table','schema','row','duplicate','invalid_type']:
    changed=json.loads(envelope['payload'])
    if kind=='missing_table': del changed['tables']['students']
    elif kind=='schema': changed['tables']['students']['schema']+=' changed'
    elif kind=='row': changed['tables']['students']['rows'][0].pop('name')
    elif kind=='duplicate': changed['tables']['students']['rows'].append(changed['tables']['students']['rows'][0])
    else: changed['tables']['students']['rows'][0]['year_group']='not-an-integer'
    superadmin.call('restore',repack(envelope,changed),status=400)
    assert snapshot(superadmin)==expected, kind
# Restore to an independently initialized empty database with the same schema.
php('foreach ($db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN) as $t) $db->exec("DROP TABLE `$t`");')
subprocess.check_call(['docker','exec','er-feature-test','php','scripts/migrate.php','--initialize'],stdout=subprocess.DEVNULL)
superadmin.call('restore',original)
assert snapshot(superadmin)==expected
# Ordinary application writes still work after restore.
req=urllib.request.Request(BASE+'?action=create_student',data=urllib.parse.urlencode({'name':'Post Restore','year_group':9}).encode())
created=json.loads(superadmin.opener.open(req).read())
assert created['id']>max(row['id'] for row in expected['students']['rows'])
superadmin.call('restore',original)
assert snapshot(superadmin)==expected
print('PASS: all 9 tables and every column round-trip; fresh database restore; Unicode/NULL/zero IDs; role/UI gates; POST/CSRF/confirmation; malformed/corrupt/incompatible files; transaction rollback after partial insertion; post-restore writes')
