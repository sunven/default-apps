import runpy
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
TARGET='/Applications/Xcode.app';BEFORE='/Controlled/Before.app';OTHER='/Controlled/Other/Xcode.app'
checks=[]
def record(name):
 value={'scenario':name,'DOM':dom(),'snapshot':snapshot(),'adapter':control(),'disk':disk()};checks.append(value);dump('native-lifecycle.json',checks);return value

def close():js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();return true')
def file_detail():
 close();js('document.querySelector(\'[data-view="file"]\').click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog[open] .change-copy-action")')
 # Refresh current facts; this is deliberately only a query.
 js('document.querySelector("dialog[open] .page-heading button").click();return true');wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')
def candidate_submit():
 js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true')
 wait('!document.querySelector("dialog[open]")')
def accepted():wait('document.querySelector(".change-status")?.innerText.includes("已受理 · 等待提交系统")')
def resolved():wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")')
wait('document.querySelectorAll("[data-app-path]").length>50')
# Actual application row -> generated Submit -> persisted record -> held dispatch.
js('document.querySelector(\'[data-app-path="/Applications/Xcode.app"]\').click();return true')
wait('document.querySelector(".row-submit:not(:disabled)")')
first=js('const e=document.querySelector(".row-submit:not(:disabled)");const a=e.closest(".association-row").querySelector("[data-association-id]").dataset.associationId;e.click();return a')
accepted();a=record('app-row accepted before actual submission');assert a['adapter']['starts']==1 and a['snapshot']['busy'];assert a['adapter']['pendingAtDispatch']['pending']['requestID']==a['snapshot']['activeRequestID'];assert a['disk']['associations'][0]['selectedID']=='scheme:ticket06-preserve'
control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("已提交系统")')
# Stay usable while globally blocked, including protocol view and candidate dialog.
js('document.querySelector(\'[data-view="scheme"]\').click();return true');wait('document.querySelector(\'[data-association-id="scheme:http"]\')');js('document.querySelector(\'[data-association-id="scheme:http"]\').click();return true');wait('document.querySelector("dialog .change-copy-action")');assert js('return [...document.querySelectorAll("dialog .change-copy-action")].every(b=>b.disabled)')
close();record('waiting preserves navigation and cross-kind gate')
# Observing target while callback held cannot release gate.
control(path=TARGET);service(3233615384,{'kind':first.split(':')[0],'key':first.split(':',1)[1]});assert snapshot()['busy'];record('target observation does not invent completion')
# Repeated same-id bridge action has exactly one dispatch, changed parameters conflict.
s=snapshot();r=s['requests'][-1];submission={'requestID':r['requestID'],'association':r['association'],'targetPath':TARGET,'expected':{'known':True,'path':BEFORE}}
assert service(9070636,submission)['outcome']=='existing';submission['targetPath']=OTHER;assert service(9070636,submission)['outcome']=='conflict';assert control()['starts']==1
control(action='complete',path=TARGET);resolved();a=record('exact path confirmation clears record');assert not a['snapshot']['busy'] and 'pending' not in a['disk'];assert len(a['disk']['associations'])==1
# Candidate details submit, successful callback at a different copy.
control(path=BEFORE);file_detail();candidate_submit();accepted();control(action='submitted');control(action='complete',path=OTHER);wait('document.querySelector(".change-status")?.innerText.includes("实际默认与目标不同")');a=record('same bundle id different path remains mismatch');assert not a['snapshot']['requests'][-1]['confirmed']
# Native error and failed readback: keep gate, retry is query-only.
control(path=BEFORE);file_detail();candidate_submit();accepted();control(action='submitted');control(action='complete',path=TARGET,queryError=True,error={'domain':'ControlledNSError','code':42,'description':'System declined'})
wait('document.querySelector(".change-status")?.innerText.includes("回读失败")');a=record('native error independently retained with failed readback');assert a['snapshot']['busy'];before=a['adapter']['starts'];control(queryError=False);js('[...document.querySelectorAll("button")].find(b=>b.textContent==="重新回读").click();return true');wait('document.querySelector(".change-status")?.innerText.includes("系统返回错误 · 已读取实际默认")');a=record('read-only retry releases gate without false success');assert a['adapter']['starts']==before and not a['snapshot']['requests'][-1]['confirmed']
print('native lifecycle phase 1 passed',len(checks))
