// Test-only Wails service boundary fixture. Production entry/config never imports this file.
const entries=Array.from({length:1000},(_,i)=>({id:`file:test.scale.${i}`,association:{kind:'file',key:`test.scale.${i}`},name:i===999 ? '超长名称 — 桌面出版与跨媒体文稿归档工作流 · 独立类型 999' : `压力文稿 ${String(i).padStart(4,'0')}`,extensions:[i<2?'jpg':`scale${i}`],mimeTypes:['application/x-scale'],sources:[{kind:i===0?'common':'declaration',inputKind:'identifier',rawInput:`test.scale.${i}`,normalizedInput:`test.scale.${i}`,label:'独立压力夹具'}],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[]}))
const longPath='/Volumes/工作归档与历史应用副本/'+('跨设备项目与数字出版验证/'.repeat(18))+'Scale Reader.app'
const app={name:'Scale Reader — 桌面出版与跨媒体文稿归档工作流',version:'2.4',path:'/Applications/Scale Reader.app',displayPath:'/Applications/Scale Reader.app',bundleID:'test.scale.reader'}
const archive={...app,version:'1.2',path:longPath,displayPath:longPath}
const apps=[{app,associationIDs:entries.map(e=>e.id),declarations:[],definitions:[],issues:[]},{app:archive,associationIDs:entries.map(e=>e.id),declarations:[],definitions:[],issues:[]},...Array.from({length:100},(_,i)=>({app:{...app,name:`Archive Tool ${String(i).padStart(3,'0')}`,path:`/Volumes/Tools/Archive Tool ${i}.app`,displayPath:`/Volumes/Tools/Archive Tool ${i}.app`},associationIDs:[],declarations:[],definitions:[],issues:[]}))]
const snapshot={version:2,scanning:false,apps,entries,issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
export const List=async()=>entries
export const GetSnapshot=async()=>snapshot
export const StartScan=async()=>snapshot
export const Query=async(association:unknown)=>({association,version:1,default:{known:true,app:archive,observedAt:'2026-11-06T00:00:00Z',stale:false,error:null},candidates:{known:true,apps:[app,archive],observedAt:'2026-11-06T00:00:00Z',stale:false,error:null}})
export const Events={On:()=>()=>{}}
