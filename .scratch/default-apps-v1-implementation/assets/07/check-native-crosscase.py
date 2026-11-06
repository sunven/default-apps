import runpy,time,json,subprocess,os,signal,sys
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
repo=Path.cwd();TARGET='/Applications/Xcode.app';OTHER='/Controlled/Other/Xcode.app';PDF={'kind':'file','key':'com.adobe.pdf'}
binary=repo/'bin/Default Apps Sync QA.app/Contents/MacOS/default-apps'
checks=[]
def record(name,**extra):
 state=snapshot();state['observations']=[o for o in state['observations'] if o['association']==PDF]
 adapter=control();adapter['queryCount']=len(adapter['queries']);adapter['queries']=adapter['queries'][-8:]
 value={'scenario':name,'DOM':dom(),'snapshot':state,'adapter':adapter,'disk':disk(),**extra}
 checks.append(value);dump('native-crosscase.json',checks);print(name,flush=True);return value
def poll(check):
 for _ in range(150):
  result=control()
  if check(result):return result
  time.sleep(.05)
 raise AssertionError('adapter timeout '+str(result))
def kill_owned(sig):
 pid=int((config_root/'pid').read_text())
 command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True).strip()
 assert command==str(binary),(pid,command)
 os.kill(pid,sig)
 for _ in range(100):
  live=subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True)
  if live.returncode or live.stdout.strip().startswith('Z'):return pid
  time.sleep(.05)
 raise AssertionError('owned process did not exit')
def ready():
 for _ in range(150):
  try:
   if call('windows_list'):break
  except Exception:pass
  time.sleep(.1)
 else:raise AssertionError('MCP startup timeout')
 wait('document.querySelector("[data-view]")&&!document.querySelector(".scan-status")')
 call('window_control',action='set_size',width=1000,height=728)
def reload():
 js('setTimeout(()=>location.reload(),30);return true');time.sleep(.4)
 # A deliberately held config write may also hold catalog startup; the reload
 # boundary is the mounted frontend, not completion of the unrelated scan.
 wait('document.querySelector(".app-shell")')
def detail():
 js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();document.querySelector(\'[data-view="file"]\').click();return true')
 wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')')
 js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true')
 wait('document.querySelector("dialog[open] .change-copy-action")')
 js('document.querySelector("dialog[open] .page-heading button").click();return true')
 wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')

def finish(original):
 control(path=TARGET);service(3233615384,PDF)
 wait('document.querySelector(".change-status")?.innerText.includes("实际默认：/Applications/Xcode.app")')
 detail()
 wait('document.querySelector("dialog[open]")?.innerText.includes("/Applications/Xcode.app")')
 state=snapshot();request=next(r for r in state['requests'] if r['requestID']==original['requestID'])
 assert request['target']['path']==OTHER and request['readback']['observation']['app']['path']==OTHER and request['confirmed']
 row=js('return document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').closest(".association-row").innerText')
 assert TARGET in row and control()['starts']==1
 record('external refresh updates status row and detail while preserving original confirmed result',row=row,detail=js('return document.querySelector("dialog[open]").innerText'))
 pixels('crosscase-resolved-detail.png')
 js('document.querySelector("dialog[open] [data-dialog-close]").click();return true')
 pixels('crosscase-resolved.png')
 kill_owned(signal.SIGTERM)
 print('native crosscase passed',len(checks),flush=True)

# Resume the observation-only final check after fixing its row selector; the
# persisted run already contains the uninterrupted 90-second request lifetime.
if '--finish' in sys.argv:
 checks=json.loads((root/'native-crosscase.json').read_text())
 finish(checks[3]['original'])
 sys.exit(0)

