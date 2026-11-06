import json,pathlib,subprocess,os,time,urllib.request,plistlib
repo=pathlib.Path.cwd();evidence=repo/'.scratch/default-apps-v1-implementation/assets/07';root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/change07-smoke')
root.mkdir(parents=True,exist_ok=True)
config={'version':1,'associations':[{'input':{'kind':'scheme','value':'ticket07-preserve','label':'Ticket 07 manual marker','source':'manual'},'selectedID':'scheme:ticket07-preserve'}],'applications':[]}
fixture=root/'Sync Reader.app'
(fixture/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
(fixture/'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'com.sunven.defaultapps.ticket07','CFBundleName':'Sync Reader','CFBundleDisplayName':'Sync Reader','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundleExecutable':'reader','CFBundlePackageType':'APPL','CFBundleDocumentTypes':[{'CFBundleTypeRole':'Viewer','LSItemContentTypes':['com.adobe.pdf']}]}))
(fixture/'Contents/MacOS/reader').write_text('#!/bin/sh\nexit 0\n');(fixture/'Contents/MacOS/reader').chmod(0o755)
config['applications']=[{'path':str(fixture),'displayPath':str(fixture),'name':'Sync Reader','version':'1.0','bundleID':'com.sunven.defaultapps.ticket07'}]
(root/'config.json').write_text(json.dumps(config))
env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),WAILS_MCP_PORT='9108')
log=(evidence/'native-runtime.log').open('w')
process=subprocess.Popen([str(repo/'bin/Default Apps Sync QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'pid').write_text(str(process.pid));(evidence/'native-pid.txt').write_text(str(process.pid));print(process.pid)

for _ in range(150):
 try:
  request=urllib.request.Request('http://127.0.0.1:9108/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'windows_list','arguments':{}}}).encode(),headers={'Content-Type':'application/json'})
  response=json.load(urllib.request.urlopen(request))
  if response.get('result'):break
 except Exception:pass
 time.sleep(.1)
else:raise RuntimeError('Wails MCP did not become ready')
