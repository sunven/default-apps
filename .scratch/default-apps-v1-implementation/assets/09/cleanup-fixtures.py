"""Target only this immutable manifest. Keep bundles if registrations remain."""
import json,pathlib,subprocess,datetime
evidence=pathlib.Path(__file__).resolve().parent;repo=evidence.parents[3]
manifest=json.loads((evidence/'manifest.json').read_text())
lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
log=[]
for target in manifest['targets'].values():
    path=target['path']
    assert pathlib.Path(path).is_relative_to(pathlib.Path(manifest['root'])/'fixtures')
    result=subprocess.run([lsregister,'-u',path],text=True,capture_output=True)
    log.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':[lsregister,'-u',path],'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
    result.check_returncode()
(evidence/'cleanup-commands.json').write_text(json.dumps(log,indent=2))
result=subprocess.run([str(repo/'bin/independent-fixture'),manifest['type'],manifest['scheme']],text=True,capture_output=True,check=True)
(evidence/'dedicated-after-cleanup.json').write_text(result.stdout)
observed=json.loads(result.stdout)
owned={target['path'] for target in manifest['targets'].values()}
residual=[]
for kind in ['type','scheme']:
    values=observed[kind]['candidates']+[observed[kind]['current']]
    residual.extend(value['path'] for value in values if value and value['path'] in owned)
(evidence/'cleanup-result.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'residualPaths':residual,'status':'失败' if residual else '通过','claim':'Targeted registration removal; no claim about erased history or never-set defaults'},ensure_ascii=False,indent=2))
daily=subprocess.run(['xcrun','swift',str(repo/'.scratch/default-apps-v1-implementation/assets/02/independent-query.swift')],text=True,capture_output=True,check=True)
(evidence/'daily-after-cleanup.json').write_text(daily.stdout)
baseline=json.loads((evidence/'daily-before.json').read_text());after=json.loads(daily.stdout)
changes=[{'key':key,'before':value,'after':after['queries'].get(key)} for key,value in baseline['queries'].items() if value!=after['queries'].get(key)]
(evidence/'daily-comparison.json').write_text(json.dumps({'changes':changes,'status':'通过' if not changes else '失败'},ensure_ascii=False,indent=2))
assert not residual, 'Dedicated paths remain registered; preserve fixtures and investigate'
assert not changes, 'Read-only daily baseline changed; do not compensate with an unapproved setter'
print('Targeted cleanup and independent baseline comparison passed')
