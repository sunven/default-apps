"""Formal Wails shell checks. Run after launching manual_smoke,mcp on loopback 9105.
Only operates this process's native open panels. No association setter is present.
"""
import argparse,json,pathlib,re,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
FIXTURE=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/manual05-native')
CONFIG=FIXTURE/'Application Support/Default Apps/config.json'

def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9105/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req,timeout=45))['result']
 if result.get('isError'):raise RuntimeError(result)
 text=result['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def wait(condition):return js('for(let i=0;i<300;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50))};throw Error("UI observation timeout")')
def dump(name,value):(ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def click(label):return js('let button=[...document.querySelectorAll("button")].find(x=>x.textContent==='+json.dumps(label)+');if(!button)throw Error("missing button");button.click();return true')
def input_value(value):return js('const el=document.querySelector(".manual-value input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,'+json.dumps(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));return true')
def service_id(package,method):
 source=pathlib.Path('frontend/bindings/github.com/sunven/default-apps/internal')/package/'service.ts'
 return int(re.search(r'export function '+method+r'\([^}]+?ByID\((\d+)',source.read_text(),re.S).group(1))
def service(package,method,*args):
 # Importing a second runtime installs its own event dispatcher. Keep the
 # dispatch function owned by the bundled React runtime and restore it before
 # making a bridge call, so native catalog events still reach the real UI.
 return js("const dispatch=window._wails.dispatchWailsEvent;const {Call}=await import('/wails/runtime.js');window._wails.dispatchWailsEvent=dispatch;return await Call.ByID("+str(service_id(package,method))+''.join(','+json.dumps(a) for a in args)+')')
def config():return json.loads(CONFIG.read_text()) if CONFIG.exists() else None

def panel(command,path=''):
 result=FIXTURE/'panel-result.json';result.unlink(missing_ok=True)
 (FIXTURE/'panel-command.json').write_text(json.dumps({'command':command,'path':str(path)}))
 for _ in range(100):
  if result.exists():return json.loads(result.read_text())
  time.sleep(.05)
 raise AssertionError('native panel command did not complete')
def await_panel():
 for _ in range(50):
  state=panel('inspect')
  if state.get('found'):return state
  time.sleep(.1)
 raise AssertionError('NSOpenPanel did not appear')
def select_file(path):
 state=await_panel();assert state['files'] and not state['directories'] and not state['packagesAsDirectories']
 panel('path',path);time.sleep(.3);panel('open');return state

def capture(name):
 path=ROOT/name;path.unlink(missing_ok=True);result=panel('snapshot',path);assert result.get('snapshotScheduled')
 for _ in range(100):
  if path.exists():return
  time.sleep(.05)
 raise AssertionError('native WKWebView snapshot missing')

def first_run():
 wait('document.querySelector(".header-actions") && !document.body.innerText.includes("正在扫描…")')
 assert config() is None
 click('手动补充…');wait('document.querySelector(".manual-value input")')
 input_value('jpg');click('解析输入');wait('document.querySelectorAll(".manual-match").length>=2')
 matches=js('return [...document.querySelectorAll(".manual-match")].map(x=>x.innerText)');assert 'public.jpeg' in ' '.join(matches)
 assert js('return [...document.querySelectorAll("button")].find(x=>x.textContent==="保存手动关联").disabled')
 assert config() is None
 capture('ambiguity-native.png')
 js('document.querySelector(\'input[value="file:public.jpeg"]\').click();return true');click('保存手动关联');wait('document.body.innerText.includes("已保存手动关联")')
 assert len(config()['associations'])==1 and config()['associations'][0]['selectedID']=='file:public.jpeg'
 input_value('unknown-defaultapps-05');click('解析输入');wait('document.querySelector(".manual-unresolved")')
 before=CONFIG.read_bytes();click('选择文件识别类型…');cancel=await_panel();panel('cancel');wait('!document.body.innerText.includes("正在处理…")');assert CONFIG.read_bytes()==before
 click('选择文件识别类型…');filepanel=select_file(FIXTURE/'selected.txt');wait('document.querySelector(".manual-file")?.innerText.includes("selected.txt")');assert CONFIG.read_bytes()==before
 click('保存手动关联');wait('document.body.innerText.includes("已保存手动关联")');assert len(config()['associations'])==2
 click('选择文件识别类型…');unknownpanel=select_file(FIXTURE/'selected.defaultappsunknown05');wait('document.querySelector(".manual-unresolved")');assert js('return [...document.querySelectorAll("button")].find(x=>x.textContent==="保存手动关联").disabled')
 capture('unknown-file-native.png')
 js('let el=document.querySelector(".manual-input-row select");el.value="scheme";el.dispatchEvent(new Event("change",{bubbles:true}));return true');input_value(' Manual+05: ');click('解析输入');wait('document.querySelector(".manual-match")?.innerText.includes("manual+05")');click('保存手动关联');wait('document.body.innerText.includes("已保存手动关联")')
 before=CONFIG.read_bytes();click('添加应用位置…');appcancel=await_panel();panel('cancel');wait('!document.body.innerText.includes("正在选择…")');assert CONFIG.read_bytes()==before
 selections=[]
 for path,count in [(FIXTURE/'outside-one/Manual Reader.app',1),(FIXTURE/'Manual Alias.app',1),(FIXTURE/'outside-two/Manual Reader.app',2)]:
  click('添加应用位置…');selections.append(select_file(path));wait('!document.body.innerText.includes("正在选择…")');assert len(config()['applications'])==count
 capture('applications-native.png')
 js("document.querySelector('[aria-label=\"关闭手动补充\"]').click();return true");wait('!document.querySelector("dialog[open]")')
 wait('!document.body.innerText.includes("正在扫描…")')
 snapshot=service('discovery','GetSnapshot');saved=config();manual=[a for a in snapshot['apps'] if a.get('manual')];assert len(manual)==2
 assert len({a['app']['path'] for a in manual})==2 and len({a['app']['bundleID'] for a in manual})==1
 assert all(not a.get('unavailable') for a in manual)
 # Every saved association is now queryable; these are fresh independent native queries.
 queries={}
 for item in saved['associations']:
  kind,key=item['selectedID'].split(':',1);queries[item['selectedID']]=service('change','Query',{'kind':kind,'key':key});assert queries[item['selectedID']]['default']['known']
 dump('first-run.json',{'fileCancel':cancel,'fileSuccess':filepanel,'unknownFile':unknownpanel,'applicationCancel':appcancel,'applicationSelections':selections,'ambiguity':matches,'saved':saved,'manualApps':manual,'queries':queries})
 print('first run passed')

def restart():
 wait('document.querySelector(".header-actions") && !document.body.innerText.includes("正在扫描…")')
 snapshot=service('discovery','GetSnapshot');saved=config();manual=[a for a in snapshot['apps'] if a.get('manual')]
 assert len(manual)==2
 restored={e['id']:e for e in snapshot['entries'] if any(s['kind']=='manual' for s in e['sources'])}
 assert set(restored)=={i['selectedID'] for i in saved['associations']}
 # Open the saved scheme through the real browser view, triggering fresh current-default query.
 click('URL 协议');wait('document.querySelector(\'[data-association-id="scheme:manual+05"]\')')
 js('document.querySelector(\'[data-association-id="scheme:manual+05"]\').click();return true')
 # Public snapshot establishes newly loaded identities; query evidence is fresh in this new process.
 queries={}
 for item in saved['associations']:
  kind,key=item['selectedID'].split(':',1);queries[item['selectedID']]=service('change','Query',{'kind':kind,'key':key});assert queries[item['selectedID']]['default']['known']
 dump('restart.json',{'saved':saved,'restoredEntries':restored,'manualApps':manual,'queries':queries})
 capture('restart-native.png');print('restart passed')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('phase',choices=['first','restart']);args=parser.parse_args()
 first_run() if args.phase=='first' else restart()
