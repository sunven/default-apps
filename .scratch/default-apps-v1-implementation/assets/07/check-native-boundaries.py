import runpy,time,json
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
TARGET='/Applications/Xcode.app';BEFORE='/Controlled/Before.app';PDF={'kind':'file','key':'com.adobe.pdf'}
checks=[]
def record(name,**extra):
 state=snapshot();state['observations']=[o for o in state['observations'] if o['association']==PDF];adapter=control();adapter['queryCount']=len(adapter['queries']);adapter['queries']=adapter['queries'][-10:]
 value={'scenario':name,'DOM':dom(),'snapshot':state,'adapter':adapter,**extra};checks.append(value);dump('native-boundaries.json',checks);print(name,flush=True);return value
def poll(check):
 for _ in range(150):
  result=control()
  if check(result):return result
  time.sleep(.05)
 raise AssertionError('adapter timeout '+str(result))
def file_detail():
 js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();document.querySelector(\'[data-view="file"]\').click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog[open] .change-copy-action")');js('document.querySelector("dialog[open] .page-heading button").click();return true');wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')
def reload():
 js('setTimeout(()=>location.reload(),30);return true');time.sleep(.4);wait('document.querySelector(".app-shell")')
def panel(command):
 result=config_root/'panel-result.json'
 if result.exists():result.unlink()
 (config_root/'panel-command.json').write_text(json.dumps({'command':command}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise AssertionError('native command timed out')
wait('document.querySelector("[data-view]")&&!document.querySelector(".scan-status")')
# Both reply and event notification are lost; retained client parameters recover via snapshot/reconciliation after reload.
control(path=BEFORE);file_detail();before=control()['starts']
js('window.savedDispatcher=window._wails.dispatchWailsEvent;window._wails.dispatchWailsEvent=e=>{if(e.name!=="defaultapps:change")window.savedDispatcher(e)};window.savedFetch=window.fetch;window.fetch=async function(url,options){const body=options?.body?JSON.parse(options.body):{};if(body.args?.methodID===3692139412)return new Promise(()=>{});const response=await window.savedFetch(url,options);if(body.args?.methodID===9070636)throw Error("controlled lost submit response");return response};return true')
js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true');poll(lambda v:v['starts']==before+1)
wait('document.querySelector(".change-status")?.innerText.includes("提交应答中断")')
original=js('return JSON.parse(sessionStorage.getItem("defaultapps.submission.v1")).input')
record('accepted reply and change event both lost; original parameters retained',original=original)
reload();wait('document.querySelector(".change-status")?.innerText.includes("已受理")');assert snapshot()['activeRequestID']==original['requestID'] and control()['starts']==before+1
record('reload recovers accepted identity after both notification channels were lost')
control(action='submitted');control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")')
# A call which never reaches Go is conclusively rejected by query-only reconciliation, preventing a delayed original call.
control(path=BEFORE);file_detail();before=control()['starts']
js('window.savedFetch=window.fetch;window.fetch=async function(url,options){const body=options?.body?JSON.parse(options.body):{};if(body.args?.methodID===9070636){window.neverArrived=body.args.args[0];throw Error("controlled request never delivered")};return window.savedFetch(url,options)};return true')
js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true')
wait('document.querySelector(".change-status")?.innerText.includes("未受理原请求")')
never=js('window.fetch=window.savedFetch;return window.neverArrived')
late=service(9070636,never);assert late['outcome']=='interrupted' and control()['starts']==before and not snapshot()['busy']
record('never-arrived request reconciled and later original binding rejected with zero dispatch',lateOutcome=late['outcome'])
# Public binding cancellation before acceptance produces no native dispatch.
control(path=BEFORE,holdAssociation=PDF)
inp={'requestID':'native-cancel-preflight','association':PDF,'targetPath':TARGET,'expected':{'known':True,'path':BEFORE}}
js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;window.cancelledCall=Call.ByID(9070636,'+json.dumps(inp)+');window.cancelledCall.catch(()=>{});return true')
held=poll(lambda v:len(v['heldQueries'])==1)['heldQueries'][0]
js('window.cancelledCall.cancel();return true');time.sleep(.1);control(releaseQuery=held)
for _ in range(100):
 result=service(3692139412,inp)
 if result['state']=='decided':break
 time.sleep(.05)
assert result['result']['outcome']=='interrupted' and control()['starts']==before
record('public Wails call cancellation before acceptance never dispatches')
# Cancellation during durable save leaves the accepted request owned by Go.
control(holdSave=True);inp={**inp,'requestID':'native-cancel-durable'}
js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;window.cancelledCall=Call.ByID(9070636,'+json.dumps(inp)+');window.cancelledCall.catch(()=>{});return true')
poll(lambda v:v['saving']);js('window.cancelledCall.cancel();return true');time.sleep(.1);control(action='release-save');poll(lambda v:v['starts']==before+1)
wait('document.querySelector(".change-status")?.innerText.includes("已受理")');record('public Wails call cancellation during durable save keeps one original request')
control(action='submitted');control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")');record('completion after caller cancellation reaches original request in formal UI')
# Actual AppKit deactivate/activate exercises the native foreground signal and visible-only refresh.
file_detail();initial=control()['querySequence'];control(path='/Controlled/Foreground.app')
inactive=panel('deactivate');time.sleep(.15);active=panel('activate');poll(lambda v:v['querySequence']>initial)
wait('document.querySelector("dialog").innerText.includes("/Controlled/Foreground.app")')
a=record('AppKit foreground activation refreshes visible default without another setter',nativeDeactivate=inactive,nativeActivate=active,queriesSinceActivation=control()['querySequence']-initial)
assert a['adapter']['starts']==before+1
# Burst notifications are coalesced into one refresh of each visible identity.
initial=control()['querySequence']
js('const dispatcher=window._wails.dispatchWailsEvent;const {Events}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;await Promise.all(Array.from({length:8},()=>Events.Emit("defaultapps:activated",true)));return true')
time.sleep(.25)
recent=control()['queries'][initial:];assert len(recent)>0 and len(recent)==len({(a['kind'],a['key']) for a in recent})
record('activation burst coalesces visible identities',refreshed=recent)
pixels('foreground-1000x700.png')
print('native boundaries passed',len(checks),flush=True)
