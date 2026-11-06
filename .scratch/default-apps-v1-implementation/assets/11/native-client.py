import json,pathlib,urllib.request,time,os,subprocess,datetime
root=pathlib.Path(__file__).parent.resolve();repo=pathlib.Path.cwd()
config_root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/final11-controlled')
process=None

def dump(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9111/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req,timeout=20))['result']
 if result.get('isError'):raise RuntimeError(result)
 value=result['content'][0]['text']
 try:return json.loads(value)
 except json.JSONDecodeError:return value

def js(code):return call('js_eval',js=code)
def service(method,*args):
 return js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;return await Call.ByID('+str(method)+''.join(','+json.dumps(arg,ensure_ascii=False) for arg in args)+')')
def wait(condition):
 for _ in range(120):
  if js('return !!('+condition+')'):return True
  time.sleep(.1)
 raise RuntimeError('UI timeout: '+condition)
def control(**command):
 req=urllib.request.Request((config_root/'control-address').read_text()+'/control',data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=10))
def snapshot():return service(3439020780)
def disk():return json.loads((config_root/'config.json').read_text())
def focus():return js('const e=document.activeElement;return {tag:e.tagName,label:e.getAttribute("aria-label"),text:e.textContent.slice(0,120),path:e.dataset.appPath,association:e.dataset.associationId,view:document.querySelector("[data-view][aria-pressed=true]")?.dataset.view,dialogs:document.querySelectorAll("dialog[open]").length}')
def dom():return js('return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,status:document.querySelector(".change-status")?.innerText,recovery:document.querySelector(".recovery-status")?.innerText,panes:[".application-list",".association-list"].map(s=>{const e=document.querySelector(s);if(!e)return null;return {selector:s,client:e.clientHeight,height:e.scrollHeight,scroll:e.scrollTop}}),dialog:[...document.querySelectorAll("dialog[open]")].map(e=>({title:e.querySelector("h2")?.textContent,height:e.clientHeight,scroll:e.querySelector(".dialog-body").scrollHeight,body:e.querySelector(".dialog-body").clientHeight})),focus:'+ 'null}')
def click(label):return js('const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+');if(!b)throw Error("missing button");b.focus();b.click();return true')
def fill(selector,value):return js('const e=document.querySelector('+json.dumps(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));return true')
def native(action):
 result=config_root/'native-result.json';result.unlink(missing_ok=True)
 (config_root/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(120):
  if result.exists():return json.loads(result.read_text())
  if process is not None and process.poll() is not None:return {'action':action,'exitCode':process.returncode}
  time.sleep(.025)
 raise RuntimeError('native action timeout '+action)
def panel(action,path=''):
 result=config_root/'panel-result.json';result.unlink(missing_ok=True)
 (config_root/'panel-command.json').write_text(json.dumps({'command':action,'path':path}))
 for _ in range(120):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.025)
 raise RuntimeError('panel timeout')
def key(char,code=0,flags=0):
 req=urllib.request.Request('http://127.0.0.1:9106/action',data=json.dumps({'Action':'key','Key':char,'Code':code,'Flags':flags}).encode(),headers={'Content-Type':'application/json'})
 value=json.load(urllib.request.urlopen(req));time.sleep(.12);return value

def geometry():
 req=urllib.request.Request('http://127.0.0.1:9106/action',data=b'{"Action":"geometry"}',headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req))
def pixels(name):
 path=root/name;path.unlink(missing_ok=True);panel('snapshot',str(path))
 for _ in range(100):
  if path.exists():return str(path)
  time.sleep(.05)
 raise RuntimeError('screenshot unavailable')
def launch(mode='controlled',sequence=1):
 global process,config_root
 if mode=='native':config_root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/final11-native');config_root.mkdir(exist_ok=True)
 for name in ['native-command.json','native-result.json','panel-command.json','panel-result.json']:(config_root/name).unlink(missing_ok=True)
 env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(config_root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(config_root),WAILS_MCP_PORT='9111')
 log=(root/f'{mode}-runtime-{sequence}.log').open('w')
 process=subprocess.Popen([str(repo/f'bin/Default Apps Final {mode} QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (config_root/'pid').write_text(str(process.pid))
 for _ in range(160):
  if process.poll() is not None:raise RuntimeError('process exited')
  try:
   if js('return !!document.querySelector("[data-view=app]")'):break
  except Exception:pass
  time.sleep(.1)
 else:raise RuntimeError('app not ready')
 wait('document.querySelectorAll("[data-app-path]").length>50&&!document.body.innerText.includes("正在扫描应用")')
 native('minimum');panel('activate');time.sleep(.2)
 return process.pid
