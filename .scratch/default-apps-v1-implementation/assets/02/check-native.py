import json, pathlib, re, urllib.request
root=pathlib.Path(__file__).parent

def call(name,**arguments):
 req=urllib.request.Request('http://127.0.0.1:9102/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
 result=json.load(urllib.request.urlopen(req))['result']
 if result.get('isError'): raise RuntimeError(result)
 value=result['content'][0]['text']
 try:return json.loads(value)
 except json.JSONDecodeError:return value

def js(code):return call('js_eval',js=code)
def wait_js(predicate):
 return js('for(let i=0;i<100;i++){ if('+predicate+') return true; await new Promise(r=>setTimeout(r,50)) }; throw new Error("UI did not become ready")')
def dump(name,value): (root/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def capture(name):
 html=js('return document.documentElement.outerHTML')
 html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
 html=re.sub(r'<link\b[^>]*>','',html)
 html=html.replace('</head>','<style>'+pathlib.Path('frontend/src/app.css').read_text()+'</style></head>')
 (root/name).write_text('<!DOCTYPE html>\n'+html)

wait_js('document.querySelector(".association-row") && document.querySelector(".freshness")')
catalog=js("const {Call}=await import('/wails/runtime.js'); return await Call.ByID(270282811)")
independent=json.loads((root/'independent-before.json').read_text())
resolved={entry['id'] for entry in catalog if entry['resolved']}
assert resolved==set(independent['queries']), (resolved,set(independent['queries']))
queries={}
for entry in catalog:
 if not entry['resolved']:continue
 value=js("const {Call}=await import('/wails/runtime.js'); return await Call.ByID(794654841,"+json.dumps(entry['association'])+")")
 expected=independent['queries'][entry['id']]
 assert value['default']['known'] and value['candidates']['known']
 assert not value['default']['error'] and not value['candidates']['error']
 actual=value['default']['app']['path'] if value['default']['app'] else None
 assert actual==expected['current'], (entry['id'],actual,expected['current'])
 assert sorted(app['path'] for app in value['candidates']['apps'])==sorted(expected['candidates']), entry['id']
 queries[entry['id']]=value

# Every resolved association is also selected through the real rendered React UI.
interactions=[]
for kind in ['file','scheme']:
 js("[...document.querySelectorAll('.view-navigation button')].find(e=>e.textContent==="+json.dumps('文件类型' if kind=='file' else 'URL 协议')+").click(); return true")
 wait_js('document.querySelector(".association-row")?.dataset.associationId.startsWith('+json.dumps(kind+':')+')')
 for entry in [e for e in catalog if e['association']['kind']==kind and e['resolved']]:
  js('document.querySelector('+json.dumps('[data-association-id="'+entry['id']+'"]')+').click(); return true')
  wait_js('document.querySelector(".page-heading p").textContent.includes('+json.dumps(entry['association']['key'])+') && document.querySelector(".query-content").getAttribute("aria-busy")==="false"')
  text=js('return document.querySelector(".workspace").innerText')
  current=queries[entry['id']]['default']['app']
  assert (current['path'] in text) if current else ('系统未返回默认应用' in text), entry['id']
  assert '关联来源' in text and '常用项' in text
  for app in queries[entry['id']]['candidates']['apps']:assert app['path'] in text, (entry['id'],app['path'])
  interactions.append({'association':entry['id'],'currentPath':current['path'] if current else None,'candidateCount':len(queries[entry['id']]['candidates']['apps']),'selectedThroughReact':True})
  if entry['id']=='file:public.jpeg':capture('jpeg-window.html')
  if entry['id']=='scheme:mailto':capture('mailto-window.html')

initial=js('return {width:innerWidth,height:innerHeight}')
window=call('windows_list')[0]
chrome=window['height']-initial['height']
call('window_control',action='set_size',width=1000,height=700+chrome)
minimum=js('await new Promise(r=>setTimeout(r,350)); return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,catalog:{client:document.querySelector(".association-list").clientHeight,scroll:document.querySelector(".association-list").scrollHeight},details:{client:document.querySelector(".query-content").clientHeight,scroll:document.querySelector(".query-content").scrollHeight}}')
assert minimum['width']>=1000 and minimum['height']>=700 and minimum['overflow']==0,minimum
js('document.querySelector(".page-heading button").click(); return true')
wait_js('document.querySelector(".query-content").getAttribute("aria-busy")==="false"')
assert js('return document.querySelector(".page-heading button").disabled') is False
capture('minimum-window.html')
# A new unknown input is classified as unresolved by the real public service.
unresolved=js("const {Call}=await import('/wails/runtime.js'); return await Call.ByID(3392748637,[{kind:'extension',value:'defaultapps-unknown-20261105',label:'Read-only diagnostic',source:'manual'}])")
assert len(unresolved)==1 and not unresolved[0]['resolved'] and unresolved[0]['diagnosticIdentifiers'][0].startswith('dyn.')
dump('native-catalog.json',catalog);dump('native-queries.json',queries);dump('native-unresolved.json',unresolved)
dump('native-ui-checks.json',{'allIndependentQueriesMatch':True,'interactions':interactions,'minimum':minimum,'titlebarHeight':chrome,'refreshEnabledAfterQuery':True,'readOnly':True,'automationBuildTags':['production','mcp']})
print(json.dumps({'resolved':len(resolved),'fileTypes':len([x for x in catalog if x['association']['kind']=='file']),'schemes':len([x for x in catalog if x['association']['kind']=='scheme']),'interactions':len(interactions),'independentMatches':True,'minimum':minimum}))
