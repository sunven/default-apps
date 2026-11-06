import json,pathlib,subprocess,os,time,urllib.request
evidence=pathlib.Path(__file__).resolve().parent;repo=evidence.parents[3]
manifest=json.loads((evidence/'manifest.json').read_text());root=pathlib.Path(manifest['root'])
env=os.environ.copy();env.update(DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),WAILS_MCP_PORT='9111')
log=(evidence/'native-runtime.log').open('a')
process=subprocess.Popen([str(repo/'bin/Default Apps Native QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'pid').write_text(str(process.pid))
with (evidence/'processes.jsonl').open('a') as output:output.write(json.dumps({'pid':process.pid,'command':process.args,'started':time.time(),'config':str(root/'Application Support/Default Apps/config.json'),'tags':['production','mcp','manual_smoke','lifecycle_smoke','native_acceptance'],'systemAdapter':'real NSWorkspace'})+'\n')
print(process.pid)
for _ in range(100):
 try:
  request=urllib.request.Request('http://127.0.0.1:9111/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'windows_list','arguments':{}}}).encode(),headers={'Content-Type':'application/json'})
  if json.load(urllib.request.urlopen(request)).get('result'):break
 except Exception:pass
 time.sleep(.1)
else:raise RuntimeError('Wails MCP not ready')
