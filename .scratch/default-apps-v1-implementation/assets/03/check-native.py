import json,pathlib,re,urllib.request
root=pathlib.Path(__file__).parent

def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9103/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req))['result']
 if result.get('isError'):raise RuntimeError(result)
 text=result['content'][0]['text']
 try:return json.loads(text)
 except json.JSONDecodeError:return text

def js(code):return call('js_eval',js=code)
def wait(condition):
 return js('for(let i=0;i<300;i++){if('+condition+')return true;await new Promise(r=>setTimeout(r,50))};throw Error("UI timeout")')
def dump(name,value):(root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def capture(name):
 html=js('return document.documentElement.outerHTML');html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html);html=html.replace('</head>','<style>'+pathlib.Path('frontend/src/app.css').read_text()+'</style></head>');(root/name).write_text('<!DOCTYPE html>\n'+html)

snapshot=js("const {Call}=await import('/wails/runtime.js');return await Call.ByID(2011754152)")
assert not snapshot['scanning'] and len(snapshot['apps'])>50
assert snapshot['roots']==['/Applications','/Users/sunven/Applications','/System/Applications']
assert len({a['app']['path'] for a in snapshot['apps']})==len(snapshot['apps'])
safari=[a for a in snapshot['apps'] if a['app']['name']=='Safari'];assert len(safari)==1 and safari[0]['app']['path'].startswith('/System/Volumes/Preboot/')
preview=next(a for a in snapshot['apps'] if a['app']['bundleID']=='com.apple.Preview')
assert 'file:com.adobe.pdf' in preview['associationIDs']
assert not any('com.apple.preview.blank'==source['rawInput'] for e in snapshot['entries'] for source in e['sources'] if source.get('appPath')==preview['app']['path'])
assert all('/Contents/' not in a['app']['displayPath'] for a in snapshot['apps'])
js('document.querySelector('+json.dumps('[data-app-path="'+preview['app']['path']+'"]')+').click();return true')
wait('document.querySelectorAll(".declaration-row").length > 0 && !document.querySelector(".declaration-list").innerText.includes("尚未查询")')
js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true')
wait('document.querySelector(".page-heading p")?.textContent.includes("com.adobe.pdf") && document.querySelector(".query-content").getAttribute("aria-busy")==="false"')
body=js('return document.querySelector(".workspace").innerText')
assert '当前默认应用' in body and '系统候选应用' in body and '应用声明' in body and '常用项' in body
assert 'Google Chrome for Testing.app' in body
copyPath=js('return [...document.querySelectorAll(".copy-select")].find(x=>x.getAttribute("aria-label").includes("ms-playwright")).getAttribute("aria-label").replace("查看此副本 ","")')
js('[...document.querySelectorAll(".copy-select")].find(x=>x.getAttribute("aria-label").includes("ms-playwright")).click();return true')
wait('document.querySelector(".inspected-copy")?.innerText.includes("Google Chrome for Testing")')
capture('outside-copy-window.html')
js('document.querySelector(".inspected-copy button").click();return true')
capture('preview-window.html')
minimumBefore=js('return {width:innerWidth,height:innerHeight}')
window=call('windows_list')[0];chrome=window['height']-minimumBefore['height'];call('window_control',action='set_size',width=1000,height=700+chrome)
geometry=js('await new Promise(r=>setTimeout(r,250));return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,panes:[".association-list",".declaration-list",".query-content"].map(s=>({selector:s,client:document.querySelector(s).clientHeight,scroll:document.querySelector(s).scrollHeight}))}')
assert geometry['width']>=1000 and geometry['height']>=700 and geometry['overflow']==0
capture('minimum-window.html')
# Subscribe before refreshing: actual events, immediate acceptance, responsive JS timers.
progress=js("const {Call,Events}=await import('/wails/runtime.js');let updates=[];let ticks=[];let last=performance.now();let timer=setInterval(()=>{let now=performance.now();ticks.push(now-last);last=now},10);let off=Events.On('defaultapps:catalog',e=>updates.push({version:e.data.version,scanning:e.data.scanning,apps:e.data.apps.length}));let start=performance.now();let accepted=await Call.ByID(3776577069);let acceptedMS=performance.now()-start;for(let i=0;i<200;i++){let s=await Call.ByID(2011754152);if(!s.scanning){for(let j=0;j<100 && !updates.some(u=>!u.scanning);j++)await new Promise(r=>setTimeout(r,50));clearInterval(timer);off();return {acceptedMS,acceptedScanning:accepted.scanning,updates,timerTicks:ticks.length,maxTimerGap:Math.max(...ticks),durationMS:s.durationMS,apps:s.apps.length}}await new Promise(r=>setTimeout(r,10))}throw Error('scan timeout')")
dump('native-progress.json',progress)
assert progress['acceptedScanning'] and progress['timerTicks']>0 and len(progress['updates'])>2
assert any(u['scanning'] and u['apps']>0 for u in progress['updates']) and progress['updates'][-1]['scanning'] is False
queries={}
baseline=json.loads((root/'independent-before.json').read_text())
for id,expected in baseline['queries'].items():
 kind,key=id.split(':',1)
 observed=js("const {Call}=await import('/wails/runtime.js');return await Call.ByID(3233615384,"+json.dumps({'kind':kind,'key':key})+")")
 assert observed['default']['known'] and observed['candidates']['known']
 assert (observed['default']['app']['path'] if observed['default']['app'] else None)==expected['current']
 assert sorted(a['path'] for a in observed['candidates']['apps'])==sorted(expected['candidates'])
 queries[id]=observed

dump('native-snapshot.json',snapshot);dump('native-queries.json',queries);dump('native-checks.json',{'scale':{'apps':len(snapshot['apps']),'associations':len(snapshot['entries']),'unresolved':sum(not e['resolved'] for e in snapshot['entries']),'issues':snapshot['issues'],'durationMS':snapshot['durationMS']},'progress':progress,'minimum':geometry,'safari':safari[0]['app'],'previewAssociations':len(preview['associationIDs']),'outsideCopySelected':copyPath,'commonQueryIndependentMatches':len(queries),'noHelpers':True})
print(json.dumps({'apps':len(snapshot['apps']),'associations':len(snapshot['entries']),'progress':progress,'minimum':geometry},ensure_ascii=False))
