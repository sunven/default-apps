#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const write=(file,value)=>fs.writeFileSync(path.join(root,file),value)
const versionFile='internal/buildinfo/version.txt'
const mode=process.argv[2]??'check'
const version=mode==='set'?process.argv[3]:read(versionFile).trim()
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version??'')) throw Error('Expected stable version X.Y.Z')
if(!['check','set','print'].includes(mode)) throw Error('Usage: node scripts/version.mjs [check|print|set X.Y.Z]')
if(mode==='print'){console.log(version);process.exit(0)}
const transforms={
 'build/config.yml':text=>text.replace(/^(  version:) "[^"]+"$/m,`$1 "${version}"`),
 'build/darwin/Info.plist':plist,
 'build/darwin/Info.dev.plist':plist,
 'frontend/package.json':text=>{const p=JSON.parse(text);p.version=version;return JSON.stringify(p,null,2)+'\n'},
 'frontend/package-lock.json':text=>{const p=JSON.parse(text);p.version=version;p.packages[''].version=version;return JSON.stringify(p,null,2)+'\n'},
}
function plist(text){return text.replace(/(<key>CFBundle(?:ShortVersionString|Version)<\/key>\s*<string>)[^<]+(<\/string>)/g,`$1${version}$2`)}
for(const [file,transform]of Object.entries(transforms)){
 const before=read(file),after=transform(before)
 if(mode==='set')write(file,after)
 else if(before!==after)throw Error(`${file} differs from ${versionFile}; run node scripts/version.mjs set ${version}`)
}
if(mode==='set')write(versionFile,version+'\n')
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`v${version}`)throw Error('Release tag does not match application version')
console.log(`${mode==='set'?'Set':'Verified'} version ${version}`)
