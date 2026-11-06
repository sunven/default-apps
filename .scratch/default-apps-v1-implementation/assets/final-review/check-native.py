import pathlib,json,plistlib,subprocess,os,time,urllib.request,datetime,hashlib
repo=pathlib.Path('/Users/sunven/github/default-apps');e=repo/'.scratch/default-apps-v1-implementation/assets/final-review'
isolated=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/final-review-controlled-3')
if (isolated/'config.json').exists():raise SystemExit('Dedicated config exists; inspect checkpoint before rerunning')
isolated.mkdir(parents=True,exist_ok=True);e.mkdir(parents=True,exist_ok=True)
def dump(name,obj):(e/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
apps=[]
for name,scheme in [('Review Transient','review-final-transient'),('Review Persistent','review-final-persistent')]:
 p=isolated/'fixtures'/(name+'.app');(p/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
 info={'CFBundleName':name,'CFBundleDisplayName':name,'CFBundleIdentifier':'io.defaultapps.review.'+scheme,'CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundleExecutable':'inert','CFBundlePackageType':'APPL','CFBundleURLTypes':[{'CFBundleURLSchemes':[scheme]}]}
 if name=='Review Persistent':info['CFBundleDocumentTypes']=[{'CFBundleTypeName':'Review Unresolved','CFBundleTypeExtensions':['reviewfinalunresolved20261106'],'CFBundleTypeRole':'Viewer'}]
 (p/'Contents/Info.plist').write_bytes(plistlib.dumps(info));(p/'Contents/MacOS/inert').write_text('#!/bin/sh\nexit 0\n');(p/'Contents/MacOS/inert').chmod(0o755)
 apps.append({'path':str(p),'displayPath':str(p),'name':name,'version':'1.0','bundleID':info['CFBundleIdentifier']})
doc={'version':1,'applications':apps,'associations':[{'input':{'kind':'scheme','value':'review-final-manual','label':'Review manual marker','source':'manual'},'selectedID':'scheme:review-final-manual'}]}
(isolated/'config.json').write_text(json.dumps(doc));dump('native-fixtures.json',{'root':str(isolated),'applications':apps,'registered':False,'systemSetters':0})

def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9111/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req,timeout=8))['result']
 if result.get('isError'):raise RuntimeError(result)
 value=result['content'][0]['text']
 try:return json.loads(value)
 except json.JSONDecodeError:return value

def js(code):return call('js_eval',js=code)
def service(method,*args):return js('const dispatcher=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=dispatcher;return await Call.ByID('+str(method)+''.join(','+json.dumps(a) for a in args)+')')
def wait(code):
 for _ in range(100):
  if js('return !!('+code+')'):return
  time.sleep(.1)
 raise RuntimeError('UI timeout '+code)
def click(label):return js('const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(label)+');if(!b)throw Error("missing button "+'+json.dumps(label)+');b.focus();b.click();return true')
def fill(selector,value):return js('const e=document.querySelector('+json.dumps(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));return true')
def control(**command):
 req=urllib.request.Request((isolated/'control-address').read_text()+'/control',data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=8))
