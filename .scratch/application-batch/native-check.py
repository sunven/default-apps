import json, os, pathlib, plistlib, shutil, socket, subprocess, time, urllib.request, uuid
base=pathlib.Path(__file__).resolve().parent
repo=base.parents[1]
root=base/('native-'+uuid.uuid4().hex[:8]);root.mkdir()
token=uuid.uuid4().hex
keys=['org.defaultapps.applicationbatch.'+token+'.'+suffix for suffix in ['one','two']]
lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
registered=[];process=None;events=[]
log=(root/'runtime.log').open('w')
def wait(fn,label,timeout=25):
 end=time.monotonic()+timeout;last=''
 while time.monotonic()<end:
  try:
   result=fn()
   if result:return result
  except Exception as err:last=str(err)
  time.sleep(.1)
 raise RuntimeError(label+': '+last)
def js(code):
 request=urllib.request.Request(address,data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'js_eval','arguments':{'js':code}}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(request,timeout=10))['result']
 if result.get('isError'):raise RuntimeError(result)
 value=result['content'][0]['text']
 try:return json.loads(value)
 except json.JSONDecodeError:return value
def service(method,*args):
 return js('const d=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=d;return await Call.ByID('+str(method)+''.join(','+json.dumps(arg)for arg in args)+')')
def button(text):
 return js('const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(text)+');if(!b)throw Error("missing button");b.click();return true')
def command(name,data):
 result=root/(name+'-result.json');result.unlink(missing_ok=True)
 (root/(name+'-command.json')).write_text(json.dumps(data))
 wait(lambda:result.exists(),name)
 return json.loads(result.read_text())
def screenshot(name):
 p=root/name
 command('panel',{'command':'snapshot','path':str(p)})
 wait(lambda:p.exists(),name)
def independent():
 return json.loads(subprocess.check_output([str(root/'query'),*keys]))
def approve(name):
 script='tell application "System Events"\nif not (exists process "CoreServicesUIAgent") then return "no dialog"\ntell process "CoreServicesUIAgent"\nrepeat with w in windows\nrepeat with e in (entire contents of w)\ntry\nif role of e is "AXButton" and (name of e contains TARGET) then\nset title to name of e\nclick e\nreturn title\nend if\nend try\nend repeat\nend repeat\nend tell\nend tell\nreturn "no matching fixture button"'
 script=script.replace('TARGET',json.dumps(name))
 return subprocess.run(['osascript','-e',script],capture_output=True,text=True,timeout=5).stdout.strip()
