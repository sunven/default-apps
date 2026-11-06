import json,pathlib,subprocess,datetime
evidence=pathlib.Path(__file__).resolve().parent;repo=evidence.parents[3]
manifest=json.loads((evidence/'manifest.json').read_text());root=pathlib.Path(manifest['root'])
if (evidence/'daily-before.json').exists():raise RuntimeError('baseline already exists; do not overwrite')
def save_command(args,name):
 result=subprocess.run(args,capture_output=True,text=True)
 (evidence/(name+'.stderr')).write_text(result.stderr)
 (evidence/(name+'.json')).write_text(result.stdout)
 result.check_returncode()
 return json.loads(result.stdout)
save_command(['xcrun','swift',str(repo/'.scratch/default-apps-v1-implementation/assets/02/independent-query.swift')],'daily-before')
before=save_command([str(repo/'bin/independent-fixture'),manifest['type'],manifest['scheme']],'dedicated-before')
assert not before['type']['candidates'] and not before['scheme']['candidates'] and before['type']['current'] is None and before['scheme']['current'] is None
log=[];lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
for key in ['a','b']:
 path=manifest['targets'][key]['path'];result=subprocess.run([lsregister,'-f',path],capture_output=True,text=True)
 log.append({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':[lsregister,'-f',path],'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr});result.check_returncode()
(evidence/'registration.json').write_text(json.dumps(log,indent=2))
save_command([str(repo/'bin/independent-fixture'),manifest['type'],manifest['scheme']],'dedicated-registered')
config={'version':1,'associations':[{'input':{'kind':'identifier','value':manifest['type'],'label':'Dedicated Acceptance Document','source':'manual'},'selectedID':'file:'+manifest['type']}],'applications':[]}
directory=root/'Application Support/Default Apps';directory.mkdir(parents=True)
(directory/'config.json').write_text(json.dumps(config,indent=2))
