import json, pathlib, urllib.request, time
base=pathlib.Path(__file__).resolve().parent
root=base/'out'
root.mkdir(exist_ok=True)
address='http://127.0.0.1:9417/mcp'
def call(name,**arguments):
    request=urllib.request.Request(address,data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
    result=json.load(urllib.request.urlopen(request,timeout=20))['result']
    if result.get('isError'):raise RuntimeError(result)
    text=result['content'][0]['text']
    try:return json.loads(text)
    except json.JSONDecodeError:return text
def js(code):return call('js_eval',js=code)
def wait(code,timeout=20):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        try:
            result=js('return Boolean('+code+')')
            if result:return result
        except Exception:pass
        time.sleep(.1)
    raise RuntimeError('timeout: '+code)
def screenshot(name):
    path=base/'evidence'/name
    path.unlink(missing_ok=True)
    (root/'panel-result.json').unlink(missing_ok=True)
    (root/'panel-command.json').write_text(json.dumps({'command':'snapshot','path':str(path)}))
    end=time.monotonic()+10
    while time.monotonic()<end:
        if path.exists():return str(path)
        time.sleep(.1)
    raise RuntimeError('screenshot timeout')
def record(name):
    value=js('return {text:document.body.innerText,viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>({text:d.innerText,scroll:d.scrollHeight,client:d.clientHeight,bounds:d.getBoundingClientRect().toJSON()})),flags:window._wails.flags}')
    (base/'evidence'/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2))
    return value
