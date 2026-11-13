import {expect,test,vi} from 'vitest'
import {BatchWorkflow,type BatchAdapter} from './batchWorkflow'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {BatchPreview,BatchResult,BatchSelection,Snapshot} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {IdentifiedFile,Result} from '../bindings/github.com/sunven/default-apps/internal/manual/models'

const app={path:'/Applications/Editor.app',displayPath:'/Applications/Editor.app',name:'Editor',version:'2',bundleID:'test.editor'}
const other={...app,path:'/Applications/Other.app',name:'Other'}
const entry=(key:string):Entry=>({id:`file:${key}`,association:{kind:'file',key},name:key,extensions:['same'],mimeTypes:[],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[],sources:[]})
const pdf=entry('pdf'),json=entry('json'),text=entry('text')
const file=(path:string,type=pdf):IdentifiedFile=>({path,name:path,entries:[type],error:''})
const initial:Snapshot={version:1,busy:false,batchBlocked:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file'],storageError:null,recovery:null,quit:{promptID:0,prompt:false,exiting:false}}
const makePreview=(id:string,items:readonly BatchSelection[],path=app.path,resumeID=''):BatchPreview=>({id,target:path===app.path?app:other,baseBatchID:resumeID,baseRevision:0,resumeBatchID:resumeID,replaceBatchID:'',items:items.map(selection=>({selection,expected:{known:true,path:other.path},observed:other,status:'queued',message:'',requestID:'',attempts:0}))})
const accepted=(p:BatchPreview,version=2):Snapshot=>({...initial,version,batch:{id:'batch-1',revision:1,state:'completed',target:p.target,items:p.items,error:'',createdAt:'now',commands:[p.id],runItems:[]}})
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function setup(saved=''){
 let stored=saved,sequence=0
 const adapter={
  identify:vi.fn<BatchAdapter['identify']>(async paths=>paths.map(path=>file(path))),
  saveType:vi.fn<BatchAdapter['saveType']>(async()=>({saved:true,cancelled:false,entry:pdf,app:null})),
  pickApplication:vi.fn<BatchAdapter['pickApplication']>(async()=>({saved:true,cancelled:false,entry:null,app})),
  prepare:vi.fn<BatchAdapter['prepare']>(async(items,path,resumeID)=>makePreview(`preview-${++sequence}`,items,path,resumeID)),
  start:vi.fn<BatchAdapter['start']>(),reconcile:vi.fn<BatchAdapter['reconcile']>(),stop:vi.fn<BatchAdapter['stop']>(),
  retry:vi.fn<BatchAdapter['retry']>(async()=>{}),accept:vi.fn<BatchAdapter['accept']>(),
  storage:{load:()=>stored,save:vi.fn((id:string)=>{stored=id}),clear:vi.fn(()=>{stored=''})},
 }
 const workflow=new BatchWorkflow(adapter)
 workflow.updateContext({state:initial,sending:false,pending:false})
 return {workflow,adapter,stored:()=>stored,connect:()=>workflow.connect(),observe:(state:Snapshot,sending=false,pending=false)=>workflow.updateContext({state,sending,pending})}
}
function files(workflow:BatchWorkflow){const panel=workflow.getSnapshot().panel;if(panel.kind!=='files')throw new Error(`Expected files, got ${panel.kind}`);return panel.draft}
function preview(workflow:BatchWorkflow){const panel=workflow.getSnapshot().panel;if(panel.kind!=='preview')throw new Error(`Expected preview, got ${panel.kind}`);return panel.preview}
async function select(workflow:BatchWorkflow){workflow.toggle(pdf);workflow.choose();await workflow.prepare(app);return preview(workflow)}

test('selection actions retain hidden items and reject unresolved or non-file inputs',()=>{
 const {workflow:w,connect}=setup();connect()
 w.toggle(pdf);w.toggleVisible([json,{...text,resolved:false},{...text,association:{kind:'scheme',key:'http'}}])
 w.showSelected();expect([...w.getSnapshot().selected.keys()]).toEqual([pdf.id,json.id])
 w.toggleVisible([json]);expect([...w.getSnapshot().selected.keys()]).toEqual([pdf.id])
 w.close();w.choose();w.clearSelection()
 expect(w.getSnapshot().selected.size).toBe(1)
 w.close();w.removeSelected(pdf.id);expect(w.getSnapshot().selected.size).toBe(0)
})

test.each(['success','failure'])('cancelled identification cannot overwrite a new draft or release its activity: %s',async outcome=>{
 const {workflow:w,adapter,connect}=setup();connect()
 const old=deferred<IdentifiedFile[]>(),fresh=deferred<IdentifiedFile[]>()
 adapter.identify.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
 const abandoned=w.receiveFiles(['/old.pdf'])
 expect(await w.receiveFiles(['/refused.pdf'])).toContain('正在识别')
 w.close();const current=w.receiveFiles(['/fresh.pdf'])
 if(outcome==='success')old.resolve([file('/old.pdf')]);else old.reject(new Error('old error'))
 await abandoned
 expect(w.getSnapshot().activity).toBe('identifying');expect(files(w).files).toHaveLength(0);expect(w.getSnapshot().error).toBe('')
 fresh.resolve([file('/fresh.pdf')]);await current
 expect(files(w).files.map(file=>file.path)).toEqual(['/fresh.pdf'])
 expect(adapter.identify).toHaveBeenCalledTimes(2)
})

test.each(['success','failure'])('returning during preview preparation preserves the draft and fences old %s',async outcome=>{
 const {workflow:w,adapter,connect}=setup();connect();await w.receiveFiles(['/one.pdf'])
 w.chooseFiles()
 const old=deferred<BatchPreview>(),fresh=deferred<BatchPreview>()
 adapter.prepare.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
 const abandoned=w.prepare(app)
 expect(w.getSnapshot().can.returnToFiles).toBe(true)
 w.returnToFiles();expect(files(w).files).toHaveLength(1)
 await w.receiveFiles(['/two.pdf']);w.chooseFiles();const current=w.prepare(other)
 if(outcome==='success')old.resolve(makePreview('old',[],app.path));else old.reject(new Error('old error'))
 await abandoned
 expect(w.getSnapshot().panel.kind).toBe('choose');expect(w.getSnapshot().activity).toBe('preparing');expect(w.getSnapshot().error).toBe('')
 fresh.resolve(makePreview('fresh',[],other.path));await current
 expect(preview(w).id).toBe('fresh');expect(w.getSnapshot().activity).toBeNull()
 expect(adapter.start).not.toHaveBeenCalled()
})

test('closing a selection preview preparation keeps checkboxes and never resurrects the panel',async()=>{
 const {workflow:w,adapter,connect}=setup();connect();w.toggle(pdf);w.choose()
 const reply=deferred<BatchPreview>();adapter.prepare.mockReturnValue(reply.promise)
 const work=w.prepare(app);w.close();reply.resolve(makePreview('old',[]));await work
 expect(w.getSnapshot().panel.kind).toBe('closed');expect(w.getSnapshot().selected.has(pdf.id)).toBe(true)
 expect(adapter.start).not.toHaveBeenCalled()
})

test.each(['success','failure'])('a native picker reply belongs only to the workflow that opened it: %s',async outcome=>{
 const {workflow:w,adapter,connect}=setup();connect();w.toggle(pdf);w.choose()
 const reply=deferred<Result>();adapter.pickApplication.mockReturnValue(reply.promise)
 const picking=w.pickApplication();w.close();w.choose()
 if(outcome==='success')reply.resolve({saved:true,cancelled:false,entry:null,app});else reply.reject(new Error('old picker error'))
 await picking
 expect(w.getSnapshot().panel.kind).toBe('choose');expect(w.getSnapshot().error).toBe('')
 expect(adapter.prepare).not.toHaveBeenCalled()
 await w.pickApplication();expect(adapter.pickApplication).toHaveBeenCalledTimes(2)
})

test('file identity, choices and exclusions survive returning and appending; each preview captures its own list',async()=>{
 const {workflow:w,adapter,connect}=setup();connect();w.toggle(json)
 adapter.identify.mockResolvedValueOnce([file('/one'),file('/two'),{...file('/ambiguous'),entries:[json,text]}])
 await w.receiveFiles(['/one','/two','/ambiguous'])
 w.chooseFileType('/ambiguous','not-a-choice');expect(files(w).groups).toHaveLength(1)
 w.chooseFileType('/ambiguous',text.id);w.toggleFileType(pdf.id);w.chooseFiles();await w.prepare(app)
 const first=preview(w);expect(first.items?.map(item=>item.selection.association.key)).toEqual(['text'])
 w.returnToFiles();adapter.identify.mockResolvedValueOnce([file('/one'),file('/three',json)])
 await w.receiveFiles(['/one','/three']);expect(files(w).files).toHaveLength(4);expect(files(w).excluded.has(pdf.id)).toBe(true)
 w.toggleFileType(pdf.id);w.chooseFiles();await w.prepare(other)
 expect(preview(w).items?.map(item=>item.selection.association.key)).toEqual(['pdf','text','json'])
 expect(first.items?.map(item=>item.selection.association.key)).toEqual(['text'])
 w.close();expect(w.getSnapshot().selected.has(json.id)).toBe(true)
 await w.receiveFiles(['/fresh']);expect(files(w).files).toHaveLength(1)
})

test('optional saving can fail or finish after cancellation without changing the next draft',async()=>{
 const {workflow:w,adapter,connect}=setup();connect();await w.receiveFiles(['/one'])
 adapter.saveType.mockRejectedValueOnce(new Error('disk full'))
 await w.saveFileType(pdf.id);expect(files(w).saved[pdf.id]).toContain('可继续设置');expect(w.getSnapshot().can.chooseFiles).toBe(true)
 const reply=deferred<Result>();adapter.saveType.mockReturnValueOnce(reply.promise)
 const saving=w.saveFileType(pdf.id);w.close();await w.receiveFiles(['/fresh'])
 reply.resolve({saved:true,cancelled:false,entry:pdf,app:null});await saving
 expect(files(w).saved[pdf.id]).toBeUndefined();expect(files(w).files[0].path).toBe('/fresh')
 expect(adapter.saveType).toHaveBeenCalledTimes(2)
})

test.each([
 ['busy',{...initial,busy:true},false,false],
 ['running',{...initial,batch:{...accepted(makePreview('p',[])).batch!,state:'running'},busy:false},false,false],
 ['single sending',initial,true,false],
 ['single pending',initial,false,true],
 ['quit',{...initial,quit:{...initial.quit,prompt:true}},false,false],
] as const)('drops blocked by %s are rejected, never queued',async(_,state,sending,pending)=>{
 const {workflow:w,adapter,connect,observe}=setup();connect();observe(state,sending,pending)
 expect(await w.receiveFiles(['/refused'])).not.toBe('')
 observe({...initial,version:10})
 expect(adapter.identify).not.toHaveBeenCalled()
 await w.receiveFiles(['/accepted']);expect(adapter.identify).toHaveBeenCalledExactlyOnceWith(['/accepted'])
})

test('other dialogs, application selection and preview reject drops before invoking identification',async()=>{
 const {workflow:w,adapter,connect}=setup();connect()
 expect(await w.receiveFiles(['/other'],true)).toContain('当前面板')
 w.toggle(pdf);w.choose();expect(await w.receiveFiles(['/choose'])).toContain('当前面板')
 await w.prepare(app);expect(await w.receiveFiles(['/preview'])).toContain('当前面板')
 expect(adapter.identify).not.toHaveBeenCalled()
})

test.each(['selection','files'])('an admission event settles a hanging start once and preserves the next workflow: %s',async source=>{
 const {workflow:w,adapter,connect,observe,stored}=setup();connect()
 let p:BatchPreview
 if(source==='selection')p=await select(w)
 else{w.toggle(json);await w.receiveFiles(['/one']);w.chooseFiles();await w.prepare(app);p=preview(w)}
 const reply=deferred<BatchResult>()
 adapter.start.mockImplementation(()=>{expect(stored()).toBe(p.id);return reply.promise})
 const started=w.start(false,'');await w.start(false,'');w.close();w.returnToFiles()
 expect(w.getSnapshot().panel.kind).toBe('preview');expect(w.getSnapshot().pending).toBe(p.id)
 observe(accepted(p))
 expect(w.getSnapshot().panel.kind).toBe('results');expect(w.getSnapshot().pending).toBe('');expect(w.getSnapshot().activity).toBeNull()
 expect(stored()).toBe('');expect(w.getSnapshot().selected.has(json.id)).toBe(source==='files')
 w.close();if(source==='selection')w.toggle(json);w.choose();await w.prepare(other)
 const next=preview(w)
 reply.resolve({outcome:'accepted',message:'',snapshot:{...accepted(p),version:1,busy:true}});await started
 expect(preview(w)).toBe(next);expect(w.getSnapshot().selected.has(json.id)).toBe(true);expect(w.getSnapshot().batch?.id).toBe('batch-1')
 expect(adapter.start).toHaveBeenCalledTimes(1);expect(adapter.reconcile).not.toHaveBeenCalled()
})

test('start identity persistence fails before submission and the same preview can be explicitly retried',async()=>{
 const {workflow:w,adapter,connect}=setup();connect();const p=await select(w)
 adapter.storage.save.mockImplementationOnce(()=>{throw new Error('storage unavailable')})
 await w.start(false,'');expect(adapter.start).not.toHaveBeenCalled();expect(w.getSnapshot().error).toContain('无法保存原提交身份')
 adapter.start.mockResolvedValue({outcome:'accepted',message:'',snapshot:accepted(p)})
 await w.start(false,'');expect(adapter.start).toHaveBeenCalledExactlyOnceWith(p.id,'','')
})

test('lost start and failed reconciliation retain one identity and block new modifications until a manual recheck',async()=>{
 const {workflow:w,adapter,connect,stored}=setup();connect();const p=await select(w)
 adapter.start.mockRejectedValue(new Error('reply lost'));adapter.reconcile.mockRejectedValueOnce(new Error('offline'))
 await w.start(false,'')
 expect(stored()).toBe(p.id);expect(w.getSnapshot().can.reconcile).toBe(true);expect(w.getSnapshot().submissionBlocked).toBe(true)
 w.close();w.choose();await w.start(false,'');expect(adapter.start).toHaveBeenCalledTimes(1)
 adapter.reconcile.mockResolvedValue({outcome:'closed',message:'请重新预览',snapshot:initial})
 await w.reconcile();expect(w.getSnapshot().panel.kind).toBe('choose');expect(w.getSnapshot().error).toBe('请重新预览');expect(stored()).toBe('')
 expect(adapter.reconcile.mock.calls).toEqual([[p.id],[p.id]])
})

test('a reloaded pending start only reconciles, even if its original workflow no longer exists',async()=>{
 const {workflow:w,adapter,connect,stored}=setup('saved-preview')
 adapter.reconcile.mockResolvedValue({outcome:'existing',message:'',snapshot:accepted(makePreview('saved-preview',[]))})
 connect();await Promise.resolve();await Promise.resolve()
 expect(w.getSnapshot().panel.kind).toBe('results');expect(stored()).toBe('')
 expect(adapter.reconcile).toHaveBeenCalledExactlyOnceWith('saved-preview');expect(adapter.prepare).not.toHaveBeenCalled();expect(adapter.start).not.toHaveBeenCalled()
})

test('a failed identity cleanup keeps new starts blocked until cleanup succeeds',async()=>{
 const {workflow:w,adapter,connect,stored}=setup();connect();const p=await select(w)
 adapter.start.mockResolvedValue({outcome:'accepted',message:'',snapshot:accepted(p)})
 const clear=adapter.storage.clear.getMockImplementation()!
 adapter.storage.clear.mockImplementation(()=>{throw new Error('storage offline')})
 await w.start(false,'');expect(w.getSnapshot().pending).toBe(p.id);expect(w.getSnapshot().can.reconcile).toBe(true)
 expect(w.getSnapshot().error).toContain('无法清除');expect(w.getSnapshot().selected.has(pdf.id)).toBe(true)
 adapter.storage.clear.mockImplementation(clear);adapter.reconcile.mockResolvedValue({outcome:'existing',message:'',snapshot:accepted(p)})
 await w.reconcile();expect(w.getSnapshot().pending).toBe('');expect(w.getSnapshot().selected.size).toBe(0)
 expect(stored()).toBe('')
 expect(adapter.start).toHaveBeenCalledTimes(1)
})

test('resume and retry preview only their requested items, preserve the old batch when cancelled and carry its identity on target change',async()=>{
 const {workflow:w,adapter,connect,observe}=setup();connect()
 const batch=accepted(makePreview('old',[pdf,json,text].map(e=>({association:e.association,name:e.name,extensions:[]})))).batch!
 batch.items!.forEach((item,index)=>{item.status=['confirmed','queued','failed'][index]})
 observe({...initial,version:2,batch});w.showResults();await w.resume('remaining')
 expect(preview(w).items?.map(item=>item.selection.association.key)).toEqual(['json']);expect(preview(w).resumeBatchID).toBe(batch.id)
 w.changeApp();await w.prepare(other);expect(adapter.prepare).toHaveBeenLastCalledWith(expect.any(Array),other.path,batch.id)
 w.close();expect(w.getSnapshot().batch).toEqual(batch);w.showResults();await w.resume('problems')
 expect(preview(w).items?.map(item=>item.selection.association.key)).toEqual(['text']);expect(adapter.start).not.toHaveBeenCalled()
})

test('start validates replacement and the exact recovery acknowledgment at the action interface',async()=>{
 const {workflow:w,adapter,connect,observe}=setup();connect()
 adapter.prepare.mockImplementationOnce(async items=>({...makePreview('requires-confirmation',items),replaceBatchID:'previous-batch'}))
 const p=await select(w)
 const record={requestID:'old-request',association:pdf.association,target:other,preflight:{known:true,app:other,stale:false,error:null,observedAt:'then'},phase:'recovered',acceptedAt:'then',submittedAt:'then'}
 observe({...initial,version:2,recovery:{record,ready:true}})
 await w.start(false,'old-request');await w.start(true,'');expect(adapter.start).not.toHaveBeenCalled()
 observe({...initial,version:3,recovery:{record:{...record,requestID:'new-request'},ready:true}})
 await w.start(true,'old-request');expect(adapter.start).not.toHaveBeenCalled()
 adapter.start.mockResolvedValue({outcome:'accepted',message:'',snapshot:accepted(p,4)})
 await w.start(true,'new-request')
 expect(adapter.start).toHaveBeenCalledExactlyOnceWith(p.id,'previous-batch','new-request')
})

test('an empty preview stays inspectable but cannot start even through a direct action',async()=>{
 const {workflow:w,adapter,connect}=setup();connect()
 adapter.prepare.mockImplementationOnce(async items=>{const p=makePreview('unchanged',items);p.items![0].status='unchanged';return p})
 await select(w);await w.start(false,'')
 expect(w.getSnapshot().can.start).toBe(false);expect(w.getSnapshot().can.changeApp).toBe(true)
 expect(adapter.storage.save).not.toHaveBeenCalled();expect(adapter.start).not.toHaveBeenCalled()
})

test('stopping is serialized and only an authoritative later snapshot unlocks continuation',async()=>{
 const {workflow:w,adapter,connect,observe}=setup();connect()
 const p=makePreview('running',[]),state={...accepted(p),busy:true,batchBlocked:true,batch:{...accepted(p).batch!,state:'waiting'}}
 observe(state);w.showResults()
 const reply=deferred<BatchResult>();adapter.stop.mockReturnValue(reply.promise)
 const stopping=w.stop();await w.stop();expect(adapter.stop).toHaveBeenCalledExactlyOnceWith('batch-1')
 reply.resolve({outcome:'stopped',message:'',snapshot:{...state,version:3,batch:{...state.batch,state:'stopped'}}});await stopping
 expect(w.getSnapshot().can.review).toBe(false);expect(await w.receiveFiles(['/blocked'])).not.toBe('')
 observe({...state,version:4,busy:false,batchBlocked:false,batch:{...state.batch,state:'stopped'}})
 expect(w.getSnapshot().can.review).toBe(true);expect(adapter.start).not.toHaveBeenCalled()
})

test.each(['identifying','picking','preparing'])('a disconnected %s operation cannot affect a reconnected lifecycle',async kind=>{
 const {workflow:w,adapter,connect}=setup();connect()
 const identified=deferred<IdentifiedFile[]>(),picked=deferred<Result>(),prepared=deferred<BatchPreview>()
 let work:Promise<unknown>
 if(kind==='identifying'){adapter.identify.mockReturnValueOnce(identified.promise);work=w.receiveFiles(['/old'])}
 else{
  w.toggle(pdf);w.choose()
  if(kind==='picking'){adapter.pickApplication.mockReturnValue(picked.promise);work=w.pickApplication()}
  else{adapter.prepare.mockReturnValueOnce(prepared.promise);work=w.prepare(app)}
 }
 w.disconnect();w.connect();w.close();await w.receiveFiles(['/fresh'])
 identified.resolve([file('/old')]);picked.resolve({saved:true,cancelled:false,entry:null,app});prepared.resolve(makePreview('old',[]));await work
 expect(files(w).files.map(file=>file.path)).toEqual(['/fresh']);expect(w.getSnapshot().activity).toBeNull();expect(adapter.start).not.toHaveBeenCalled()
})
