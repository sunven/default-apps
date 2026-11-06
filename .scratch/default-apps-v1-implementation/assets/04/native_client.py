import json,pathlib,urllib.request,time
root=pathlib.Path(__file__).parent

def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9104/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req))['result']
 if result.get('isError'):raise RuntimeError(result)
 text=result['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def native(action='geometry',key='',code=0,flags=0):
 req=urllib.request.Request('http://127.0.0.1:9106/action',data=json.dumps(dict(Action=action,Key=key,Code=code,Flags=flags)).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req))
def key(char,code=0,flags=0):
 result=native('key',char,code,flags);time.sleep(.15);return result
def wait(condition):return js('for(let i=0;i<100;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50))}throw Error("UI timeout")')
def dump(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def focus():return js('return {tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label"),text:document.activeElement.textContent,path:document.activeElement.dataset.appPath,association:document.activeElement.dataset.associationId,tabIndex:document.activeElement.tabIndex,view:document.querySelector("[data-view][aria-pressed=true]")?.dataset.view,dialogs:document.querySelectorAll("dialog[open]").length}')
