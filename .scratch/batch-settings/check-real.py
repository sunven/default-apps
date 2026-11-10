"""Real NSWorkspace batch on two fresh, private types; exact fixture cleanup."""
import json, os, pathlib, plistlib, shutil, socket, subprocess, time, urllib.request, uuid

repo=pathlib.Path(__file__).resolve().parents[2]
out=repo/'.scratch/batch-settings/out'
token=uuid.uuid4().hex
root=out/('real-'+token);root.mkdir()
types=['org.defaultapps.batchqa.'+token+'.'+suffix for suffix in ['one','two']]
lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
registered=[];process=None;events=[];address=''
log=(root/'runtime.log').open('w')
def wait(fn,label,timeout=30):
    end=time.monotonic()+timeout;last=''
    while time.monotonic()<end:
        try:
            value=fn()
            if value:return value
        except Exception as error:last=str(error)
        time.sleep(.1)
    raise RuntimeError(label+': '+last)
def js(code):
    req=urllib.request.Request(address,data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'js_eval','arguments':{'js':code}}}).encode(),headers={'Content-Type':'application/json'})
    result=json.load(urllib.request.urlopen(req,timeout=10))['result']
    if result.get('isError'):raise RuntimeError(result)
    return json.loads(result['content'][0]['text'])
def service(method,*args):
    return js('const d=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=d;return await Call.ByID('+str(method)+''.join(','+json.dumps(arg)for arg in args)+')')
def independent():
    return [json.loads(subprocess.check_output([str(out/'independent-query'),key,'batch-qa-'+token]))for key in types]
def daily():
    return json.loads(subprocess.check_output(['xcrun','swift',str(repo/'.scratch/default-apps-v1-implementation/assets/02/independent-query.swift')]))
