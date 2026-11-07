"""Run the skill's browsers sequentially; all generated files stay in ignored out/."""
import subprocess, pathlib, json
skill=pathlib.Path.home()/'.agents/skills/design-taste-frontend'
out=pathlib.Path('.scratch/ui-refresh/out')
preview=out/'preview'
results=[]
for name in ['app','file','scheme']:
 args=['node',str(skill/'assets/layout/check.mjs'),'--url',str(preview/(name+'.html')),'--root',str(preview),'--sizes','1440x900,1024x768,1000x700,820x1180,768x1024,390x844','--json']
 with (out/('layout-'+name+'.json')).open('w') as f:
  result=subprocess.run(args,stdout=f,stderr=subprocess.PIPE,text=True)
 results.append({'page':name,'check':'layout','exit':result.returncode,'stderr':result.stderr})
 print('layout',name,result.returncode,flush=True)
for name in ['app','file','scheme','detail','candidates','copy','manual','issues','pending','success','recovery','recovery-confirm','quit','empty','error']:
 sizes=[(1440,900),(1024,768),(1000,700),(820,1180),(768,1024),(390,844)] if name in ['app','file','scheme'] else [(1000,700),(390,844)]
 for width,height in sizes:
  dest=out/(name+'-'+str(width)+'.png')
  args=['node',str(skill/'scripts/shoot.mjs'),'--url',str(preview/(name+'.html')),'--root',str(preview),'--w',str(width),'--h',str(height),'--out',str(dest),'--no-tiles']
  result=subprocess.run(args,capture_output=True,text=True)
  results.append({'page':name,'width':width,'check':'screenshot','exit':result.returncode,'output':result.stdout+result.stderr})
  print(name,width,result.returncode,flush=True)
  (out/'visual-runs.json').write_text(json.dumps(results,indent=2))
