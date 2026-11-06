from native_client import *
# Same-process AppKit NSEvents exercise NSApplication -> WKWebView. No setter exists.
CMD=1<<20;SHIFT=1<<17
records=[]
def step(name,char,code=0,flags=0,expected=None):
 key(char,code,flags);state=focus();records.append({'step':name,'focus':state})
 if expected:
  for k,v in expected.items():assert state.get(k)==v,(name,state,k,v)
 return state

def fill(selector,value):
 return js('const e=document.querySelector('+json.dumps(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));return true')
wait('document.querySelectorAll("[data-app-path]").length > 50')
geometry=native();dump('native-environment.json',geometry)
snapshot=js("const {Call}=await import('/wails/runtime.js');return await Call.ByID(2011754152)")
dump('native-snapshot.json',snapshot)
for c,view,code in [('2','file',19),('3','scheme',20),('1','app',18)]:step('Command-'+c,c,code,CMD,{'view':view,'tag':'BUTTON'})
step('Command-F','f',3,CMD,{'label':'搜索应用名称、版本、路径或声明'})
fill('input[aria-label="搜索应用名称、版本、路径或声明"]','Xcode')
wait('document.querySelectorAll("[data-app-path]").length===1')
step('search Down','\uf701',125,0,{'path':'/Applications/Xcode.app'})
step('application Enter','\r',36,0,{'tag':'BUTTON'})
assert focus()['association']
firstID=focus()['association']
step('association Tab','\t',48,0,{'text':'详情…'})
step('association Shift-Tab','\t',48,SHIFT,{'association':firstID})
step('association End','\uf72b',119);lastID=focus()['association'];assert lastID and lastID!=firstID
step('association Up','\uf700',126);assert focus()['association']!=lastID
step('association Home','\uf729',115,0,{'association':firstID})
step('association Enter opens detail','\r',36,0,{'dialogs':1})
step('dialog Shift-Tab traps focus','\t',48,SHIFT);assert focus()['dialogs']==1
step('dialog Escape restores name','\x1b',53,0,{'dialogs':0,'association':firstID})
step('Command-F again','f',3,CMD,{'label':'搜索应用名称、版本、路径或声明'})
step('search Escape clears only search','\x1b',53,0,{'label':'搜索应用名称、版本、路径或声明'})
wait('document.querySelectorAll("[data-app-path]").length > 50')
# Full catalog, Xcode keeps two independently scrolling long lists.
js('document.querySelector(\'[data-app-path="/Applications/Xcode.app"]\').click();return true')
call('window_control',action='set_size',width=1000,height=732);time.sleep(.4)
minimum=native();dom=js('return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,panes:[".application-list",".association-list"].map(s=>{const e=document.querySelector(s);return {selector:s,client:e.clientHeight,scroll:e.scrollHeight}})}')
assert minimum['content']==[1000,700] and dom['width']>=1000 and dom['height']>=700 and dom['overflow']==0
assert all(p['scroll']>p['client'] for p in dom['panes'])
scroll=js('const a=document.querySelector(".application-list"),r=document.querySelector(".association-list");const h=document.querySelector(".app-heading").getBoundingClientRect().top,s=document.querySelector(".association-toolbar").getBoundingClientRect().top;a.scrollTop=300;r.scrollTop=600;return {app:a.scrollTop,associations:r.scrollTop,headingFixed:document.querySelector(".app-heading").getBoundingClientRect().top===h,searchFixed:document.querySelector(".association-toolbar").getBoundingClientRect().top===s,windowScroll:scrollY}')
assert scroll=={'app':300,'associations':600,'headingFixed':True,'searchFixed':True,'windowScroll':0}
native('snapshot',str(root.resolve()/'native-minimum.png'));time.sleep(.4)
# Get both list endpoints via native key and keep the primary filter visible.
step('Command-F before empty test','f',3,CMD)
fill('input[aria-label="搜索应用名称、版本、路径或声明"]','nothing-matches-ticket04')
wait('document.querySelector(".empty-workspace")?.textContent.includes("没有匹配的应用")')
assert js('return document.querySelectorAll("[data-association-id]").length')==0
native('snapshot',str(root.resolve()/'native-empty.png'));time.sleep(.4)
step('empty search Escape','\x1b',53)
# No-declaration entry -> Enter focuses association filter.
empty=next(a for a in snapshot['apps'] if not a['associationIDs'])
js('const b=[...document.querySelectorAll("[data-app-path]")].find(b=>b.dataset.appPath==='+json.dumps(empty['app']['path'])+');b.click();b.focus();return true')
step('no declarations Enter','\r',36,0,{'label':'筛选当前关联'})
# Menu routing only checks relevant non-destructive keys; q would actually quit.
menu=[native('menu',c,code,CMD)['menuMatched'] for c,code in [('f',3),('1',18),('2',19),('3',20)]]
assert menu==[False]*4
# Query/default independent baseline remains read-only.
dump('native-keyboard.json',{'method':'AppKit synthesized native keyDown/keyUp via NSApplication.sendEvent; no global/hardware events','steps':records,'nativeSettings':{'tabFocusesLinks':geometry['tabFocusesLinks'],'AppleKeyboardUIMode':geometry['keyboardUIMode']},'menuCommandF123Matched':menu})
dump('native-layout.json',{'nativeMinimum':minimum,'DOM':dom,'independentScrolling':scroll,'realScale':{'apps':len(snapshot['apps']),'associations':len(snapshot['entries']),'Xcode':len(next(a for a in snapshot['apps'] if a['app']['path']=='/Applications/Xcode.app')['associationIDs'])},'noDeclarationCopy':empty['app']})
print(json.dumps({'steps':len(records),'minimum':minimum['content'],'dom':dom,'scroll':scroll},ensure_ascii=False))
