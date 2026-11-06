import runpy,pathlib,json,time
from pathlib import Path
globals().update(runpy.run_path(str(Path(__file__).with_name('native-client.py'))))
pid=launch('native');checks=[]
catalog=service(2011754152);dump('final-native-catalog.json',catalog)
assert len(catalog['apps'])>50 and not catalog['scanning'];assert snapshot()['writableKinds']==['file','scheme']
checks.append({'check':'native read-only scan','pid':pid,'apps':len(catalog['apps']),'entries':len(catalog['entries']),'unresolved':len([e for e in catalog['entries'] if not e['resolved']]),'issues':catalog['issues'],'geometry':geometry(),'DOM':dom(),'writableKinds':snapshot()['writableKinds']})
# Current native common query through production service, with no Submit calls.
queries=[]
for entry in catalog['entries']:
 if entry['resolved'] and any(s['kind']=='common' for s in entry['sources']):
  queries.append(service(3233615384,entry['association']))
dump('final-native-common-queries.json',queries)
js('const b=document.querySelector(\'[data-app-path="/Applications/Xcode.app"]\');b.click();return true')
pixels('final-native-app.png')
issues=[b for b in js('return [...document.querySelectorAll("button")].map(e=>e.innerText)') if b.startswith('扫描问题')]
if issues:
 click(issues[0]);pixels('final-native-scan-issues.png');checks.append({'check':'local scan issues visible','text':js('return document.querySelector("dialog[open]").innerText')});key('\x1b',53)
js('document.querySelector("[data-view=file]").click();return true');fill('input[aria-label="搜索文件类型"]','pdf');js('document.querySelector(\'[data-association-id="file:com.adobe.pdf"]\').click();return true')
wait('document.querySelector(".candidate-list")');pixels('final-native-pdf.png');checks.append({'check':'actual default and candidate detail','text':js('return document.querySelector("dialog[open]").innerText')});key('\x1b',53)
# Ambiguous known extension and native cancel use unchanged picker logic.
click('手动补充…');fill('.manual-value input','ts');click('解析输入');wait('document.querySelector(".manual-matches").children.length>0');checks.append({'check':'manual resolved or ambiguous input displayed','text':js('return document.querySelector("dialog[open]").innerText')});pixels('final-native-manual.png');key('\x1b',53)
dump('final-native-readonly.json',{'status':'通过','layer':'production service + real native query/discovery/window; observation tags only','checks':checks,'queryCount':len(queries),'requestCount':len(snapshot()['requests']),'setters':0})
# No pending means the native quit may exit before the observation file writes.
try:native('menu')
except RuntimeError:pass
print('native read-only passed',len(queries),'common identities; pid',pid)
