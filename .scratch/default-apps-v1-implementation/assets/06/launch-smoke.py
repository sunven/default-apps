import json,pathlib,subprocess,os,time,urllib.request
repo=pathlib.Path.cwd();evidence=repo/'.scratch/default-apps-v1-implementation/assets/06';root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/change06-smoke')
root.mkdir(parents=True,exist_ok=True)
config={'version':1,'associations':[{'input':{'kind':'scheme','value':'ticket06-preserve','label':'Ticket 06 manual marker','source':'manual'},'selectedID':'scheme:ticket06-preserve'}],'applications':[]}
(root/'config.json').write_text(json.dumps(config))
env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),WAILS_MCP_PORT='9107')
log=(evidence/'native-runtime.log').open('w')
process=subprocess.Popen([str(repo/'bin/Default Apps Change QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'pid').write_text(str(process.pid));(evidence/'native-pid.txt').write_text(str(process.pid));print(process.pid)

for _ in range(150):
 try:
  request=urllib.request.Request('http://127.0.0.1:9107/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'windows_list','arguments':{}}}).encode(),headers={'Content-Type':'application/json'})
  response=json.load(urllib.request.urlopen(request))
  if response.get('result'):break
 except Exception:pass
 time.sleep(.1)
else:raise RuntimeError('Wails MCP did not become ready')
