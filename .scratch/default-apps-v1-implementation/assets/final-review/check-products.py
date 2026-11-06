import pathlib,subprocess,json,hashlib,time,datetime,shutil
repo=pathlib.Path('/Users/sunven/github/default-apps')
e=repo/'.scratch/default-apps-v1-implementation/assets/final-review'
e.mkdir(parents=True,exist_ok=True)
observer='/Users/sunven/.codex/default-apps-implementation-20261105/final11-window-observer'
def run(*args):return subprocess.check_output(args,stderr=subprocess.STDOUT,text=True,cwd=repo).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
dev=repo/'bin/default-apps.dev.app'
if dev.exists():shutil.rmtree(dev)
(dev/'Contents/MacOS').mkdir(parents=True);(dev/'Contents/Resources').mkdir()
shutil.copy2(repo/'bin/default-apps',dev/'Contents/MacOS/default-apps')
shutil.copy2(repo/'build/darwin/Info.dev.plist',dev/'Contents/Info.plist')
shutil.copy2(repo/'build/darwin/icons.icns',dev/'Contents/Resources/icons.icns')
run('xattr','-cr',str(dev));run('codesign','--force','--deep','--sign','-',str(dev))
environment={'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'macOS':run('sw_vers'),'architecture':run('uname','-m'),'go':run('go','version'),'wails':run('wails3','version'),'sourceCommit':run('git','rev-parse','HEAD'),'frontendLockSHA256':sha(repo/'frontend/package-lock.json')}
config=pathlib.Path.home()/'Library/Application Support/Default Apps/config.json';before=sha(config) if config.exists() else None
products={}
for name in ['default-apps.app','default-apps.dev.app']:
 app=repo/'bin'/name;binary=app/'Contents/MacOS/default-apps'
 info=json.loads(run('plutil','-convert','json','-o','-',str(app/'Contents/Info.plist')))
 assert info['CFBundleIdentifier']=='io.github.sunven.default-apps' and info['LSMinimumSystemVersion']=='13.0.0'
 run('codesign','--verify','--deep','--strict',str(app))
 macho=run('xcrun','vtool','-show-build',str(binary));assert 'minos 13.0' in macho
 build=run('go','version','-m',str(binary));assert 'GOARCH=arm64' in build
 assert all(tag not in build for tag in ['mcp','manual_smoke','change_smoke','native_acceptance','native_adapter_test','native_keyboard'])
 if name=='default-apps.app':assert '-tags=production' in build
 with (e/(name+'-startup-final.log')).open('w') as log:
  p=subprocess.Popen([str(binary)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:
   windows=[]
   for _ in range(80):
    if p.poll() is not None:raise RuntimeError('product exited during startup')
    windows=json.loads(run(observer,str(p.pid),'activate'))
    windows=[w for w in windows if w.get('kCGWindowBounds',{}).get('Width',0)>=1000]
    if windows:break
    time.sleep(.1)
   assert windows,'no actual product window'
   time.sleep(2)
   product={'path':str(app),'SHA256':sha(binary),'plist':info,'signature':run('codesign','-d','--verbose=4',str(app)),'machO':macho,'goBuildInfo':build,'startup':{'pid':p.pid,'window':windows}}
   product['quitRequested']=run(observer,str(p.pid),'quit');product['exitCode']=p.wait(timeout=10)
   assert product['exitCode']==0
   products[name]=product
  finally:
   if p.poll() is None:p.terminate();p.wait(timeout=10)
after=sha(config) if config.exists() else None;assert after==before
result={'environment':environment,'products':products,'ordinaryConfiguration':{'path':str(config),'beforeSHA256':before,'afterSHA256':after,'unchanged':True},'supersedes':'assets/11/products.json ordinary/development binaries; unchanged native acceptance facts retained'}
(e/'products-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'sourceCommit':environment['sourceCommit'],'ordinarySHA256':products['default-apps.app']['SHA256'],'developmentSHA256':products['default-apps.dev.app']['SHA256'],'ordinaryConfigurationUnchanged':True},indent=2))
