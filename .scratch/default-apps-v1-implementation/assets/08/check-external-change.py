# Supplement: two different controlled current observations while the new request
# remains pending, using the formal app without activating its window.
import runpy,json,os,subprocess,time
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
repo=Path.cwd();target='/Applications/Xcode.app';other='/Controlled/Other/Xcode.app'
env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(config_root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(config_root),WAILS_MCP_PORT='9109',DEFAULT_APPS_CHANGE_SMOKE_CURRENT=target)
log=(root/'native-runtime-external.log').open('w')
p=subprocess.Popen([str(repo/'bin/Default Apps Lifecycle QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
for _ in range(150):
 try:
  if js('return !!document.querySelector(".recovery-status")'):break
 except Exception:pass
 time.sleep(.1)
else:raise RuntimeError('recovery UI not ready')
wait('document.querySelector(".recovery-status")?.innerText.includes("当前观察：/Applications/Xcode.app")')
# Native geometry reads only; these actions do not activate the window.
def native(action):
 path=config_root/'native-result.json';path.unlink(missing_ok=True);(config_root/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(120):
  if path.exists():return json.loads(path.read_text())
  time.sleep(.025)
 raise RuntimeError('native geometry read timeout')
native('minimum');time.sleep(.1);geometry=native('geometry');assert geometry['contentWidth']==1000 and geometry['contentHeight']==700,geometry
js('document.querySelector("[data-view=file]").click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog .change-copy-action:not(:disabled)")')
js('document.querySelector(\'[aria-label="设为默认应用 /Controlled/Other/Xcode.app"]\').click();return true');wait('[...document.querySelectorAll("dialog h2")].some(e=>e.textContent==="上次修改仍可能完成")')
js('[...document.querySelectorAll("button")].find(b=>b.textContent==="明确提交新修改").click();return true');wait('document.querySelector(".change-status")?.innerText.includes("已受理")');control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("已提交系统")')
records=[]
for name,path in [('controlled current default reaches new target with callback still absent',other),('controlled old request subsequently changes current default back to old target',target)]:
 control(path=path);service(2260118331,{'kind':'file','key':'com.adobe.pdf'})
 wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').closest(".association-row").innerText.includes('+json.dumps(path)+')')
 state=snapshot();assert state['busy'] and not state['requests'][0]['completion']['known'] and not state['requests'][-1]['completion']['known']
 observation=next(v for v in state['observations'] if v['association']['key']=='com.adobe.pdf');assert observation['default']['app']['path']==path
 records.append({'scenario':name,'pid':p.pid,'nativeGeometry':geometry,'snapshot':state,'DOM':dom(),'disk':disk(),'adapter':control()})
assert records[0]['adapter']['actualStarts']==records[1]['adapter']['actualStarts']==1
assert records[0]['disk']['pending']==records[1]['disk']['pending']
dump('native-external-change.json',records)
service(2163944630);wait('[...document.querySelectorAll("dialog h2")].some(e=>e.textContent==="修改结果仍未确定")')
try:service(3386273962,snapshot()['quit']['promptID'],True)
except Exception:pass
assert p.wait(timeout=8)==0
print(json.dumps({'status':'passed','observations':[other,target],'nativeGeometry':geometry,'actualStarts':1}))
