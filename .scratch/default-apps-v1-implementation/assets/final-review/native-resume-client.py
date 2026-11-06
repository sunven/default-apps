import pathlib,json,subprocess,os,time,urllib.request,datetime
repo=pathlib.Path('/Users/sunven/github/default-apps');e=repo/'.scratch/default-apps-v1-implementation/assets/final-review';isolated=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/final-review-controlled-2')
def dump(name,obj):(e/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
class Process:
 def poll(self):
  try:os.kill(int((isolated/'pid').read_text()),0);return None
  except ProcessLookupError:return 0
process=Process()
def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9111/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req,timeout=8))['result']
 if result.get('isError'):raise RuntimeError(result)
 value=result['content'][0]['text']
 try:return json.loads(value)
 except json.JSONDecodeError:return value

def js(code):return call('js_eval',js=code)
def service(method,*args):return js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;return await Call.ByID('+str(method)+''.join(','+json.dumps(a) for a in args)+')')
def wait(code):
 for _ in range(100):
  if js('return !!('+code+')'):return
  time.sleep(.1)
 raise RuntimeError('UI timeout '+code)
def click(label):return js('const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+');if(!b)throw Error("missing button "+'+json.dumps(label)+');b.focus();b.click();return true')
def fill(selector,value):return js('const e=document.querySelector('+json.dumps(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));return true')
def control(**command):
 req=urllib.request.Request((isolated/'control-address').read_text()+'/control',data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=8))
def native(action):
 result=isolated/'native-result.json';result.unlink(missing_ok=True);(isolated/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  if process.poll() is not None:return {'exitCode':process.returncode}
  time.sleep(.05)
 raise RuntimeError('native action timeout '+action)
def panel(command,path=''):
 result=isolated/'panel-result.json';result.unlink(missing_ok=True);(isolated/'panel-command.json').write_text(json.dumps({'command':command,'path':path}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise RuntimeError('panel action timeout '+command)
def capture(name):
 path=e/name;panel('snapshot',str(path))
 for _ in range(100):
  if path.exists():return
  time.sleep(.05)
 raise RuntimeError('snapshot missing')
def snapshot():return service(3439020780)
def catalog():return service(2011754152)
checks=[]
def record(name,**extra):
 value={'check':name,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshot':snapshot(),'control':control(),'view':js('return document.querySelector("[data-view][aria-pressed=true]")?.dataset.view'),'dialog':js('return document.querySelector("dialog[open]")?.innerText'),'viewport':js('return [innerWidth,innerHeight,document.documentElement.scrollWidth-innerWidth]')}
 value.update(extra);checks.append(value);dump('native-regressions.json',checks)

