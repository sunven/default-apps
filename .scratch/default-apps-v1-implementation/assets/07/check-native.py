import runpy,time,json
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
TARGET='/Applications/Xcode.app';BEFORE='/Controlled/Before.app';EXTERNAL='/Controlled/External.app'
PDF={'kind':'file','key':'com.adobe.pdf'}
checks=[]
def record(name,**extra):
 state=snapshot();state['observations']=[o for o in state['observations'] if o['association']['key'] in ['com.adobe.pdf','http','https']];adapter=control();adapter['queryCount']=len(adapter['queries']);adapter['queries']=adapter['queries'][-10:]
 value={'scenario':name,'DOM':dom(),'snapshot':state,'adapter':adapter,'disk':disk(),**extra};checks.append(value);dump('native-sync.json',checks);print(name,flush=True);return value
def poll(check):
 for _ in range(150):
  value=control()
  if check(value):return value
  time.sleep(.05)
 raise AssertionError('adapter timeout '+json.dumps(value))
def close():js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();return true')
def file_detail():
 close();js('document.querySelector(\'[data-view="file"]\').click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog[open] .change-copy-action")')
 js('document.querySelector("dialog[open] .page-heading button").click();return true');wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')
def scan():
 previous=service(2011754152)['version']
 wait('[...document.querySelectorAll("button")].some(b=>b.textContent==="重新扫描应用"&&!b.disabled)')
 js('[...document.querySelectorAll("button")].find(b=>b.textContent==="重新扫描应用").click();return true')
 for _ in range(100):
  result=service(2011754152)
  if result['version']>previous and not result['scanning']:break
  time.sleep(.05)
 else:raise AssertionError('scan did not complete')
 wait('!document.querySelector(".scan-status")')
def reload():
 js('setTimeout(()=>location.reload(),30);return true');time.sleep(.4);wait('document.querySelector(".app-shell")&&window._wails')
def launch_query(association,slot):
 js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;window.'+slot+'=null;void Call.ByID(3233615384,'+json.dumps(association)+').then(v=>window.'+slot+'=v);return true')
