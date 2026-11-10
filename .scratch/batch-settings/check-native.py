"""Production Wails UI and coordinator; explicitly controlled native writes."""
import json, os, pathlib, socket, subprocess, time, urllib.request

repo=pathlib.Path(__file__).resolve().parents[2]
out=repo/'.scratch/batch-settings/out'
root=out/('control-'+str(time.time_ns()))
root.mkdir(parents=True)
app=out/'Default Apps Batch QA.app/Contents/MacOS/default-apps'
target='/Applications/Xcode.app'
keys=['com.adobe.pdf','public.plain-text','public.json','public.jpeg']
events=[]
process=None
log=(root/'runtime.log').open('w')
address=''
(root/'config.json').write_text(json.dumps({'version':1,'associations':[{'input':{'kind':'scheme','value':'batch-qa-preserve','source':'manual'},'selectedID':'scheme:batch-qa-preserve'}],'applications':[]}))

def wait(fn,label,timeout=30):
    end=time.monotonic()+timeout;last=''
    while time.monotonic()<end:
        try:
            value=fn()
            if value:return value
        except Exception as error:last=str(error)
        time.sleep(.08)
    raise RuntimeError(label+': '+last)

def call(name,**arguments):
    request=urllib.request.Request(address,data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
    result=json.load(urllib.request.urlopen(request,timeout=30))['result']
    if result.get('isError'):raise RuntimeError(result)
    text=result['content'][0]['text']
    try:return json.loads(text)
    except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def service(method,*args):
    return js('const d=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=d;return await Call.ByID('+str(method)+''.join(','+json.dumps(value)for value in args)+')')
def state():return service(3439020780)
def control(**command):
    url=(root/'control-address').read_text()+'/control'
    return json.load(urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(command).encode(),headers={'Content-Type':'application/json'}),timeout=10))
def click(text,scope='document'):
    wait(lambda:js('return [...'+scope+'.querySelectorAll("button")].some(b=>b.textContent.trim()==='+json.dumps(text)+'&&!b.disabled)'),'button '+text)
    return js('const b=[...'+scope+'.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(text)+');if(!b||b.disabled)throw Error("button unavailable: "+'+json.dumps(text)+');b.click();return true')
def close_dialogs():js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]")?.click();return true')
def native(action):
    (root/'native-result.json').unlink(missing_ok=True)
    (root/'native-command.json').write_text(json.dumps({'action':action}))
    return wait(lambda:{'exited':True} if process.poll() is not None else json.loads((root/'native-result.json').read_text()),'native '+action)
def screenshot(name):
    batch=state().get('batch')
    if batch:
        labels={'running':'正在设置','waiting':'等待当前项结果','paused':'后续设置已暂停','stopped':'后续设置已停止','completed':'本轮处理结束','recovered':'已恢复最近一批'}
        expected=labels[batch['state']]
        wait(lambda:js('return document.querySelector(".batch-progress")?.innerText.includes('+json.dumps(expected)+')'),'rendered batch state')
    dest=root/(name+'.png')
    (root/'panel-command.json').write_text(json.dumps({'command':'snapshot','path':str(dest)}))
    wait(lambda:dest.exists(),'screenshot '+name)
