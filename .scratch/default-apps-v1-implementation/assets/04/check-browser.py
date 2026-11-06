import json,pathlib,subprocess
root=pathlib.Path(__file__).parent.resolve()
base=['agent-browser','--session','default-apps-ticket04','--json']
def run(*args):
 result=json.loads(subprocess.check_output(base+list(args)))
 assert result['success'],result
 return result['data']
def evaluate(code):return run('eval',code)['result']
def save(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def screenshot(name):return run('screenshot',str(root/name))
def focus():return evaluate('({tag:document.activeElement.tagName,label:document.activeElement.getAttribute("aria-label"),id:document.activeElement.dataset.associationId})')
run('open','http://127.0.0.1:9244');run('set','viewport','1000','700')
geometry=evaluate('({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,rows:document.querySelectorAll("[data-association-id]").length,appStops:[...document.querySelectorAll("[data-app-path]")].filter(e=>e.tabIndex===0).length,rowStops:[...document.querySelectorAll(".association-list button")].filter(e=>e.tabIndex===0).length})')
assert geometry=={'width':1000,'height':700,'overflow':0,'rows':1000,'appStops':1,'rowStops':2}
screenshot('scale-1000.png')
run('focus','input[aria-label="筛选当前关联"]');run('press','ArrowDown');run('press','End')
end=evaluate('({id:document.activeElement.dataset.associationId,scroll:document.querySelector(".association-list").scrollTop,bottom:document.activeElement.getBoundingClientRect().bottom,height:innerHeight})')
assert end['id']=='file:test.scale.999' and end['scroll']>0 and end['bottom']<700
screenshot('scale-end.png');run('press','Enter')
assert evaluate('document.querySelectorAll("dialog[open]").length')==1
longPath=evaluate('document.querySelector("dialog .copy-path").textContent')
assert len(longPath)>250 and longPath.endswith('Scale Reader.app')
assert evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth')
screenshot('scale-detail.png');run('press','Escape');assert focus()['id']=='file:test.scale.999'
# Same-extension ambiguity and search scope through actual rendered inputs.
run('fill','input[aria-label="搜索应用名称、版本、路径或声明"]','.jpg')
assert evaluate('[...document.querySelectorAll("[data-association-id]")].map(e=>e.dataset.associationId)')==['file:test.scale.0','file:test.scale.1']
assert evaluate('document.querySelector(".association-toolbar").textContent.includes("仅显示匹配声明")')
run('fill','input[aria-label="筛选当前关联"]','test.scale.1')
assert evaluate('document.querySelectorAll("[data-association-id]").length')==1
run('fill','input[aria-label="搜索应用名称、版本、路径或声明"]','no-match')
assert evaluate('document.querySelectorAll("[data-association-id]").length')==0
screenshot('scale-empty.png')
run('focus','input[aria-label="搜索应用名称、版本、路径或声明"]');run('press','Escape')
run('focus','input[aria-label="筛选当前关联"]');run('press','Escape')
run('click','[data-app-path="/Volumes/Tools/Archive Tool 0.app"]')
assert evaluate('document.querySelector(".empty-workspace").textContent.includes("此应用未声明")')
run('focus','[data-app-path="/Volumes/Tools/Archive Tool 0.app"]');run('press','Enter');assert focus()['label']=='筛选当前关联'
run('click','[data-app-path="/Applications/Scale Reader.app"]')
scroll=evaluate('(()=>{const a=document.querySelector(".application-list"),r=document.querySelector(".association-list"),h=document.querySelector(".app-heading").getBoundingClientRect().top,s=document.querySelector(".association-toolbar").getBoundingClientRect().top;a.scrollTop=240;r.scrollTop=600;return {app:a.scrollTop,rows:r.scrollTop,headerFixed:h===document.querySelector(".app-heading").getBoundingClientRect().top,filterFixed:s===document.querySelector(".association-toolbar").getBoundingClientRect().top}})()')
assert scroll=={'app':240,'rows':600,'headerFixed':True,'filterFixed':True}
# Explicit desktop widths; phone is outside the approved scope.
for width,height in [(1280,800),(1440,900)]:
 run('set','viewport',str(width),str(height));assert evaluate('document.documentElement.scrollWidth-innerWidth')==0
 screenshot('scale-'+str(width)+'.png')
save('browser-checks.json',{'fixture':'Wails service module replacement in test-only Vite config; actual App and styles','geometry':geometry,'endNavigation':end,'longPathCharacters':len(longPath),'scroll':scroll,'search':'metadata/declaration scope, independent filter, same extension different identities, empty, no declarations passed','desktopWidths':[1000,1280,1440]})
print(json.dumps({'geometry':geometry,'end':end,'longPathCharacters':len(longPath),'scroll':scroll}))
