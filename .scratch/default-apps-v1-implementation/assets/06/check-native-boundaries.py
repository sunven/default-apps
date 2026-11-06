import runpy
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
TARGET='/Applications/Xcode.app';BEFORE='/Controlled/Before.app';OTHER='/Controlled/Other/Xcode.app'
checks=[]
def record(name,reply=None):
 v={'scenario':name,'DOM':dom(),'snapshot':snapshot(),'adapter':control(),'disk':disk(),'reply':reply};checks.append(v);dump('native-boundaries.json',checks);return v

def close():js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();return true')
def file_detail():
 close();js('document.querySelector(\'[data-view="file"]\').click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog[open] .change-copy-action")');js('document.querySelector("dialog[open] .page-heading button").click();return true');wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')
def submit():js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true');wait('!document.querySelector("dialog[open]")')
def note(text):wait('document.querySelector(".change-status")?.innerText.includes('+json.dumps(text)+')')
base=control()['starts']
control(path=BEFORE);file_detail();control(path=OTHER);submit();note('用户查看的默认已变化');assert control()['starts']==base;record('preflight externally changed default returns fresh observation')
control(path=TARGET);file_detail();submit();note('目标已经是当前具体应用副本');assert control()['starts']==base;record('preflight already target no-op')
control(path=BEFORE);file_detail();control(unavailable=True);submit();note('controlled target unavailable');assert control()['starts']==base;record('preflight unavailable target no dispatch');control(unavailable=False)
file_detail();control(queryError=True);submit();note('controlled readback unavailable');assert control()['starts']==base;record('preflight query failure no dispatch');control(queryError=False)
# Unresolved identity enters the same formal bound service; UI unresolved rows expose no usable submission.
reply=service(9070636,{'requestID':'native-unresolved','association':{'kind':'file','key':'io.github.sunven.nonexistent.ticket06'},'targetPath':TARGET,'expected':{'known':True,'path':BEFORE}});assert reply['outcome']=='invalid' and control()['starts']==base;record('unresolved identity rejected through bound service',reply)
file_detail();control(saveError=True);submit();note('controlled storage denied');assert control()['starts']==base and 'pending' not in disk();record('save failure leaves no setter and preserves manual data');control(saveError=False)
file_detail();submit();note('已受理 · 等待提交系统');control(action='submitted');control(action='complete',path=TARGET,clearError=True);note('未定记录清除失败');a=record('known success with separate record-clear error');assert a['snapshot']['requests'][-1]['confirmed'] and not a['snapshot']['busy'] and a['disk']['pending']['requestID']==a['snapshot']['requests'][-1]['requestID'];oldID=a['disk']['pending']['requestID']
# Next explicit action replaces leftover record safely, then minimum content evidence during waiting.
control(path=BEFORE,clearError=False);file_detail();submit();note('已受理 · 等待提交系统');control(action='submitted');note('已提交系统');assert disk()['pending']['requestID']!=oldID
js('document.querySelector(\'[data-view="app"]\').click();return true');wait('document.querySelector(\'[data-app-path="/Applications/Xcode.app"]\')');js('document.querySelector(\'[data-app-path="/Applications/Xcode.app"]\').click();return true')
call('window_control',action='set_size',width=999,height=731);time.sleep(.4)
geometry=js('const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,scroll:e.scrollHeight,client:e.clientHeight}};return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,status:box(".change-status"),application:box(".app-heading"),search:box(".association-toolbar"),apps:box(".application-list"),associations:box(".association-list"),buttons:[...document.querySelectorAll(".row-submit")].map(b=>({disabled:b.disabled})),windowScroll:scrollY}')
assert geometry['viewport']==[1000,700] and geometry['overflow']==0 and geometry['windowScroll']==0
assert geometry['status']['bottom']<geometry['viewport'][1] and geometry['search']['bottom']<geometry['viewport'][1] and geometry['associations']['client']>150 and all(b['disabled'] for b in geometry['buttons'])
dump('native-minimum.json',geometry);pixels('native-pending-minimum.png');record('pending status and controls remain reachable at minimum content size')
# Current request can be reached from another view and queried, with no new setter.
js('document.querySelector(\'[data-view="scheme"]\').click();return true');js('[...document.querySelectorAll("button")].find(b=>b.textContent==="返回请求项").click();return true');wait('document.querySelector("dialog[open]")?.innerText.includes("com.adobe.pdf")');record('return to original request item');close()
control(action='complete',path=TARGET);note('已确认本次修改');a=record('later request clears previous storage uncertainty');assert not a['snapshot']['busy'] and 'pending' not in a['disk'] and len(a['disk']['associations'])==1
print('native boundaries passed',len(checks))