def native(action):
 result=isolated/'native-result.json';result.unlink(missing_ok=True);(isolated/'native-command.json').write_text(json.dumps({'action':action}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  if process.poll() is not None:return {'exitCode':process.returncode}
  time.sleep(.05)
 raise RuntimeError('native action timeout '+action)
def panel(command,path=''):
 result=isolated/'panel-result.json';result.unlink(missing_ok=True);(isolated/'panel-command.json').write_text(json.dumps({'command':command,'path':path}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise RuntimeError('panel action timeout '+command)
def capture(name):
 path=e/name;panel('snapshot',str(path))
 for _ in range(100):
  if path.exists():return
  time.sleep(.05)
 raise RuntimeError('snapshot missing')
def snapshot():return service(3439020780)
def catalog():return service(2011754152)
checks=[]
def record(name,**extra):
 value={'check':name,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshot':snapshot(),'control':control(),'view':js('return document.querySelector("[data-view][aria-pressed=true]")?.dataset.view'),'dialog':js('return document.querySelector("dialog[open]")?.innerText'),'viewport':js('return [innerWidth,innerHeight,document.documentElement.scrollWidth-innerWidth]')}
 value.update(extra);checks.append(value);dump('native-regressions.json',checks)

app=repo/'bin/Default Apps Review QA.app';env=os.environ.copy();env.update(DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(isolated),DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(isolated),WAILS_MCP_PORT='9111')
log=(e/'native-runtime.log').open('w');process=subprocess.Popen([str(app/'Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);(isolated/'pid').write_text(str(process.pid))
try:
 for _ in range(100):
  try:
   if js('return !!document.querySelector("[data-view=app]")'):break
  except Exception:pass
  if process.poll() is not None:raise RuntimeError('app exited')
  time.sleep(.1)
 wait('document.querySelectorAll("[data-app-path]").length>0&&!document.body.innerText.includes("正在扫描应用")');native('minimum');panel('activate')
 fill('input[aria-label="搜索应用名称、版本、路径或声明"]','review-final')
 wait('document.querySelectorAll("[data-app-path]").length===2')
 target=apps[0]['path'];js('document.querySelector('+json.dumps('[data-app-path="'+target+'"]')+').click();return true')
 fill('input[aria-label="筛选当前关联"]','review-final')
 wait('document.querySelector(".row-submit")&&!document.querySelector(".row-submit").disabled')
 js('document.querySelector(".row-submit").click();return true')
 wait('document.querySelector(".change-status")?.innerText.includes("已受理")');control(action='submitted');wait('document.querySelector(".change-status")?.innerText.includes("已提交系统")')
 request=snapshot()['activeRequestID'];assert snapshot()['requests'][-1]['association']=={'kind':'scheme','key':'review-final-transient'}
 record('controlled original request submitted',requestID=request)
 old=pathlib.Path(target);old.rename(old.with_suffix('.removed'))
 scanBefore=catalog()['version'];click('重新扫描应用')
 for _ in range(100):
  current=catalog()
  if current['version']>scanBefore and not current['scanning']:break
  time.sleep(.1)
 wait('!document.body.innerText.includes("正在扫描应用")')
 assert not any(v['id']=='scheme:review-final-transient' for v in catalog()['entries'])
 before=len(control()['queries']);click('返回请求项');wait('document.querySelector("dialog[open]")')
 wait('document.querySelector("dialog[open]").innerText.includes("review-final-transient")')
 click('重新查询');wait('!document.querySelector("dialog[open]").innerText.includes("正在查询…")')
 assert any(v=={'kind':'scheme','key':'review-final-transient'} for v in control()['queries'][before:])
 assert snapshot()['activeRequestID']==request and control()['starts']==1
 record('return after source disappearance keeps exact original identity and query');capture('missing-request-detail.png')
 native('escape');js('document.querySelector("[data-view=app]").click();return true')
 assert js('return document.querySelector('+json.dumps('input[aria-label="搜索应用名称、版本、路径或声明"]')+').value')=='review-final'
 assert js('return document.querySelector('+json.dumps('input[aria-label="筛选当前关联"]')+').value')=='review-final'
 assert js('return document.querySelector("[data-view][aria-pressed=true]").dataset.view')=='app'
 record('return preserves original app session')
 control(action='complete',path=target);wait('document.querySelector(".change-status")?.innerText.includes("已确认")')
 for _ in range(100):
  if not json.loads((isolated/'config.json').read_text()).get('pending'):break
  time.sleep(.05)
 assert not json.loads((isolated/'config.json').read_text()).get('pending')
 js('document.querySelector("[data-view=file]").click();return true');fill('input[aria-label="搜索文件类型"]','reviewfinalunresolved20261106')
 wait('document.querySelectorAll("[data-association-id]").length===1')
 js('document.querySelector("[data-association-id]").click();return true');wait('document.querySelector("dialog[open]")?.innerText.includes("重新解析")')
 before=catalog()['version'];p=pathlib.Path(apps[1]['path'])/'Contents/Info.plist';info=plistlib.loads(p.read_bytes());info['CFBundleShortVersionString']='2.0';p.write_bytes(plistlib.dumps(info))
 click('重新解析')
 for _ in range(100):
  current=catalog()
  if current['version']>before and not current['scanning']:break
  time.sleep(.1)
 wait('!document.body.innerText.includes("正在扫描应用")')
 latest=catalog();assert latest['version']>before
 assert any(a['app']['path']==apps[1]['path'] and a['app']['version']=='2.0' for a in latest['apps'])
 assert any(v['id']=='scheme:review-final-manual' for v in latest['entries'])
 assert any(v['id']=='scheme:review-final-persistent' for v in latest['entries'])
 assert js('return document.querySelector("dialog[open]").innerText.includes("reviewfinalunresolved20261106")')
 record('reparse invokes full discovery, preserves unresolved selection and manual/declaration sources',catalogVersion=latest['version'],previousVersion=before);capture('unresolved-reparse.png')
 native('escape');assert control()['starts']==1
 native('menu');code=process.wait(timeout=10);assert code==0
 dump('native-summary.json',{'passed':True,'layer':'formal Wails React, native discovery/window, controlled default/setter only','checks':len(checks),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'pid':process.pid,'exitCode':code,'systemSetters':0,'controlledStarts':1,'fixturesRegistered':False,'limits':'Same-source unresolved-to-resolved and out-of-order bridge failures covered by public React tests; this run verifies full-scan wiring and unchanged unresolved behavior with native resolver.'})
 print('passed',len(checks),'focused formal Wails checks')
finally:
 if process.poll() is None:process.terminate();process.wait(timeout=10)
 log.close()
