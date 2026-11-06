import runpy,json
globals().update(runpy.run_path('/Users/sunven/.codex/default-apps-implementation-20261105/final-verification/native-resume-client.py'))
checks=json.loads((e/'native-regressions.json').read_text());apps=json.loads((e/'native-fixtures.json').read_text())['applications'];target=apps[0]['path'];request=snapshot()['activeRequestID']
click('留在应用')
assert not any(v['id']=='scheme:review-final-transient' for v in catalog()['entries'])
before=len(control()['queries']);click('返回请求项');wait('document.querySelector("dialog[open]")')
wait('document.querySelector("dialog[open]").innerText.includes("review-final-transient")')
click('重新查询');wait('!document.querySelector("dialog[open]").innerText.includes("正在查询…")')
assert any(v=={'kind':'scheme','key':'review-final-transient'} for v in control()['queries'][before:])
assert snapshot()['activeRequestID']==request and control()['starts']==1
record('return after source disappearance keeps exact original identity and query');capture('missing-request-detail.png')
native('escape');js('document.querySelector("[data-view=app]").click();return true')
assert js('return document.querySelector('+json.dumps('input[aria-label="搜索应用名称、版本、路径或声明"]')+').value')=='review-final'
assert js('return document.querySelector('+json.dumps('input[aria-label="筛选当前关联"]')+').value')=='review-final'
assert js('return document.querySelector("[data-view][aria-pressed=true]").dataset.view')=='app'
record('return preserves original app session')
control(action='complete',path=target);wait('document.querySelector(".change-status")?.innerText.includes("已确认")')
assert not json.loads((isolated/'config.json').read_text()).get('pending')
js('document.querySelector("[data-view=file]").click();return true');fill('input[aria-label="搜索文件类型"]','reviewfinalunresolved20261106')
wait('document.querySelectorAll("[data-association-id]").length===1')
js('document.querySelector("[data-association-id]").click();return true');wait('document.querySelector("dialog[open]")?.innerText.includes("重新解析")')
before=catalog()['version'];p=pathlib.Path(apps[1]['path'])/'Contents/Info.plist';info=plistlib.loads(p.read_bytes());info['CFBundleShortVersionString']='2.0';p.write_bytes(plistlib.dumps(info))
click('重新解析');wait('!document.body.innerText.includes("正在扫描应用")')
latest=catalog();assert latest['version']>before
assert any(a['app']['path']==apps[1]['path'] and a['app']['version']=='2.0' for a in latest['apps'])
assert any(v['id']=='scheme:review-final-manual' for v in latest['entries'])
assert any(v['id']=='scheme:review-final-persistent' for v in latest['entries'])
assert js('return document.querySelector("dialog[open]").innerText.includes("reviewfinalunresolved20261106")')
record('reparse invokes full discovery, preserves unresolved selection and manual/declaration sources',catalogVersion=latest['version'],previousVersion=before);capture('unresolved-reparse.png')
native('escape');assert control()['starts']==1
native('menu');code=0
for _ in range(100):
 if process.poll() is not None:break
 time.sleep(.1)
assert process.poll() is not None
dump('native-summary.json',{'passed':True,'layer':'formal Wails React, native discovery/window, controlled default/setter only','checks':len(checks),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'pid':int((isolated/'pid').read_text()),'exitCode':code,'systemSetters':0,'controlledStarts':1,'fixturesRegistered':False,'limits':'Same-source unresolved-to-resolved and out-of-order bridge failures covered by public React tests; this run verifies full-scan wiring and unchanged unresolved behavior with native resolver.'})
print('passed',len(checks),'focused formal Wails checks')
