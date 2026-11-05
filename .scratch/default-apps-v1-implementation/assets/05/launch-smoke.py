import os,pathlib,subprocess
root=pathlib.Path('/Users/sunven/.codex/default-apps-implementation-20261105/manual05-native')
artifact=pathlib.Path(__file__).resolve().parent
app=pathlib.Path('bin/Default Apps Manual QA.app/Contents/MacOS/default-apps').resolve()
env=os.environ.copy();env.update(DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),WAILS_MCP_PORT='9105')
log=(artifact/'native-launch.log').open('ab')
process=subprocess.Popen([str(app)],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(artifact/'native-pid.txt').write_text(str(process.pid)+'\n');print(process.pid)