def record(name):
    value={'name':name,'state':state(),'adapter':control(),'disk':json.loads((root/'config.json').read_text()),'body':js('return document.body.innerText'),'viewport':js('return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth}')}
    events.append(value);(root/'results.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    print(name,flush=True);return value
def launch():
    global process,address
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    address=f'http://127.0.0.1:{port}/mcp'
    env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),WAILS_MCP_PORT=str(port),WAILS_MCP_HIDE_CURSOR='1')
    process=subprocess.Popen([str(app)],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    wait(lambda:js('return !!document.querySelector(".global-header")'),'native UI')
    wait(lambda:js('return ![...document.querySelectorAll("button")].some(b=>b.textContent.includes("正在扫描"))'),'initial application scan',timeout=45)
    wait(lambda:service(3439020780).get('version',-1)>=0,'service ready')
def select_types(type_keys):
    close_dialogs();js('document.querySelector(\'[data-view="file"]\').click();return true')
    for key in type_keys:
        selector='[data-association-id="file:'+key+'"]'
        wait(lambda:js('return !!document.querySelector('+json.dumps(selector)+')'),'type '+key)
        js('const c=document.querySelector('+json.dumps(selector)+').closest(".association-row").querySelector("input[type=checkbox]");if(!c||c.disabled)throw Error("checkbox disabled");c.click();return true')
def choose_and_start(count):
    click('选择应用…')
    wait(lambda:js('return !!document.querySelector(".batch-app-option")'),'app choices')
    js('const b=[...document.querySelectorAll(".batch-app-option")].find(b=>b.getAttribute("aria-label").endsWith('+json.dumps(target)+'));if(!b)throw Error("missing Xcode");b.click();return true')
    wait(lambda:js('return document.querySelector("dialog[open]")?.innerText.includes("预览批量设置")'),'preview')
    screenshot('preview-'+str(count))
    click('开始设置 '+str(count)+' 项')
    wait(lambda:state().get('batch',{}).get('state')=='waiting','first request')

try:
    launch();native('minimum')
    select_types(keys);screenshot('selection')
    choose_and_start(4)
    wait(lambda:control()['starts']==1,'first dispatch')
    first=record('one confirmed batch has one active request')
    assert first['disk']['version']==2 and first['disk']['associations'][0]['selectedID']=='scheme:batch-qa-preserve'
    assert first['viewport']['overflow']==0
    js('window.__batchQAReload=true;setTimeout(()=>location.reload(),100);return true')
    wait(lambda:js('return !window.__batchQAReload&&!!document.querySelector(".batch-progress")'),'progress after reload')
    assert control()['starts']==1
    record('frontend reload only reads existing batch')
    control(action='complete',association={'kind':'file','key':keys[0]},path=target)
    wait(lambda:control()['starts']==2,'second dispatch')
    control(action='complete',association={'kind':'file','key':keys[1]},path='/Controlled/Before.app',error={'domain':'Controlled','code':42,'description':'拒绝本项'})
    wait(lambda:control()['starts']==3,'failure continues to third')
    click('停止后续设置')
    control(action='complete',association={'kind':'file','key':keys[2]},path=target)
    wait(lambda:not state()['busy'],'third settled')
    assert control()['starts']==3
    value=record('stop keeps fourth unsubmitted; known failure retained')
    assert [item['status']for item in value['state']['batch']['items']]==['confirmed','failed','confirmed','queued']
    click('查看批次');screenshot('partial-results')
    native('menu');wait(lambda:process.poll() is not None,'normal menu quit')
    launch();wait(lambda:state().get('batch',{}).get('state')=='recovered','saved batch recovered')
    assert control()['starts']==0
    click('查看批次');click('继续未执行的 1 项…')
    wait(lambda:js('return document.querySelector("dialog[open]")?.innerText.includes("预览批量设置")'),'resume preview')
    assert control()['starts']==0
    click('开始设置 1 项');wait(lambda:control()['starts']==1,'resumed fourth dispatch')
    control(action='complete',association={'kind':'file','key':keys[3]},path=target)
    wait(lambda:state()['batch']['state']=='completed','completed mixed batch')
    assert control()['starts']==1
    record('reopen requires explicit preview and resumes only unsubmitted item')
    screenshot('completed-results')
    select_types(keys[:2]);choose_and_start(2)
    wait(lambda:control()['starts']==2,'second batch active')
    for action in ['menu','cmd-q']:
        native(action);wait(lambda:state()['quit']['prompt'],'quit prompt '+action);click('留在应用')
        wait(lambda:not state()['quit']['prompt'],'stay '+action)
    native('close');wait(lambda:state()['quit']['prompt'],'window close prompt');screenshot('pending-quit')
    click('仍然退出');wait(lambda:process.poll() is not None,'pending exit')
    launch();wait(lambda:state().get('recovery',{}).get('ready'),'unknown request observed on reopen')
    assert control()['starts']==0
    value=record('reopen preserves pending uncertainty and does not replay')
    assert value['state']['batch']['items'][0]['status']=='unknown'
    click('查看批次');click('继续未执行的 1 项…')
    wait(lambda:js('return document.querySelector("dialog[open]")?.innerText.includes("预览批量设置")'),'recovery preview')
    assert js('return [...document.querySelectorAll("button")].find(b=>b.textContent==="开始设置 1 项").disabled')
    js('document.querySelector(".batch-recovery input").click();return true')
    click('开始设置 1 项');wait(lambda:control()['starts']==1,'explicit acknowledged new request')
    control(action='complete',association={'kind':'file','key':keys[1]},path=target)
    wait(lambda:not state()['busy'],'recovery continuation settled')
    value=record('acknowledged continuation keeps old request unknown')
    assert [item['status']for item in value['state']['batch']['items']]==['unknown','confirmed']
    screenshot('recovered-results')
    close_dialogs();native('menu');wait(lambda:process.poll() is not None,'final quit')
    (out/'latest-controlled-run').write_text(str(root))
    print('PASS '+str(root),flush=True)
except Exception:
    try:record('failure');screenshot('failure')
    except Exception:pass
    raise
finally:
    if process is not None and process.poll() is None:
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
    log.close()
