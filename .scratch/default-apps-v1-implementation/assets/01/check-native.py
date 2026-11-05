import json
import pathlib
import urllib.request

root = pathlib.Path(__file__).parent

def call(name, **arguments):
    req=urllib.request.Request('http://127.0.0.1:9101/mcp',data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':arguments}}).encode(),headers={'Content-Type':'application/json'})
    result=json.load(urllib.request.urlopen(req))['result']
    if result.get('isError'): raise RuntimeError(result)
    raw=result['content'][0]['text']
    try: return json.loads(raw)
    except json.JSONDecodeError: return raw

initial=call('js_eval',js='return {width:innerWidth,height:innerHeight,text:document.body.innerText,overflow:document.documentElement.scrollWidth-innerWidth}')
windows=call('windows_list')
query=call('js_eval',js="const {Call}=await import('/wails/runtime.js'); return await Call.ByID(794654841,{kind:'file',key:'com.adobe.pdf'})")
independent=json.loads((root/'independent-query.json').read_text())
assert query['default']['app']['path']==independent['current']
assert sorted(x['displayPath'] for x in query['candidates']['apps'])==sorted(independent['candidates'])
assert len(query['candidates']['apps'])==8
assert all(x['path'] and x['name'] and x['version'] for x in query['candidates']['apps'])
frame=windows[0]
# Wails reports outer dimensions; derive the native titlebar inset from the live window.
chrome=frame['height']-initial['height']
call('window_control',action='set_size',width=1000,height=700+chrome)
minimum=call('js_eval',js='await new Promise(resolve=>setTimeout(resolve,350)); return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,contentHeight:document.documentElement.scrollHeight}')
assert minimum['width'] >= 1000 and minimum['height'] >= 700,minimum
assert minimum['overflow']==0 and minimum['contentHeight']==700,minimum
before=call('js_eval',js="return document.querySelector('.freshness').textContent")
call('js_eval',js="document.querySelector('button').click(); return true")
refreshed=call('js_eval',js="await new Promise(resolve=>setTimeout(resolve,300)); return {button:document.querySelector('button').textContent,disabled:document.querySelector('button').disabled,text:document.body.innerText}")
assert not refreshed['disabled'] and '/Applications/Google Chrome.app' in refreshed['text']
# Save the real rendered DOM with the exact production stylesheet for visual inspection.
html=call('js_eval',js="return document.documentElement.outerHTML")
import re
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
html=re.sub(r'<link\b[^>]*>','',html)
css=pathlib.Path('frontend/src/app.css').read_text()
html=html.replace('</head>','<style>'+css+'</style></head>')
(root/'rendered-window.html').write_text('<!DOCTYPE html>\n'+html)
(root/'native-query.json').write_text(json.dumps(query,ensure_ascii=False,indent=2)+'\n')
report={'initial':initial,'outerWindow':frame,'titlebarHeight':chrome,'minimumContent':minimum,'refresh':refreshed,'independentQueryMatches':True,'setterAvailable':False,'automationBuildTags':['production','mcp']}
(root/'native-ui-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'current':query['default']['app']['path'],'candidates':len(query['candidates']['apps']),'minimumContent':minimum,'titlebarHeight':chrome,'independentQueryMatches':True},ensure_ascii=False))