try:
 (root/'query.swift').write_text('import AppKit\nimport UniformTypeIdentifiers\nvar paths:[String:String]=[:]\nfor key in Array(CommandLine.arguments.dropFirst())+["com.adobe.pdf","public.plain-text"] {\n paths[key]=UTType(key).flatMap { NSWorkspace.shared.urlForApplication(toOpen:$0)?.path } ?? ""\n}\nfor scheme in ["https","mailto"] {\n paths[scheme]=NSWorkspace.shared.urlForApplication(toOpen:URL(string:scheme+":fixture.invalid")!)?.path ?? ""\n}\nlet data=try JSONSerialization.data(withJSONObject:paths,options:[.sortedKeys]);print(String(data:data,encoding:.utf8)!)\n')
 subprocess.run(['xcrun','swiftc',str(root/'query.swift'),'-o',str(root/'query')],check=True)
 before=independent()
 (root/'fixture.m').write_text('#import <AppKit/AppKit.h>\nint main(){@autoreleasepool{return 0;}}\n'.replace('\\n','\n'))
 subprocess.run(['xcrun','clang','-fobjc-arc','-framework','AppKit',str(root/'fixture.m'),'-o',str(root/'fixture')],check=True)
 apps=[]
 for suffix in ['A','B']:
  name='Application Batch QA '+suffix+' '+token[:6]
  app=root/(name+'.app');(app/'Contents/MacOS').mkdir(parents=True)
  shutil.copy2(root/'fixture',app/'Contents/MacOS/fixture')
  bundle='org.defaultapps.applicationbatch.'+token+'.'+suffix
  info={'CFBundleName':name,'CFBundleDisplayName':name,'CFBundleIdentifier':bundle,'CFBundleExecutable':'fixture','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','LSMinimumSystemVersion':'13.0','CFBundleDocumentTypes':[{'CFBundleTypeName':'Application Batch QA','CFBundleTypeRole':'Viewer','LSHandlerRank':'Alternate','LSItemContentTypes':keys}],'UTExportedTypeDeclarations':[{'UTTypeIdentifier':key,'UTTypeConformsTo':['public.data'],'UTTypeDescription':'Application Batch QA '+str(i+1),'UTTypeTagSpecification':{'public.filename-extension':'abqa'+token+str(i)}}for i,key in enumerate(keys)]}
  (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
  subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
  subprocess.run([lsregister,'-f',str(app)],check=True,capture_output=True);registered.append(app)
  apps.append({'name':name,'path':str(app),'displayPath':str(app),'bundleID':bundle,'version':'1.0'})
 observed=independent();target=next(a for a in apps if all(observed[k]!=a['path'] for k in keys))
 support=root/'Application Support/Default Apps';support.mkdir(parents=True)
 (support/'config.json').write_text(json.dumps({'version':1,'associations':[],'applications':apps}))
 app=root/'Default Apps Application Batch QA.app';(app/'Contents/MacOS').mkdir(parents=True);(app/'Contents/Resources').mkdir()
 shutil.copy2(base/'native-qa',app/'Contents/MacOS/default-apps')
 shutil.copy2(repo/'build/darwin/icons.icns',app/'Contents/Resources/icons.icns')
 info=plistlib.loads((repo/'build/darwin/Info.plist').read_bytes(),fmt=plistlib.FMT_XML);info['CFBundleIdentifier']='io.github.sunven.default-apps.application-batch-qa'
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info));subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True,capture_output=True)
 with socket.socket()as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 address=f'http://127.0.0.1:{port}/mcp'
 env=os.environ.copy();env.update(DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),WAILS_MCP_PORT=str(port),WAILS_MCP_HIDE_CURSOR='1')
 process=subprocess.Popen([str(app/'Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (root/'process.json').write_text(json.dumps({'pid':process.pid,'mcp':address}))
 wait(lambda:js('return !!document.querySelector(".global-header")'),'native UI')
 command('panel',{'command':'activate'})
 command('native',{'action':'minimum'})
 selector='[data-app-path='+json.dumps(target['path'])+']'
 wait(lambda:js('return !!document.querySelector('+json.dumps(selector)+')'),'fixture application')
 js('document.querySelector('+json.dumps(selector)+').click();return true')
 (root/'ui-before.json').write_text(json.dumps(js('return {body:document.body.innerText,checks:[...document.querySelectorAll(\"input[type=checkbox],[role=checkbox]\")].map(e=>({tag:e.tagName,role:e.getAttribute(\"role\"),label:e.getAttribute(\"aria-label\")}))}'),ensure_ascii=False,indent=2))
 for key in keys:
  expression='document.querySelector('+json.dumps('[data-association-id=\"file:'+key+'\"]')+').closest(\"tr\").querySelector(\"input[type=checkbox]\")'
  wait(lambda:js('return !!('+expression+')'),'selectable '+key)
  js(expression+'.click();return true')
 wait(lambda:js('return document.querySelector(".batch-selection-bar")?.textContent.includes("已选 2")'),'selection bar')
 screenshot('application-selected.png')
 button('设为 '+target['name']+'…')
 wait(lambda:js('return !!document.querySelector(".batch-table")'),'fixed preview')
 text=js('return document.querySelector("dialog[open]").innerText')
 assert '更换应用' not in text and target['path'] in text,text
 screenshot('application-preview.png')
 button('返回调整')
 assert service(3439020780)['requests']==[]
 # Switching applications must keep each selection independent.
 other=next(a for a in apps if a!=target)
 js('document.querySelector('+json.dumps('[data-app-path='+json.dumps(other['path'])+']')+').click();return true')
 assert js('return !document.querySelector(".batch-selection-bar")')
 js('document.querySelector('+json.dumps(selector)+').click();return true')
 wait(lambda:js('return document.querySelector(".batch-selection-bar")?.textContent.includes("已选 2")'),'restored selection')
 button('设为 '+target['name']+'…');wait(lambda:js('return !!document.querySelector(".batch-table")'),'second preview')
 button('开始设置 2 项')
 approvals=[];deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  state=service(3439020780)
  if state.get('batch',{}).get('state')=='completed':break
  approved=approve(target['name'])
  if approved not in ['no dialog','no matching fixture button','']:approvals.append(approved)
  time.sleep(.25)
 state=service(3439020780);after=independent()
 completed=state.get('batch',{}).get('state')=='completed' and all(i['status']=='confirmed' for i in state['batch']['items'])
 assert all(before[k]==after[k] for k in ['com.adobe.pdf','public.plain-text','https','mailto'])
 if completed:assert all(after[k]==target['path'] for k in keys)
 screenshot('application-results.png')
 result={'completed':completed,'target':target,'keys':keys,'before':before,'after':after,'approvals':approvals,'state':state,'geometry':js('return {viewport:[innerWidth,innerHeight],overflow:document.documentElement.scrollWidth-innerWidth,dialogOverflow:document.querySelector("dialog[open]").scrollWidth-document.querySelector("dialog[open]").clientWidth}')}
 (root/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 (base/'latest-native-run').write_text(str(root))
 print(json.dumps({'completed':completed,'statuses':[i['status'] for i in state['batch']['items']],'root':str(root),'geometry':result['geometry']},ensure_ascii=False),flush=True)
finally:
 if process is not None and process.poll()is None:
  try:
   service(2163944630)
   if process.poll()is None:
    state=service(3439020780)
    if state['quit']['prompt']:service(3386273962,state['quit']['promptID'],True)
   process.wait(timeout=3)
  except Exception:process.kill();process.wait(timeout=3)
 for app in registered:subprocess.run([lsregister,'-u',str(app)],check=True,capture_output=True)
 log.close()
