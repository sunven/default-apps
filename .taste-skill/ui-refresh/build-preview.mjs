// Isolated visual fixture build. No native runtime or system defaults are accessed.
import {build} from '../../frontend/node_modules/vite/dist/node/index.js';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.scratch/ui-refresh/out/source');
fs.mkdirSync(root,{recursive:true});
const scenarios=['app','file','scheme','detail','candidates','copy','manual','issues','pending','success','recovery','recovery-confirm','quit','empty','error'];
for(const name of scenarios) fs.writeFileSync(path.join(root,name+'.html'),`<!doctype html><html lang="zh-CN" data-type="software" data-motion="on" data-buttons="solid" data-case="${name}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="page-type" content="software"><meta name="site-kind" content="software"><title>Default Apps · UI verification</title></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>`);
fs.writeFileSync(path.join(root,'entry.tsx'),`
import '${path.resolve('frontend/src/main.tsx')}';
const scenario=document.documentElement.dataset.case;
const wait=async(test)=>{for(let i=0;i<120;i++){if(test())return;await new Promise(r=>setTimeout(r,25));}throw Error('Preview state did not settle: '+scenario)};
const click=(selector)=>{const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);el.click()};
(async()=>{
 await wait(()=>document.querySelectorAll('[data-association-id]').length>0);
 if(['file','scheme'].includes(scenario))click('[data-view="'+scenario+'"]');
 if(['detail','candidates','error'].includes(scenario))click('[data-association-id]');
 if(scenario==='copy')click('.app-heading>button');
 if(scenario==='manual')click('.header-actions>button');
 if(scenario==='issues')click('.browser-footer>button');
 if(scenario==='recovery-confirm'){await wait(()=>!document.querySelector('.row-submit').disabled);click('.row-submit')}
 if(scenario==='empty'){
  const el=document.querySelector('input[type=search]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'nothing-matches');
  el.dispatchEvent(new Event('input',{bubbles:true}));
 }
 await new Promise(r=>setTimeout(r,150));
 if(scenario==='candidates')document.querySelector('.dialog-body').scrollTop=520;
 document.documentElement.dataset.ready='1';
})().catch(error=>{document.title='PREVIEW FAILED';console.error(error)});
`);
fs.writeFileSync(path.join(root,'runtime.ts'),`
const scenario=document.documentElement.dataset.case;
const now='2026-11-07T03:00:00Z';
const app=(name,path,version,bundleID)=>({name,path,displayPath:path,version,bundleID});
const preview=app('预览','/System/Applications/Preview.app','11.0','com.apple.Preview');
const safari=app('Safari','/Applications/Safari.app','27.0','com.apple.Safari');
const chrome=app('Google Chrome','/Applications/Google Chrome.app','142.0','com.google.Chrome');
const textedit=app('文本编辑','/System/Applications/TextEdit.app','1.20','com.apple.TextEdit');
const mail=app('邮件','/System/Applications/Mail.app','17.0','com.apple.mail');
const file=(name,key,extensions)=>({id:'file:'+key,association:{kind:'file',key},name,extensions,mimeTypes:[],resolved:true,sources:[{kind:'common',label:'常用文件类型',rawInput:extensions[0]},{kind:'declaration',label:'预览',rawInput:key,appPath:preview.path}],diagnosticIdentifiers:[]});
const entries=[file('PDF 文稿','com.adobe.pdf',['pdf']),file('JPEG 图像','public.jpeg',['jpg','jpeg']),file('PNG 图像','public.png',['png']),file('HEIF 图像','public.heic',['heic']),file('TIFF 图像','public.tiff',['tiff','tif']),file('GIF 图像','com.compuserve.gif',['gif']),file('纯文本文稿','public.plain-text',['txt']),file('富文本文稿','public.rtf',['rtf']),...['https','http','mailto','ftp'].map(key=>({id:'scheme:'+key,association:{kind:'scheme',key},name:{https:'HTTPS 安全网页',http:'HTTP 网页',mailto:'电子邮件',ftp:'FTP 链接'}[key],resolved:true,extensions:[],mimeTypes:[],sources:[{kind:'common',label:'常用协议',rawInput:key}]}))];
const discovered=[preview,safari,chrome,textedit,mail,app('图书','/System/Applications/Books.app','7.0','com.apple.iBooks'),app('Safari','/Volumes/Archive/Applications/Safari.app','26.0','com.apple.Safari')];
const catalog={version:2,scanning:false,apps:discovered.map((app,i)=>({app,associationIDs:(i===0?entries.slice(0,6):i===3?entries.slice(6,8):i===4?[entries[10]]:entries.slice(8,10)).map(e=>e.id)})),entries,issues:[{path:'/Volumes/Archive/Applications',origin:'手动应用位置',message:'该位置暂时不可用，请连接磁盘后重新扫描。'}]};
let version=2;
const observe=association=>({association,version:++version,default:{known:true,app:association.kind==='file'?(association.key==='com.adobe.pdf'&&scenario!=='success'?chrome:preview):association.key==='mailto'?mail:safari,stale:false,error:scenario==='error'?{message:'系统服务暂时不可用，请重新查询。'}:null,observedAt:now},candidates:{known:true,apps:association.kind==='file'?[preview,chrome,safari]:[safari,chrome],stale:false,error:null,observedAt:now}});
const request={requestID:'visual-preview',association:entries[0].association,target:preview,preflight:observe(entries[0].association).default,phase:'submitted',acceptedAt:now,submittedAt:now,completion:{known:false,error:null},readback:{state:'pending',observation:observe(entries[0].association).default},confirmed:false};
const active=['pending','success','quit'].includes(scenario);
if(scenario==='success'){request.confirmed=true;request.completion.known=true;request.readback.state='valid';request.readback.observation.app=preview}
const state={version:2,busy:active&&scenario!=='success',activeRequestID:active?request.requestID:'',requests:active?[request]:[],observations:[],writableKinds:['file','scheme'],storageError:null,recovery:scenario?.startsWith('recovery')?{record:request,ready:true}:null,quit:{prompt:scenario==='quit',promptID:1,exiting:false}};
export const Events={On:()=>()=>{}};
export const Call={ByID:async(id,...args)=>{
 switch(id){
 case 2011754152:case 3776577069:return catalog;
 case 270282811:return entries;
 case 3439020780:return state;
 case 3233615384:case 794654841:return observe(args[0]);
 case 2260118331:return {...state,version:++version,observations:[observe(args[0])]};
 case 3771383732:return {error:''};
 case 2544498690:return {entries:[entries[0]]};
 case 1623629699:case 4243114180:return {saved:true};
 case 788036396:case 2092491607:return {cancelled:true};
 case 3386273962:return;
 default:throw Error('Native calls are disabled in visual fixtures: '+id);
 }
}};
export const CancellablePromise=Promise;
`);
await build({configFile:false,root,resolve:{alias:{'@wailsio/runtime':path.join(root,'runtime.ts'),react:path.resolve('frontend/node_modules/react'),'react-dom':path.resolve('frontend/node_modules/react-dom')}},build:{outDir:path.resolve('.scratch/ui-refresh/out/preview'),emptyOutDir:true,rollupOptions:{input:Object.fromEntries(scenarios.map(name=>[name,path.join(root,name+'.html')]))}}});
