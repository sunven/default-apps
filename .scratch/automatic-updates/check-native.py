import datetime,hashlib,http.server,json,os,pathlib,plistlib,socket,subprocess,threading,time,urllib.request
repo=pathlib.Path.cwd();root=repo/'.scratch/automatic-updates';runtime=root/'runtime';control=root/'control';control.mkdir(exist_ok=True)
archive=(runtime/'default-apps-darwin-arm64.zip').read_bytes();digest=hashlib.sha256(archive).hexdigest();events=[];requests=[];corrupt=[False]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  requests.append({'path':self.path,'at':time.time()})
  if self.path.endswith('/releases/latest'):
   body=json.dumps({'tag_name':'v0.1.1','name':'Default Apps smoke 0.1.1','body':'本机升级验证：完整性校验、确认安装、原位置重新打开。','published_at':'2026-11-10T00:00:00Z','assets':[{'name':'default-apps-darwin-arm64.zip','url':api+'/asset','size':len(archive)},{'name':'SHA256SUMS','url':api+'/checksums'}]}).encode()
  elif self.path=='/checksums':body=f'{digest}  default-apps-darwin-arm64.zip\n'.encode()
  elif self.path=='/asset':body=(bytes([archive[0]^255])+archive[1:]) if corrupt[0] else archive
  else:self.send_error(404);return
  self.send_response(200);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);api=f'http://127.0.0.1:{server.server_port}';threading.Thread(target=server.serve_forever,daemon=True).start()
with socket.socket() as sock:sock.bind(('127.0.0.1',0));mcpport=sock.getsockname()[1]
address=f'http://127.0.0.1:{mcpport}/mcp'
def call(name,**arguments):
 data={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}
 req=urllib.request.Request(address,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
 answer=json.load(urllib.request.urlopen(req,timeout=10))['result']
 if answer.get('isError'):raise RuntimeError(answer)
 text=answer['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def snapshot():return js('const d=window._wails.dispatchWailsEvent;const {Call}=await import("/wails/runtime.js");window._wails.dispatchWailsEvent=d;return await Call.ByID(3702247652)')
def wait(test,description,timeout=30):
 end=time.monotonic()+timeout;last=None
 while time.monotonic()<end:
  try:
   value=test()
   if value:return value
  except Exception as error:last=str(error)
  time.sleep(.1)
 raise RuntimeError('Timeout '+description+': '+str(last))
def click(text):return js('const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+json.dumps(text)+');if(!b||b.disabled)throw Error("button unavailable");b.click();return true')
def record(name):
 value={'check':name,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':snapshot(),'requests':requests.copy(),'body':js('return document.body.innerText'),'viewport':js('return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth}'),'focus':js('return document.activeElement?.getAttribute("aria-label")??document.activeElement?.textContent')};events.append(value);(root/'native-results.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n');print(name,value['state']['phase'],flush=True);return value

def panel(command,path=''):
 result=control/'panel-result.json';result.unlink(missing_ok=True)
 (control/'panel-command.json').write_text(json.dumps({'command':command,'path':str(path)}))
 return wait(lambda:json.loads(result.read_text())if result.exists()else None,'panel '+command)
def screenshot(name):
 path=root/name;path.unlink(missing_ok=True);panel('snapshot',path);wait(lambda:path.exists(),'snapshot')
app=runtime/'current/default-apps.app'
env=os.environ.copy();env.update(DEFAULT_APPS_UPDATE_SMOKE_API=api,DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(control),DEFAULT_APPS_CHANGE_SMOKE_ROOT=str(control),WAILS_MCP_PORT=str(mcpport),WAILS_MCP_HIDE_CURSOR='1')
log=(root/'native-runtime.log').open('w');process=subprocess.Popen([str(app/'Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'process.json').write_text(json.dumps({'pid':process.pid,'mcp':address,'app':str(app)}))
try:
 wait(lambda:js('return !!document.querySelector(".software-update-entry")'),'native window')
 wait(lambda:snapshot()['phase']=='available','automatic check')
 assert not any(r['path']=='/asset'for r in requests),'automatic check downloaded'
 click('软件更新');wait(lambda:js('return !!document.querySelector("dialog[open]")'),'update dialog')
 panel('activate');wait(lambda:js('return document.querySelector("dialog[open]")?.innerText.includes("有新版本可用")'),'available UI');record('startup checks without downloading');screenshot('native-available.png')
 nativeResult=control/'native-result.json';nativeResult.unlink(missing_ok=True)
 (control/'native-command.json').write_text(json.dumps({'action':'minimum'}))
 wait(lambda:nativeResult.exists(),'native resize')
 time.sleep(.5)
 assert js('return document.documentElement.scrollWidth<=innerWidth'),'horizontal overflow'
 record('native resize attempt without horizontal overflow');screenshot('native-resize.png')
 corrupt[0]=True;click('下载更新')
 wait(lambda:snapshot()['error']!='','corrupted download rejected')
 v=record('corrupt download rejected before installation');assert v['state']['phase']=='available';assert '0.1.0' in v['body'];screenshot('native-checksum-error.png')
 corrupt[0]=False;click('重试下载');wait(lambda:snapshot()['phase']=='ready','valid archive staged')
 record('verified update waits for user');screenshot('native-ready.png')
 # Escape only closes the dialog. Neither the running app nor the staged version changes.
 js('document.querySelector("dialog[open]").dispatchEvent(new Event("cancel",{cancelable:true}));return true')
 wait(lambda:js('return !document.querySelector("dialog[open]")'),'close update dialog')
 assert process.poll()is None;assert snapshot()['currentVersion']=='0.1.0'
 click('软件更新');click('重启安装')
 record('restart requires final confirmation');screenshot('native-confirm.png')
 assert process.poll()is None;assert snapshot()['phase']=='ready'
 click('确认重启安装')
 wait(lambda:process.poll()is not None,'old process exit')
 wait(lambda:snapshot()['currentVersion']=='0.1.1','upgraded native window',timeout=45)
 wait(lambda:snapshot()['phase']=='current','new version check')
 click('软件更新');record('new version reopened at original path');screenshot('native-upgraded.png')
 info=plistlib.loads(subprocess.check_output(['/usr/bin/plutil','-convert','xml1','-o','-',str(app/'Contents/Info.plist')]))
 assert info['CFBundleShortVersionString']=='0.1.1'
 subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],check=True)
 assert not (control/'Application Support/Default Apps/config.json').exists(),'update changed association settings'
 record('original path bundle version and signature verified; config untouched')
 call('window_control',action='close')
 print('PASS: native 0.1.0 -> 0.1.1 upgrade',flush=True)
except Exception:
 (root/'failed-requests.json').write_text(json.dumps(requests,indent=2));raise
finally:
 if process.poll()is None:process.terminate()
 server.shutdown();log.close()