def record(name):
    result={'name':name,'state':service(3439020780),'independent':independent()}
    events.append(result);(root/'results.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
    print(name,flush=True);return result
def approve_fixture(name):
    # Only a button naming the exact, fresh fixture is eligible. Other dialogs
    # and unrelated applications are never clicked.
    script='''tell application "System Events"
if not (exists process "CoreServicesUIAgent") then return "no dialog"
tell process "CoreServicesUIAgent"
repeat with w in windows
repeat with e in (entire contents of w)
try
if role of e is "AXButton" and (name of e contains TARGET) then
set title to name of e
click e
return title
end if
end try
end repeat
end repeat
end tell
end tell
return "no matching fixture button"'''.replace('TARGET',json.dumps(name))
    result=subprocess.run(['osascript','-e',script],capture_output=True,text=True,timeout=5)
    if result.returncode: return result.stderr.strip()
    return result.stdout.strip()
try:
    before=daily();(root/'daily-before.json').write_text(json.dumps(before,indent=2))
    (root/'fixture.m').write_text('#import <AppKit/AppKit.h>\nint main(){@autoreleasepool{return 0;}}\n')
    subprocess.run(['xcrun','clang','-fobjc-arc','-mmacosx-version-min=13.0','-framework','AppKit',str(root/'fixture.m'),'-o',str(root/'fixture')],check=True)
    targets=[]
    for suffix in ['A','B']:
        name='Batch QA '+suffix+' '+token[:8]
        app=root/(name+'.app');(app/'Contents/MacOS').mkdir(parents=True)
        shutil.copy2(root/'fixture',app/'Contents/MacOS/fixture')
        info={'CFBundleName':name,'CFBundleDisplayName':name,'CFBundleIdentifier':'org.defaultapps.batchqa.'+token+'.'+suffix,'CFBundleExecutable':'fixture','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','LSMinimumSystemVersion':'13.0','CFBundleDocumentTypes':[{'CFBundleTypeName':'Batch QA','CFBundleTypeRole':'Viewer','LSHandlerRank':'Alternate','LSItemContentTypes':types}],'UTExportedTypeDeclarations':[{'UTTypeIdentifier':key,'UTTypeConformsTo':['public.data'],'UTTypeDescription':'Batch QA '+str(i+1),'UTTypeTagSpecification':{'public.filename-extension':'bqa'+token+str(i)}}for i,key in enumerate(types)]}
        (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info));subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
        subprocess.run([lsregister,'-f',str(app)],check=True,capture_output=True);registered.append(app);targets.append({'name':name,'path':str(app)})
    observed=independent();(root/'registered.json').write_text(json.dumps(observed,indent=2))
    assert all(value['type']['declared'] for value in observed)
    target=next(value for value in targets if all((item['type']['current']or{}).get('path')!=value['path']for item in observed))
    support=root/'Application Support/Default Apps';support.mkdir(parents=True)
    (support/'config.json').write_text(json.dumps({'version':1,'associations':[{'input':{'kind':'identifier','value':key,'source':'manual','label':'Batch QA '+str(i+1)},'selectedID':'file:'+key}for i,key in enumerate(types)],'applications':[]}))
    app=root/'Default Apps Batch Real QA.app';(app/'Contents/MacOS').mkdir(parents=True);(app/'Contents/Resources').mkdir()
    shutil.copy2(out/'batch-real-qa',app/'Contents/MacOS/default-apps');shutil.copy2(repo/'build/darwin/icons.icns',app/'Contents/Resources/icons.icns')
    info=plistlib.loads((repo/'build/darwin/Info.plist').read_bytes(),fmt=plistlib.FMT_XML);info['CFBundleIdentifier']='io.github.sunven.default-apps.batch-real-qa';(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True,capture_output=True)
    with socket.socket()as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    address=f'http://127.0.0.1:{port}/mcp'
    env=os.environ.copy();env.update(DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(root),WAILS_MCP_PORT=str(port),WAILS_MCP_HIDE_CURSOR='1')
    process=subprocess.Popen([str(app/'Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    (root/'process.json').write_text(json.dumps({'pid':process.pid,'mcp':address}))
    wait(lambda:js('return !!document.querySelector(".global-header")'),'real application')
    (root/'panel-command.json').write_text(json.dumps({'command':'activate'}))
    wait(lambda:(root/'panel-result.json').exists(),'activate real window')
    preview=service(1945431049,[{'association':{'kind':'file','key':key},'name':'Batch QA '+str(i+1),'extensions':[]}for i,key in enumerate(types)],target['path'],'')
    assert all(item['status']=='queued'for item in preview['items']),preview
    result=service(1242550568,preview['id'],'','');assert result['outcome']=='accepted',result
    approvals=[];deadline=time.monotonic()+70
    while time.monotonic()<deadline:
        current=service(3439020780)
        if current['batch']['state']=='completed':break
        approval=approve_fixture(target['name'])
        if approval not in ['no dialog','no matching fixture button']:approvals.append(approval)
        time.sleep(.25)
    else:
        record('real system completion not observed within acceptance window')
        raise RuntimeError('real batch did not finish; '+str(approvals))
    (root/'fixture-approvals.json').write_text(json.dumps(approvals,ensure_ascii=False,indent=2))
    result=record('real NSWorkspace batch completed')
    assert [item['status']for item in result['state']['batch']['items']]==['confirmed','confirmed'],result
    assert all(value['type']['current']['path']==target['path']for value in result['independent'])
    assert 'pending'not in json.loads((support/'config.json').read_text())
    # Readonly evidence of native contents, including the exact batch target.
    js('[...document.querySelectorAll("button")].find(b=>b.textContent==="查看批次").click();return true')
    screenshot=root/'real-completed.png';(root/'panel-command.json').write_text(json.dumps({'command':'snapshot','path':str(screenshot)}));wait(lambda:screenshot.exists(),'real result screenshot')
    after=daily();(root/'daily-after.json').write_text(json.dumps(after,indent=2));assert before==after,'daily associations changed'
    (out/'latest-real-run').write_text(str(root));print('PASS '+str(root),flush=True)
finally:
    if process is not None and process.poll()is None:
        try:
            service(2163944630)
            if process.poll()is None:
                current=service(3439020780)
                if current['quit']['prompt']:service(3386273962,current['quit']['promptID'],True)
            process.wait(timeout=3)
        except Exception:process.kill();process.wait(timeout=3)
    for app in registered:subprocess.run([lsregister,'-u',str(app)],check=True,capture_output=True)
    log.close()
