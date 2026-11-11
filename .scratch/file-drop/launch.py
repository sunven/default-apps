import os, pathlib, subprocess
base=pathlib.Path(__file__).resolve().parent
root=base/'out'
root.mkdir(exist_ok=True)
for name in ['one.pdf','two.pdf','notes.txt','unknown.dropfixture']:(root/'fixtures'/name).write_text('file-drop QA\n')
(root/'fixtures'/'folder').mkdir(exist_ok=True)
env=os.environ.copy();env.update(DEFAULT_APPS_MANUAL_SMOKE_ROOT=str(root),WAILS_MCP_PORT='9417',WAILS_MCP_HIDE_CURSOR='1')
with (base/'evidence'/'runtime.log').open('w') as log:
    process=subprocess.Popen([str(root/'Default Apps Drop QA.app/Contents/MacOS/default-apps')],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'qa.pid').write_text(str(process.pid))
print(process.pid)