# Clean start is isolated to this runner's prior owned app and config root.
kill_owned(signal.SIGKILL)
subprocess.run(['python3',str(root/'launch-smoke.py')],check=True)
ready();detail()
js('document.querySelector(\'[aria-label="设为默认应用 /Applications/Xcode.app"]\').click();return true')
poll(lambda v:v['starts']==1);control(action='submitted')
wait('document.querySelector(".change-status")?.innerText.includes("等待系统返回")')
old=snapshot()['activeRequestID'];assert disk()['pending']['requestID']==old
record('original UI request persisted and submitted before process interruption')
interrupted_pid=kill_owned(signal.SIGKILL)
env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(config_root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(config_root),DEFAULT_APPS_CHANGE_SMOKE_CURRENT=TARGET,WAILS_MCP_PORT='9108')
with (root/'native-crosscase-runtime.log').open('w') as log:
 process=subprocess.Popen([str(binary)],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(config_root/'pid').write_text(str(process.pid));(root/'native-pid.txt').write_text(str(process.pid))
ready();wait('document.querySelector(".recovery-status")?.innerText.includes("当前观察：/Applications/Xcode.app")')
state=snapshot();recovered=next(r for r in state['requests'] if r['requestID']==old)
assert state['recovery']['record']['requestID']==old and recovered['phase']=='recovered' and not recovered['confirmed'] and not recovered['completion']['known'] and control()['starts']==0
record('restart observes old target but keeps old result unknown with zero dispatch',interruptedPID=interrupted_pid,restartedPID=process.pid)
reload();assert snapshot()['recovery']['record']['requestID']==old and control()['starts']==0
record('frontend reload preserves recovery without replay')
detail();control(holdSave=True)
js('document.querySelector(\'[aria-label="设为默认应用 /Controlled/Other/Xcode.app"]\').click();return true')
wait('[...document.querySelectorAll("dialog[open]")].some(d=>d.innerText.includes("明确提交新修改"))')
js('[...document.querySelectorAll("button")].find(b=>b.textContent==="明确提交新修改").click();return true')
poll(lambda v:v['saving'])
original=js('return JSON.parse(sessionStorage.getItem("defaultapps.submission.v1")).input')
assert original['recoveryRequestID']==old and original['targetPath']==OTHER and original['requestID']!=old
assert control()['starts']==0 and disk()['pending']['requestID']==old
record('explicit replacement persists original input and recovery acknowledgement before held save',original=original)
reload();wait('document.querySelector(".change-status")?.innerText.includes("核对受理条件")')
assert js('return JSON.parse(sessionStorage.getItem("defaultapps.submission.v1")).input')==original and control()['starts']==0
assert service(3692139412,original)['state']=='pending'
record('reload reconciles held replacement using same acknowledged input with zero dispatch')
control(action='release-save');poll(lambda v:v['starts']==1)
wait('document.querySelector(".change-status")?.innerText.includes("已受理")')
state=snapshot();assert state['activeRequestID']==original['requestID'] and not state.get('recovery') and disk()['pending']['requestID']==original['requestID']
assert js('return sessionStorage.getItem("defaultapps.submission.v1")===null')
control(action='submitted');held_since=time.monotonic()
wait('document.querySelector(".change-status")?.innerText.includes("等待系统返回")')
record('one accepted replacement owns completion after original frontend left')
call('window_control',action='close')
wait('[...document.querySelectorAll("button")].some(b=>b.textContent==="留在应用")')
assert snapshot()['quit']['prompt']
js('[...document.querySelectorAll("button")].find(b=>b.textContent==="留在应用").click();return true')
wait('!document.querySelector("dialog[open]")')
assert snapshot()['activeRequestID']==original['requestID'] and snapshot()['busy'] and not snapshot()['quit']['exiting']
record('common native close hook stay response preserves pending request')
pixels('crosscase-pending.png')
while time.monotonic()-held_since<90:
 time.sleep(min(10,90-(time.monotonic()-held_since)))
 print('held completion seconds',round(time.monotonic()-held_since,3),flush=True)
state=snapshot();request=next(r for r in state['requests'] if r['requestID']==original['requestID'])
assert state['busy'] and not request['completion']['known'] and control()['starts']==1
elapsed=time.monotonic()-held_since
record('completion remains pending beyond 90 seconds without timeout or repeat dispatch',heldSeconds=elapsed)
control(action='complete',path=OTHER)
wait('document.querySelector(".change-status")?.innerText.includes("已确认本次修改")')
state=snapshot();request=next(r for r in state['requests'] if r['requestID']==original['requestID'])
assert not state['busy'] and request['confirmed'] and request['readback']['observation']['app']['path']==OTHER and control()['starts']==1 and control()['actualStarts']==1
record('very late completion confirms the original replacement exactly once',heldSeconds=elapsed)
finish(original)
