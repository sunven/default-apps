import json,os,pathlib,plistlib,shutil,subprocess
repo=pathlib.Path.cwd();root=repo/'.scratch/automatic-updates';runtime=root/'runtime';runtime.mkdir(exist_ok=True)
base=repo/'bin/default-apps.app'
env=os.environ.copy();env.update(CGO_CFLAGS='-mmacosx-version-min=13.0',CGO_LDFLAGS='-mmacosx-version-min=13.0',MACOSX_DEPLOYMENT_TARGET='13.0')
for name,version in [('current','0.1.0'),('new','0.1.1')]:
 app=runtime/name/'default-apps.app'
 if app.exists():shutil.rmtree(app)
 shutil.copytree(base,app,symlinks=True)
 versionFile=root/f'version-{name}.txt';versionFile.write_text(version+'\n')
 overlay=root/f'overlay-{name}.json';overlay.write_text(json.dumps({'Replace':{str(repo/'internal/buildinfo/version.txt'):str(versionFile)}}))
 subprocess.run(['go','build','-overlay',str(overlay),'-tags','production,mcp,manual_smoke,lifecycle_smoke,update_smoke','-o',str(app/'Contents/MacOS/default-apps')],env=env,check=True)
 info=plistlib.loads(subprocess.check_output(['/usr/bin/plutil','-convert','xml1','-o','-',str(app/'Contents/Info.plist')]))
 info['CFBundleVersion']=info['CFBundleShortVersionString']=version
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
 subprocess.run(['/usr/bin/xattr','-cr',str(app)],check=True)
 subprocess.run(['/usr/bin/codesign','--force','--deep','--sign','-',str(app)],check=True)
 subprocess.run(['/usr/bin/codesign','--verify','--deep','--strict',str(app)],check=True)
 print(name,version,str(app),flush=True)
archive=runtime/'default-apps-darwin-arm64.zip'
archive.unlink(missing_ok=True)
subprocess.run(['/usr/bin/ditto','-c','-k','--norsrc','--keepParent',str(runtime/'new/default-apps.app'),str(archive)],check=True)
