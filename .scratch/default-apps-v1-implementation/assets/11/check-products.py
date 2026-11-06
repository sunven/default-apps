import pathlib,subprocess,json,plistlib,hashlib,time,datetime,shutil,os
repo=pathlib.Path.cwd();e=repo/'.scratch/default-apps-v1-implementation/assets/11';observer='/Users/sunven/.codex/default-apps-implementation-20261105/final11-window-observer'
def run(*args):return subprocess.check_output(args,stderr=subprocess.STDOUT,text=True).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# The development executable was built using the documented DEV=true command.
dev=repo/'bin/default-apps.dev.app';(dev/'Contents/MacOS').mkdir(parents=True,exist_ok=True);(dev/'Contents/Resources').mkdir(exist_ok=True)
shutil.copy2(repo/'bin/default-apps',dev/'Contents/MacOS/default-apps');shutil.copy2(repo/'build/darwin/Info.dev.plist',dev/'Contents/Info.plist');shutil.copy2(repo/'build/darwin/icons.icns',dev/'Contents/Resources/icons.icns')
run('xattr','-cr',str(dev));run('codesign','--force','--deep','--sign','-',str(dev))
env={'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'macOS':run('sw_vers'),'architecture':run('uname','-m'),'go':run('go','version'),'wails':run('wails3','version'),'node':run('node','--version'),'npm':run('npm','--version'),'goModule':run('go','list','-m','github.com/wailsapp/wails/v3'),'lockSHA256':sha(repo/'frontend/package-lock.json'),'sourceCommit':run('git','rev-parse','HEAD')}
lock=json.loads((repo/'frontend/package-lock.json').read_text());env['frontendVersions']={k:lock['packages']['node_modules/'+k]['version'] for k in ['react','react-dom','@wailsio/runtime','typescript','vite']}
(e/'environment.json').write_text(json.dumps(env,indent=2)+'\n')
config=pathlib.Path.home()/'Library/Application Support/Default Apps/config.json';before=sha(config) if config.exists() else None
products={}
for name in ['default-apps.app','default-apps.dev.app']:
 app=repo/'bin'/name;binary=app/'Contents/MacOS/default-apps';info=json.loads(run('plutil','-convert','json','-o','-',str(app/'Contents/Info.plist')));run('codesign','--verify','--deep','--strict',str(app))
 log=(e/(name+'-startup.log')).open('w');p=subprocess.Popen([str(binary)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  windows=[]
  for _ in range(80):
   if p.poll() is not None:raise RuntimeError('product exited on launch')
   windows=json.loads(run(observer,str(p.pid),'activate'))
   windows=[w for w in windows if w.get('kCGWindowBounds',{}).get('Width',0)>=1000]
   if windows:break
   time.sleep(.1)
  assert windows,'no actual product window'
  time.sleep(2)
  screenshot=e/(name+'-window.png')
  bounds=windows[0]['kCGWindowBounds'];region=','.join(str(int(bounds[k])) for k in ['X','Y','Width','Height'])
  shot=subprocess.run(['screencapture','-x','-R',region,str(screenshot)],capture_output=True,text=True)
  product={'path':str(app),'SHA256':sha(binary),'plist':info,'signature':run('codesign','-d','--verbose=4',str(app)),'machO':run('xcrun','vtool','-show-build',str(binary)),'goBuildInfo':run('go','version','-m',str(binary)),'startup':{'pid':p.pid,'window':windows,'screenshotResult':shot.returncode,'screenshotStderr':shot.stderr}}
  product['quitRequested']=run(observer,str(p.pid),'quit');product['exitCode']=p.wait(timeout=10);assert product['exitCode']==0
  products[name]=product
 finally:
  if p.poll() is None:p.terminate();p.wait(timeout=10)
  log.close()
assert (sha(config) if config.exists() else None)==before
products['ordinaryConfiguration']={'path':str(config),'beforeSHA256':before,'afterSHA256':sha(config) if config.exists() else None,'unchanged':True}
(e/'products.json').write_text(json.dumps(products,indent=2,ensure_ascii=False)+'\n')
# Only product bundle contents cross into the stable delivery directory.
stable=pathlib.Path('/Users/sunven/github/default-apps/bin/default-apps.app');stable.parent.mkdir(exist_ok=True)
if stable.exists():shutil.rmtree(stable)
shutil.copytree(repo/'bin/default-apps.app',stable)
run('codesign','--verify','--deep','--strict',str(stable));assert sha(stable/'Contents/MacOS/default-apps')==products['default-apps.app']['SHA256']
(e/'deliverable.json').write_text(json.dumps({'path':str(stable),'SHA256':sha(stable/'Contents/MacOS/default-apps'),'sourceCommit':env['sourceCommit'],'signatureVerified':True,'isolatedConfigurationCopied':False},indent=2)+'\n')
print('ordinary and development products started, displayed actual windows, and quit cleanly')
