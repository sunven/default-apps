import runpy,json,pathlib,subprocess,os,time,urllib.error
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
repo=Path.cwd(); TARGET='/Applications/Xcode.app';BEFORE='/Controlled/Before.app';OTHER='/Controlled/Other/Xcode.app'
checks=[];process=None;sequence=0
config_root.mkdir(parents=True,exist_ok=True)
config={'version':1,'associations':[{'input':{'kind':'scheme','value':'ticket08-preserve','label':'Ticket 08 manual marker','source':'manual'},'selectedID':'scheme:ticket08-preserve'}],'applications':[]}
(config_root/'config.json').write_text(json.dumps(config))

def record(name,extra=None):
 value={'scenario':name,'pid':process.pid,'DOM':dom(),'snapshot':snapshot(),'adapter':control(),'disk':disk(),'hooks':hooks()}
 if extra:value.update(extra)
 checks.append(value);dump('native-lifecycle.json',checks);return value

def hooks():
 path=config_root/'quit-hooks.jsonl';return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
def launch(current=BEFORE,query_error=False):
 global process,sequence
 sequence+=1
 for name in ['native-command.json','native-result.json','quit-hooks.jsonl','panel-command.json','panel-result.json']:(config_root/name).unlink(missing_ok=True)
 env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(config_root),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(config_root),WAILS_MCP_PORT='9109',DEFAULT_APPS_CHANGE_SMOKE_CURRENT=current,DEFAULT_APPS_CHANGE_SMOKE_QUERY_ERROR='1' if query_error else '0')
 log=(root/f'native-runtime-{sequence}.log').open('w')
 process=subprocess.Popen([str(repo/'bin/Default Apps Lifecycle QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (config_root/'pid').write_text(str(process.pid))
 for _ in range(180):
  if process.poll() is not None:raise RuntimeError('process died on startup')
  try:
   if js('return !!document.querySelector("[data-view=file]")'):break
  except Exception:pass
  time.sleep(.1)
 else:raise RuntimeError('Wails app not ready')
 wait('document.querySelectorAll("[data-app-path]").length>50')
 native('minimum');time.sleep(.15)
 return process.pid

def native(action):
 result=config_root/'native-result.json';result.unlink(missing_ok=True)
 (config_root/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(120):
  if result.exists():return json.loads(result.read_text())
  if process.poll() is not None:return {'exited':process.returncode,'action':action}
  time.sleep(.025)
 raise RuntimeError('native action timeout '+action)
def click(label):return js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+').click();return true')
def close_details():js('for(const d of [...document.querySelectorAll("dialog[open]")].reverse())d.querySelector("[data-dialog-close]").click();return true')
def choose(target=TARGET):
 close_details();js('document.querySelector(\'[data-view="file"]\').click();return true');wait('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\')')
 js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true');wait('document.querySelector("dialog[open] .change-copy-action")')
 js('document.querySelector("dialog[open] .page-heading button").click();return true');wait('document.querySelector("dialog[open] .page-heading button")?.innerText==="重新查询"')
 js('document.querySelector('+json.dumps('[aria-label="设为默认应用 '+target+'"]')+').click();return true')
def pending(target=TARGET,replace=False,submitted=True):
 choose(target)
 if replace:
  wait('[...document.querySelectorAll("dialog h2")].some(e=>e.textContent==="上次修改仍可能完成")');click('明确提交新修改')
 wait('document.querySelector(".change-status")?.innerText.includes("已受理")')
 if submitted:control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("已提交系统")')
 return snapshot()['activeRequestID']
def prompt(route):
 result=native(route)
 if route!='close':assert result.get('matched'),result
 wait('[...document.querySelectorAll("dialog h2")].some(e=>["修改结果仍未确定","修改结果已可查看"].includes(e.textContent))')
 return result

def exit_by_button(name):
 before={'scenario':name,'pid':process.pid,'disk':disk(),'adapter':control(),'snapshot':snapshot(),'hooks':hooks()}
 try:click('仍然退出')
 except (urllib.error.URLError,TimeoutError,ConnectionError,RuntimeError):pass
 try:code=process.wait(timeout=8)
 except subprocess.TimeoutExpired:raise RuntimeError('explicit exit did not terminate process')
 before.update(exitCode=code,diskAfter=disk());checks.append(before);dump('native-lifecycle.json',checks)
 assert code==0,before

def requery():service(2260118331,{'kind':'file','key':'com.adobe.pdf'})

launch();first=pending();a=record('pending request durable before all native quit routes');assert a['adapter']['actualStarts']==1
route=prompt('menu');prompt_id=snapshot()['quit']['promptID'];prompt('cmd-q');prompt('close');a=record('native menu CmdQ and last-window close share one prompt',{'nativeRoute':route});assert a['snapshot']['quit']['promptID']==prompt_id and a['DOM']['dialogs']==1 and process.poll() is None
assert [h['route'] for h in a['hooks']][-3:]==['ShouldQuit','ShouldQuit','WindowClosing']
assert a['DOM']['active']['label']=='关闭修改结果仍未确定'
native('shift-tab');time.sleep(.1);assert dom()['active']['text']=='仍然退出',dom()
native('tab');time.sleep(.1);assert dom()['active']['label']=='关闭修改结果仍未确定',dom()
pixels('quit-dialog-1000x700.png');native('escape');wait('!document.querySelector("dialog[open]")');record('native Escape stays and restores usable window')
for route in ['menu','cmd-q','close']:
 prompt(route);click('留在应用');wait('!document.querySelector("dialog[open]")');requery();a=record(route+' stay allows read-only query');assert a['snapshot']['busy']
prompt('menu');control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("已确认")');prompt('cmd-q');a=record('completion during prompt does not dismiss or implicitly exit');assert a['snapshot']['quit']['prompt'] and not a['snapshot']['busy'];click('留在应用');wait('!document.querySelector("dialog[open]")')
control(path=BEFORE);first=pending();prompt('menu');exit_by_button('menu explicit exit with pending current-process request')
launch(current=TARGET);wait('document.querySelector(".recovery-status")?.innerText.includes("当前观察：/Applications/Xcode.app")');a=record('actual restart matching old target remains unknown and never replays');assert a['adapter']['starts']==0 and not a['snapshot']['requests'][0]['confirmed'] and not a['snapshot']['requests'][0]['completion']['known'];assert a['disk']['pending']['requestID']==first
choose(OTHER);wait('[...document.querySelectorAll("dialog h2")].some(e=>e.textContent==="上次修改仍可能完成")');pixels('recovery-warning-1000x700.png');native('escape');wait('!document.querySelector("dialog[open]")');a=record('native Escape dismisses replacement warning without setter');assert a['adapter']['starts']==0 and a['disk']['pending']['requestID']==first
choose(OTHER);click('返回');wait('!document.querySelector("dialog[open]")');assert control()['starts']==0
control(queryError=True);requery();wait('document.querySelector(".recovery-status")?.innerText.includes("当前查询失败")');a=record('recovered query failure retains requery and blocks writes');assert a['snapshot']['busy'] and not a['snapshot']['recovery']['ready'];pixels('recovery-query-failure-1000x700.png')
control(queryError=False);requery();wait('!document.querySelector(".recovery-status")?.innerText.includes("当前查询失败")')
second=pending(OTHER,replace=True);a=record('explicit new request atomically replaces old record');assert a['disk']['pending']['requestID']==second!=first and a['adapter']['actualStarts']==1 and len(a['disk']['associations'])==1
control(path=OTHER);requery();control(path=TARGET);requery();a=record('controlled old-request external effect stays independent of new pending completion');assert a['snapshot']['busy'] and not a['snapshot']['requests'][-1]['completion']['known']
prompt('cmd-q');exit_by_button('CmdQ explicit exit with replacement pending')
launch();wait('document.querySelector(".recovery-status")?.innerText.includes("当前观察：/Controlled/Before.app")');a=record('actual restart different current copy still old result unknown');assert a['adapter']['actualStarts']==0 and not a['snapshot']['requests'][0]['completion']['known']
third=pending(replace=True);prompt('close');exit_by_button('native last-window close explicit exit with replacement pending')
launch();wait('document.querySelector(".recovery-status")');fourth=pending(replace=True);a=record('submitted request before force kill');assert a['adapter']['actualStarts']==1
process.kill();code=process.wait(timeout=8);checks.append({'scenario':'force kill after controlled native initiation','exitCode':code,'diskAfter':disk()});dump('native-lifecycle.json',checks);assert code==-9
launch();wait('document.querySelector(".recovery-status")');a=record('actual restart after force kill performs zero setters');assert a['adapter']['starts']==0 and a['disk']['pending']['requestID']==fourth
fifth=pending(replace=True,submitted=False);a=record('durable acceptance before actual native initiation');assert a['adapter']['actualStarts']==0 and a['disk']['pending']['requestID']==fifth
process.kill();code=process.wait(timeout=8);checks.append({'scenario':'force kill after save before actual native initiation','exitCode':code,'diskAfter':disk()});dump('native-lifecycle.json',checks)
launch(query_error=True);wait('document.querySelector(".recovery-status")?.innerText.includes("当前查询失败")');a=record('fresh-process query failure after pre-dispatch crash is conservative');assert a['adapter']['actualStarts']==0 and a['snapshot']['busy'] and a['snapshot']['recovery']['record']['requestID']==fifth
control(queryError=False);requery();pending(replace=True);control(clearError=True);control(action='complete',path=TARGET);wait('document.querySelector(".change-status")?.innerText.includes("未定记录清除失败")');a=record('known completion and independent clear error retained this session');assert a['snapshot']['requests'][-1]['confirmed'];assert 'pending' in a['disk'];pixels('clear-error-1000x700.png')
# No pending current-process result remains, so a native menu quit is immediate.
native('menu');code=process.wait(timeout=8);checks.append({'scenario':'resolved clear failure exits without a pending callback prompt','exitCode':code,'diskAfter':disk()});dump('native-lifecycle.json',checks)
launch(current=TARGET);wait('document.querySelector(".recovery-status")?.innerText.includes("当前观察：/Applications/Xcode.app")');a=record('leftover clear failure restarts unknown even with matching actual default');assert not a['snapshot']['requests'][0]['confirmed'] and a['adapter']['actualStarts']==0
pixels('recovery-current-matches-1000x700.png');prompt('menu');exit_by_button('final explicit exit preserves leftover record')
dump('native-summary.json',{'layer':'formal Wails app + controlled adapter; AppKit synthesized native menu/key/window actions','checks':len(checks),'processes':sequence,'dailySystemSetters':0,'status':'passed'})
print(json.dumps({'checks':len(checks),'processes':sequence,'status':'passed'}))
