import pathlib,plistlib,subprocess
root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/manual05-native');root.mkdir(exist_ok=True)
source=root/'fixture.c';source.write_text('int main(void) { return 0; }\n')
for name,version in [('outside-one','1.0'),('outside-two','2.0')]:
 app=root/name/'Manual Reader.app';(app/'Contents/MacOS').mkdir(parents=True,exist_ok=True)
 with (app/'Contents/Info.plist').open('wb') as file:plistlib.dump({'CFBundleIdentifier':'com.sunven.defaultapps.manual05.fixture','CFBundleName':'Manual Reader','CFBundleExecutable':'fixture','CFBundlePackageType':'APPL','CFBundleShortVersionString':version},file)
 subprocess.run(['xcrun','clang','-mmacosx-version-min=13.0',str(source),'-o',str(app/'Contents/MacOS/fixture')],check=True)
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
(root/'selected.txt').write_text('Metadata identification fixture.\n')
(root/'selected.defaultappsunknown05').write_text('Unknown file fixture.\n')
alias=root/'Manual Alias.app'
if not alias.exists():alias.symlink_to(root/'outside-one/Manual Reader.app')
print(root)
