import pathlib,plistlib,json,hashlib,datetime
repo=pathlib.Path.cwd(); e=repo/'.scratch/default-apps-v1-implementation/assets/11'
root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/final11-controlled')
root.mkdir(parents=True,exist_ok=True)
if (root/'config.json').exists():raise SystemExit('Dedicated config already exists; refusing to overwrite')
apps=[]
for i in range(102):
 name='Final Acceptance '+str(i).zfill(3)
 path=root/'fixtures'/name/(('Long path with distinct application copies and complete metadata '+str(i)+' ')*3)/f'{name}.app'
 (path/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
 info={'CFBundleIdentifier':'io.defaultapps.final.fixture.'+str(i),'CFBundleName':name,'CFBundleDisplayName':name,'CFBundleVersion':'1','CFBundleShortVersionString':'11.0','CFBundleExecutable':'inert','CFBundlePackageType':'APPL'}
 if i==0:info['CFBundleURLTypes']=[{'CFBundleURLName':'Final acceptance scheme '+str(n).zfill(4),'CFBundleURLSchemes':['final11-scheme-'+str(n).zfill(4)]} for n in range(1000)]
 (path/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
 (path/'Contents/MacOS/inert').write_text('#!/bin/sh\nexit 0\n');(path/'Contents/MacOS/inert').chmod(0o755)
 apps.append({'path':str(path),'displayPath':str(path),'name':name,'version':'11.0','bundleID':info['CFBundleIdentifier']})
config={'version':1,'associations':[{'input':{'kind':'scheme','value':'final11-manual-marker','label':'Final acceptance marker','source':'manual'},'selectedID':'scheme:final11-manual-marker'}],'applications':apps}
(root/'config.json').write_text(json.dumps(config))
(e/'combined-fixtures.json').write_text(json.dumps({'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'root':str(root),'layer':'real plist/manual discovery; controlled default/setter','registered':False,'applications':apps,'declaredSchemes':1000,'configSHA256':hashlib.sha256((root/'config.json').read_bytes()).hexdigest()},indent=2))
