import json,pathlib,urllib.request,time,datetime,subprocess
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text())
config_root=pathlib.Path(manifest['root'])
repo=root.parents[3]
def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9110/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req,timeout=12))['result']
 if result.get('isError'): raise RuntimeError(result)
 text=result['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text
def js(code):return call('js_eval',js=code)
def service(method,*args):
 return js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;return await Call.ByID('+str(method)+''.join(','+json.dumps(arg,ensure_ascii=False) for arg in args)+')')
def wait(condition):return js('for(let i=0;i<120;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50))}throw Error("UI timeout: "+'+json.dumps(condition)+')')
def snapshot():return service(3439020780)
def disk():return json.loads((config_root/'Application Support/Default Apps/config.json').read_text())
def dom():return js('return {text:document.body.innerText,view:document.querySelector("[data-view][aria-pressed=true]")?.dataset.view,dialogs:document.querySelectorAll("dialog[open]").length,viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,active:{tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label")}}')
def dump(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def independent(name):
 data=json.loads(subprocess.check_output([str(repo/'bin/independent-fixture'),manifest['type'],manifest['scheme']],text=True));dump(name,data);return data
def record(name,**extra):
 state=snapshot();state['observations']=[o for o in state['observations'] if o['association']['key']==manifest['type']]
 value={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'name':name,'snapshot':state,'disk':disk(),'DOM':dom(),**extra}
 with (root/'formal-native.jsonl').open('a') as file:file.write(json.dumps(value,ensure_ascii=False)+'\n')
 return value
def panel(command,path=''):
 result=config_root/'panel-result.json'
 result.unlink(missing_ok=True)
 (config_root/'panel-command.json').write_text(json.dumps({'command':command,'path':str(path)}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise RuntimeError('native panel observation did not respond')
def pixels(name):
 path=root/name;path.unlink(missing_ok=True);panel('snapshot',path)
 for _ in range(100):
  if path.exists():return str(path)
  time.sleep(.05)
 raise RuntimeError('snapshot did not arrive')
def native_action(action):
 result=config_root/'native-result.json';result.unlink(missing_ok=True)
 (config_root/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise RuntimeError('native action did not respond')
