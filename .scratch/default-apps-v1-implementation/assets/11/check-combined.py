import runpy,json,pathlib,time,os,signal
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
checks=[];keys=[];fixture=json.loads((root/'combined-fixtures.json').read_text())['applications'][0]['path']
CMD=1<<20;SHIFT=1<<17

def record(name,extra=None):
 value={'scenario':name,'at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'DOM':dom(),'focus':focus(),'starts':control()['starts'],'snapshot':snapshot()}
 if extra:value.update(extra)
 checks.append(value);dump('combined-native.json',checks);return value

def step(name,char,code=0,flags=0,expected=None):
 key(char,code,flags);state=focus();keys.append({'step':name,'focus':state});dump('combined-keyboard.json',keys)
 for k,v in (expected or {}).items():assert state.get(k)==v,(name,k,v,state)
 return state

def value(label):return js('return document.querySelector('+json.dumps('input[aria-label="'+label+'"]')+').value')

def select_fixture():
 js('document.querySelector("[data-view=app]").click();return true')
 fill('input[aria-label="搜索应用名称、版本、路径或声明"]','Final Acceptance')
 wait('document.querySelectorAll("[data-app-path]").length===102')
 js('const b=document.querySelector('+json.dumps('[data-app-path="'+fixture+'"]')+');b.click();b.focus();return true')
 wait('document.querySelectorAll("[data-association-id]").length===1000')

select_fixture();g=geometry();assert g['content']==[1000,700] and g['frame']==[1000,732]
record('102 real manual fixture bundles and 1000 declarations at minimum content',{'geometry':g,'catalog':service(2011754152)})
# Explicit real React action; only the build-tagged adapter receives this setter.
js('document.querySelector(".association-row .row-submit").click();return true')
wait('document.querySelector(".change-status")?.innerText.includes("已受理")')
control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("已提交系统")')
request=snapshot()['activeRequestID'];assert snapshot()['requests'][-1]['target']['path']==fixture
record('long-path pending request remains visible above stress lists',{'requestID':request});pixels('combined-pending-stress.png')
# Independent nonzero offsets must remain during real discovery refresh.
scroll=js('const a=document.querySelector(".application-list"),r=document.querySelector(".association-list");a.scrollTop=333;r.scrollTop=777;return [a.scrollTop,r.scrollTop,scrollY]')
assert scroll==[333,777,0],scroll
started=time.monotonic();click('重新扫描应用')
wait('!document.body.innerText.includes("正在扫描应用")')
a=record('nonzero list offsets and selection retained after real scan',{'durationMS':round((time.monotonic()-started)*1000)})
assert [p['scroll'] for p in a['DOM']['panes']]==[333,777],a['DOM'];assert control()['starts']==1
assert js('return document.querySelector("[data-app-path][aria-pressed=true]").dataset.appPath')==fixture
assert value('搜索应用名称、版本、路径或声明')=='Final Acceptance'
pixels('combined-nonzero-refresh.png')
# Store separate searches/selection/scroll in each entry while one request waits.
fill('input[aria-label="筛选当前关联"]','final11-scheme-0');js('document.querySelector(".association-list").scrollTop=555;return true')
step('Command-2 during pending','2',19,CMD,{'view':'file'})
fill('input[aria-label="搜索文件类型"]','pdf')
step('Command-3 during pending','3',20,CMD,{'view':'scheme'})
fill('input[aria-label="搜索URL 协议"]','final11-scheme-09');js('document.querySelector(".association-list").scrollTop=444;return true')
step('Command-1 restores app session','1',18,CMD,{'view':'app'})
assert value('筛选当前关联')=='final11-scheme-0'
assert dom()['panes'][1]['scroll']==555
step('Command-2 restores file search','2',19,CMD,{'view':'file'});assert value('搜索文件类型')=='pdf'
step('Command-3 restores protocol search','3',20,CMD,{'view':'scheme'});assert dom()['panes'][1]['scroll']==444
assert value('搜索URL 协议')=='final11-scheme-09'
record('three entry sessions preserved during pending; no extra setter')
# Catalog row with request label for visual review.
fill('input[aria-label="搜索URL 协议"]','final11-scheme-0000');pixels('pending-catalog-before.png')
step('Command-1 returns app','1',18,CMD,{'view':'app'})
step('Command-F app search','f',3,CMD,{'label':'搜索应用名称、版本、路径或声明'})
step('Down enters current app','\uf701',125,expected={'path':fixture})
step('Enter enters association','\r',36);first=focus()['association'];assert first
step('Tab row detail','\t',48,expected={'text':'详情…'})
step('ShiftTab row identity','\t',48,SHIFT,{'association':first})
step('End association list','\uf72b',119);last=focus()['association'];assert last!=first
step('Up association list','\uf700',126);assert focus()['association']!=last
step('Home association list','\uf729',115,expected={'association':first})
step('Enter candidate dialog','\r',36,expected={'dialogs':1})
step('Candidate ShiftTab wrap','\t',48,SHIFT,{'dialogs':1})
step('Candidate Tab wrap','\t',48,expected={'label':'关闭final11-scheme-0000'})
step('Candidate Escape returns row','\x1b',53,expected={'dialogs':0,'association':first})
# Manual and picker cancellation through native sheets; previous human successes reused.
click('手动补充…');wait('document.querySelector("dialog[open]")')
step('Manual ShiftTab wrap','\t',48,SHIFT,{'text':'添加应用位置…'})
step('Manual Tab wrap','\t',48,expected={'label':'关闭手动补充'})
fill('.manual-value input','final11-unresolved-extension-not-a-type');click('解析输入')
wait('document.querySelector(".manual-unresolved")');assert js('return [...document.querySelectorAll("button")].find(b=>b.innerText==="保存手动关联").disabled')
record('unresolved manual input explains and prohibits save');pixels('combined-unresolved.png')
pre=disk();click('选择文件识别类型…');time.sleep(.3);p=panel('inspect');assert p['found'] and p['files'];panel('cancel');time.sleep(.2);assert disk()==pre
record('native file picker cancel preserves config',{'panel':p})
click('添加应用位置…');time.sleep(.3);p=panel('inspect');assert p['found'];panel('cancel');time.sleep(.2);assert disk()==pre
record('native app picker cancel preserves config',{'panel':p})
step('Manual Escape restores header trigger','\x1b',53,expected={'dialogs':0,'text':'手动补充…'})
# Readback failure is visibly distinct, requery is available, pending row remains original.
control(action='complete',path=fixture,queryError=True)
wait('document.querySelector(".change-status")?.innerText.includes("回读失败")')
record('combined readback error keeps known callback and current gate');pixels('combined-readback-failure.png')
control(queryError=False);click('重新回读');wait('document.querySelector(".change-status")?.innerText.includes("已确认")')
record('query-only recovery confirms exact original target without second setter')
assert control()['starts']==1
# No-declaration and no-results states with long finished status above them.
fill('input[aria-label="搜索应用名称、版本、路径或声明"]','Final Acceptance 001')
wait('document.querySelectorAll("[data-app-path]").length===1')
js('const b=document.querySelector("[data-app-path]");b.click();b.focus();return true')
step('No declaration Enter focuses filter','\r',36,expected={'label':'筛选当前关联'})
pixels('combined-no-declarations.png')
fill('input[aria-label="搜索应用名称、版本、路径或声明"]','absent-final11')
wait('document.querySelector(".empty-workspace")');assert js('return document.querySelectorAll("[data-association-id]").length')==0
pixels('combined-empty.png');record('empty result clears rows without hiding status/navigation')
# Begin another controlled pending action for real process restart and new dialog focus.
select_fixture();fill('input[aria-label="筛选当前关联"]','')
control(path='/Controlled/Before.app');service(2260118331,{'kind':'scheme','key':'final11-scheme-0000'})
js('document.querySelector(".association-row .row-submit").click();return true');wait('document.querySelector(".change-status")?.innerText.includes("已受理")');control(action='submitted')
old=snapshot()['activeRequestID'];native('menu');wait('document.querySelector("dialog[open]")')
step('Quit ShiftTab wrap','\t',48,SHIFT,{'text':'仍然退出'})
step('Quit Tab wrap','\t',48,expected={'label':'关闭修改结果仍未确定'})
pixels('combined-quit.png');step('Quit Escape stays','\x1b',53,expected={'dialogs':0})
record('combined native quit warning focus and stay')
native('close');wait('document.querySelector("dialog[open]")')
try:click('仍然退出')
except Exception:pass
pid=int((config_root/'pid').read_text());time.sleep(.6)
try:os.kill(pid,0);raise AssertionError('process still alive')
except ProcessLookupError:pass
record_exit={'pid':pid,'recordID':old,'disk':disk()};dump('combined-exit.json',record_exit)
# New actual process on same isolated config; no replay.
launch('controlled',2);wait('document.querySelector(".recovery-status")')
assert control()['starts']==0 and snapshot()['recovery']['record']['requestID']==old
select_fixture();a=record('actual restart with long target and stress catalog; old result unknown');pixels('combined-recovery-stress.png')
js('document.querySelector(".association-row .row-submit").click();return true');wait('[...document.querySelectorAll("dialog h2")].some(e=>e.innerText==="上次修改仍可能完成")')
step('Recovery ShiftTab wrap','\t',48,SHIFT,{'text':'明确提交新修改'})
step('Recovery Tab wrap','\t',48,expected={'label':'关闭上次修改仍可能完成'})
pixels('combined-recovery-warning.png');step('Recovery Escape returns sensible focus','\x1b',53,expected={'dialogs':0})
assert control()['starts']==0;record('dismissed recovery warning retains old record and zero setter')
# New explicit replacement submitted via same selected row.
js('document.querySelector(".association-row .row-submit").click();return true');wait('document.querySelector("dialog[open]")');click('明确提交新修改')
wait('document.querySelector(".change-status")?.innerText.includes("已受理")');control(action='submitted');control(action='complete',path=fixture)
wait('document.querySelector(".change-status")?.innerText.includes("已确认")');record('explicit new request resolves and clears isolated record')
assert control()['starts']==1 and not disk().get('pending')
native('menu');time.sleep(.3)
dump('combined-summary.json',{'status':'通过','layer':'formal Wails + real native window/keys/pickers/discovery + controlled defaults/setter','checks':len(checks),'keyboardSteps':len(keys),'ordinarySystemSetters':0,'fixtureBundles':102,'fixtureDeclarations':1000,'content':[1000,700],'DOM':[1001,701],'nativeTitlebar':32,'finalConfigPending':disk().get('pending')})
print('passed',len(checks),'combined checks;',len(keys),'keyboard steps')
