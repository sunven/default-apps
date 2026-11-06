"""Fresh inert bundles only. Registration is a separate, recorded action."""
import json,pathlib,plistlib,shutil,subprocess,uuid,datetime
evidence=pathlib.Path(__file__).resolve().parent
manifest_path=evidence/'manifest.json'
if manifest_path.exists(): raise RuntimeError('Use the existing immutable manifest; never overwrite a run identity')
token=uuid.uuid4().hex
root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105')/('native10-'+token)
root.mkdir()
manifest={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'token':token,'root':str(root),'type':'org.defaultapps.acceptance.'+token+'.document','scheme':'defaultapps-acceptance-'+token,'extension':'dafa'+token,'targets':{}}
source=evidence/'fixture.m'
source.write_text('#import <AppKit/AppKit.h>\nint main(int argc, const char **argv) { @autoreleasepool { return 0; } }\n')
subprocess.run(['xcrun','clang','-fobjc-arc','-mmacosx-version-min=13.0','-framework','AppKit',str(source),'-o',str(root/'fixture')],check=True)
for key,name,suffix,version,declared in [('a','Scheme Acceptance A','a','1.0',True),('b','Scheme Acceptance B','b','2.0',True)]:
    path=root/'fixtures'/(name+'.app')
    (path/'Contents/MacOS').mkdir(parents=True)
    shutil.copy2(root/'fixture',path/'Contents/MacOS/fixture')
    info={'CFBundleName':name,'CFBundleDisplayName':name,'CFBundleIdentifier':f'org.defaultapps.acceptance.{token}.{suffix}','CFBundleExecutable':'fixture','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':version,'LSMinimumSystemVersion':'13.0'}
    if declared:
        info['CFBundleDocumentTypes']=[{'CFBundleTypeName':'Dedicated Acceptance Document','CFBundleTypeRole':'Viewer','LSHandlerRank':'Alternate','LSItemContentTypes':[manifest['type']]}]
        info['UTExportedTypeDeclarations']=[{'UTTypeIdentifier':manifest['type'],'UTTypeConformsTo':['public.data'],'UTTypeDescription':'Dedicated Acceptance Document','UTTypeTagSpecification':{'public.filename-extension':manifest['extension']}}]
        info['CFBundleURLTypes']=[{'CFBundleURLName':'Dedicated Acceptance Scheme','CFBundleURLSchemes':[manifest['scheme']],'CFBundleTypeRole':'Viewer'}]
    (path/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    subprocess.run(['codesign','--force','--sign','-',str(path)],check=True)
    manifest['targets'][key]={'path':str(path),'displayPath':str(path),'name':name,'version':version,'bundleID':info['CFBundleIdentifier'],'declared':declared}
(root/('sample.'+manifest['extension'])).write_text('Dedicated acceptance fixture; contains no user data.\n')
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
manifest_path.chmod(0o444)
print(json.dumps(manifest,ensure_ascii=False,indent=2))
