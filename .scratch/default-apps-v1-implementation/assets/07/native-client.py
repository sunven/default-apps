import json,pathlib,urllib.request,time
root=pathlib.Path(__file__).parent
config_root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/change07-smoke')
def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9108/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req))['result']
 if result.get('isError'):raise RuntimeError(result)
 text=result['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def service(method,*args):
 # Preserve bundled React Events dispatcher when importing runtime for bridge calls.
 return js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;return await Call.ByID('+str(method)+''.join(','+json.dumps(arg,ensure_ascii=False) for arg in args)+')')
def wait(condition):return js('for(let i=0;i<120;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50))}throw Error("UI timeout: "+'+json.dumps(condition)+')')
def control(**command):
 address=(config_root/'control-address').read_text()
 req=urllib.request.Request(address+'/control',data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req))
def dump(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def snapshot():return service(3439020780)
def disk():return json.loads((config_root/'config.json').read_text())
def dom():return js('return {text:document.querySelector(".change-status")?.innerText,view:document.querySelector("[data-view][aria-pressed=true]")?.dataset.view,dialogs:document.querySelectorAll("dialog[open]").length,viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,active:{tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label"),text:document.activeElement.textContent.slice(0,120)}}')
def pixels(name):
 path=root.resolve()/name
 if path.exists():path.unlink()
 (config_root/'panel-command.json').write_text(json.dumps({'command':'snapshot','path':str(path)}))
 for _ in range(100):
  if path.exists():return str(path)
  time.sleep(.05)
 raise Exception('snapshot did not arrive')