wait('document.querySelectorAll("[data-app-path]").length>50&&!document.querySelector(".scan-status")')
call('window_control',action='set_size',width=1000,height=728)
# Keep one original UI action across a reload while durable admission is still pending.
file_detail();control(holdSave=True)
js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true')
poll(lambda v:v['saving']);original=js('return JSON.parse(sessionStorage.getItem("defaultapps.submission.v1")).input')
assert control()['starts']==0
record('original UI submission held during atomic save',original=original)
reload();wait('document.querySelector(".change-status")?.innerText.includes("原请求仍在核对受理条件")')
a=record('reload reconciles in-flight original admission without dispatch');assert a['adapter']['starts']==0 and a['snapshot']['busy']
assert js('return JSON.parse(sessionStorage.getItem("defaultapps.submission.v1")).input')==original
control(action='release-save');wait('document.querySelector(".change-status")?.innerText.includes("已受理")');poll(lambda v:v['starts']==1)
a=record('same request accepted after reloaded caller left');assert a['snapshot']['activeRequestID']==original['requestID'];assert js('return sessionStorage.getItem("defaultapps.submission.v1")===null')
control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("等待系统返回")')
accepted_at=time.monotonic()
# A pending request remains attached to its original association while the UI browses another.
close();js('document.querySelector(\'[data-view="scheme"]\').click();return true');wait('document.querySelector(\'[data-association-id="scheme:http"]\')')
control(path=TARGET);service(3233615384,PDF)
a=record('target observation during pending request preserves global gate and original target');assert a['snapshot']['busy'] and not a['snapshot']['requests'][-1]['completion']['known'] and a['adapter']['starts']==1
pixels('pending-1000x700.png')
# Old query result arrives after a later refresh; public Go snapshot and the formal UI keep newest observation.
control(path=BEFORE,holdAssociation=PDF);launch_query(PDF,'oldRefresh')
held=poll(lambda v:len(v['heldQueries'])==1)['heldQueries'][0]
control(path=EXTERNAL);latest=service(3233615384,PDF)
control(releaseQuery=held);wait('window.oldRefresh!==null')
assert js('return window.oldRefresh.superseded') is True
assert next(o for o in snapshot()['observations'] if o['association']==PDF)['default']['app']['path']==EXTERNAL
file_detail();wait('document.querySelector("dialog").innerText.includes("/Controlled/External.app")')
a=record('old query returning last cannot replace newer observation',oldReply=js('return window.oldRefresh'));assert a['adapter']['starts']==1
control(queryError=True);service(2260118331,PDF);wait('document.querySelector("dialog").innerText.includes("默认应用待更新")');assert js('return document.querySelector("dialog").innerText.includes("/Controlled/External.app")')
record('latest query failure keeps last valid path and independent error')
control(queryError=False)
# Catalog progress is separate from default refresh; preserve actual browse search/selection/scroll.
close();js('document.querySelector(\'[data-view="app"]\').click();return true')
fixture=str(config_root/'Sync Reader.app')
wait('document.querySelector('+json.dumps('[data-app-path="'+fixture+'"]')+')')
js('document.querySelector('+json.dumps('[data-app-path="'+fixture+'"]')+').click();const search=document.querySelector(".sidebar input");const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;set.call(search,"Sync Reader");search.dispatchEvent(new Event("input",{bubbles:true}));return true')
js('document.querySelector('+json.dumps('[data-app-path="'+fixture+'"]')+').click();return true')
wait('document.querySelector("h1")?.innerText==="Sync Reader"')
before=js('const list=document.querySelector(".application-list");return {search:document.querySelector(".sidebar input").value,selection:document.querySelector("[data-app-path][aria-pressed=true]")?.dataset.appPath,scroll:list.scrollTop}')
scan()
after=js('const list=document.querySelector(".application-list");return {search:document.querySelector(".sidebar input").value,selection:document.querySelector("[data-app-path][aria-pressed=true]")?.dataset.appPath,scroll:list.scrollTop}')
assert after==before
record('directory refresh preserves search selection and scroll',before=before,after=after)
# Removing our isolated bundle removes the usable row and declarations, while its system-default observation stays independent.
control(path=fixture);service(3233615384,PDF)
fixture_path=Path(fixture);moved=fixture_path.with_name('Sync Reader.removed');fixture_path.rename(moved)
scan()
wait('document.querySelector(".missing-copy")?.innerText.includes('+json.dumps(fixture)+')')
assert not js('return !!document.querySelector('+json.dumps('[data-app-path="'+fixture+'"]')+')')
assert not js('return !!document.querySelector("[data-association-id]")')
record('selected manual copy disappears without substitution or declarations')
file_detail();wait('document.querySelector("dialog").innerText.includes("目录中已找不到此副本")')
assert js('return document.querySelector("dialog").innerText.includes('+json.dumps(fixture)+')')
record('default observation still points at disappeared catalog copy')
moved.rename(fixture_path);close()
# Finish the original callback after reload, switches, refresh failures and disappearance.
control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")')
a=record('late completion still resolves original request and original target',elapsedSinceSubmittedSeconds=round(time.monotonic()-accepted_at,3));assert a['snapshot']['requests'][-1]['requestID']==original['requestID'] and a['snapshot']['requests'][-1]['association']==PDF and not a['snapshot']['busy'] and a['adapter']['starts']==1
# Replay duplicate and older real snapshots through typed events; neither can regress the UI.
old=checks[2]['snapshot'];new=snapshot()
js('const dispatcher=window._wails.dispatchWailsEvent;const {Events}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;await Events.Emit("defaultapps:change",'+json.dumps(old)+');await Events.Emit("defaultapps:change",'+json.dumps(new)+');await Events.Emit("defaultapps:change",'+json.dumps(old)+');return true')
wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")');record('duplicate and delayed typed events cannot restore older pending state')
reload();wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")');a=record('reload restores last resolved session result without setter');assert a['adapter']['starts']==1
# Lose the actual accepted binding response, then reload while preserving the original ID.
control(path=BEFORE);file_detail()
js('window.originalFetch=window.fetch;window.fetch=async function(url,options){const body=options?.body?JSON.parse(options.body):{};if(body.args?.methodID===3692139412)return new Promise(()=>{});const response=await window.originalFetch(url,options);if(body.args?.methodID===9070636)throw Error("controlled lost submit response");return response};return true')
js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true');poll(lambda v:v['starts']==2)
# A delivered accepted event may already recover the ID; suppressing the response alone must still be harmless.
wait('document.querySelector(".change-status")?.innerText.includes("已受理")');second=snapshot()['activeRequestID']
record('actual binding response lost after acceptance; authoritative event preserves identity')
reload();wait('document.querySelector(".change-status")?.innerText.includes("已受理")');assert snapshot()['activeRequestID']==second and control()['starts']==2
control(action='submitted');control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")')
record('lost reply plus reload completes same request with exactly one dispatch')
pixels('resolved-1000x700.png')
print('native synchronization passed',len(checks),flush=True)
