#!/usr/bin/env python3
"""Verify shell fail-fast behaviour with a fake Docker command; no real containers."""
import os, subprocess, tempfile
from pathlib import Path
script=Path('scripts/upgrade.sh').read_text()
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);(root/'scripts').mkdir();(root/'scripts/upgrade.sh').write_text(script)
    docker=root/'docker'
    docker.write_text('''#!/usr/bin/env python3
import os,sys,json
args=' '.join(sys.argv[1:]); mode=os.environ['CASE']
with open(os.environ['CALL_LOG'],'a') as log:log.write(args+'\\n')
if 'php -r' in args:
    if mode=='missing' and 'exec -T' in args:sys.exit(1)
    print('other-db' if mode=='mismatch' and 'run --rm' in args else 'original-db')
elif 'scripts/migrate.php' in args and mode=='migration_failure':sys.exit(1)
elif 'scripts/database-fingerprint.php' in args:
    if mode=='verification_failure' and '/upgrade-verification/before.json' in args:sys.exit(1)
    print('{}')
''');docker.chmod(0o755)
    for case in ['missing','mismatch','migration_failure','verification_failure','success']:
        log=root/(case+'.log');env={**os.environ,'PATH':str(root)+os.pathsep+os.environ['PATH'],'CASE':case,'CALL_LOG':str(log)}
        result=subprocess.run(['sh',str(root/'scripts/upgrade.sh')],env=env,capture_output=True)
        calls=log.read_text()
        assert ('up -d --no-build app' in calls)==(case=='success'),case
        assert (result.returncode==0)==(case=='success'),case
        if case in ['missing','mismatch']: assert 'scripts/migrate.php' not in calls and 'stop app' not in calls
        print('PASS: '+case)
