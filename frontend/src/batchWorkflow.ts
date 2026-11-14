import type {AppCopy,Association} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {BatchPreview,BatchResult,BatchSelection,Snapshot} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {IdentifiedFile,Result} from '../bindings/github.com/sunven/default-apps/internal/manual/models'
import {message} from './errors'

export type BatchAdapter={
 identify(paths:string[]):PromiseLike<IdentifiedFile[]|null>
 saveType(identifier:string):PromiseLike<Result>
 pickApplication():PromiseLike<Result>
 prepare(items:readonly BatchSelection[],path:string,resumeID:string):PromiseLike<BatchPreview>
 start(id:string,replaceID:string,recoveryID:string):PromiseLike<BatchResult>
 reconcile(id:string):PromiseLike<BatchResult>
 stop(id:string):PromiseLike<BatchResult>
 retry(association:Association):PromiseLike<void>
 accept(snapshot:Snapshot):void
 storage:{load():string;save(id:string):void;clear():void}
}
export type BatchContext={state:Snapshot|null;sending:boolean;pending:boolean}
type FileChoice=IdentifiedFile&{choice:string}
type FileGroup={entry:Entry;files:readonly FileChoice[]}
type FileDraft={
 readonly files:readonly FileChoice[]
 readonly groups:readonly FileGroup[]
 readonly excluded:ReadonlySet<string>
 readonly saved:Readonly<Record<string,string>>
}
type ApplicationFlow={readonly source:'application';readonly resumeID:'';readonly items:readonly BatchSelection[];readonly app:AppCopy}
type ChoiceFlow={readonly items:readonly BatchSelection[]}&(
 |{readonly source:'selection';readonly resumeID:''}
 |{readonly source:'files';readonly resumeID:'';readonly draft:FileDraft}
 |{readonly source:'resume';readonly resumeID:string}
)
type Flow=ChoiceFlow|ApplicationFlow
export type BatchPanel=
 |{readonly kind:'closed'}
 |{readonly kind:'selected';readonly app?:AppCopy}
 |{readonly kind:'results'}
 |{readonly kind:'files';readonly draft:FileDraft}
 |{readonly kind:'choose';readonly flow:ChoiceFlow}
 |{readonly kind:'application';readonly flow:ApplicationFlow}
 |{readonly kind:'preview';readonly flow:Flow;readonly preview:BatchPreview}
type Activity='identifying'|'saving'|'picking'|'preparing'|'starting'|'reconciling'|'stopping'
type Operation={kind:Activity}
type Attempt={id:string;flow:Flow|null}
const activityLabels:Record<Activity,string>={identifying:'正在识别',saving:'正在保存手动关联',picking:'正在选择应用',preparing:'正在检查当前默认并准备预览',starting:'正在受理',reconciling:'正在核对原批量设置',stopping:'正在停止后续设置'}
const selectionOf=(entry:Entry):BatchSelection=>({association:{...entry.association},name:entry.name||entry.association.key,extensions:[...(entry.extensions??[])]})
const eligible=(entry:Entry)=>entry.resolved&&entry.association.kind==='file'
const problem=(status:string)=>['failed','changed','unavailable','unknown'].includes(status)
const emptySelection:ReadonlyMap<string,BatchSelection>=new Map()
function fileDraft(files:readonly FileChoice[]=[],excluded:ReadonlySet<string>=new Set(),saved:Readonly<Record<string,string>>={}):FileDraft{
 const groups=new Map<string,{entry:Entry;files:FileChoice[]}>()
 for(const file of files){
  const entry=file.entries?.find(entry=>eligible(entry)&&entry.id===file.choice)
  if(!entry)continue
  const group=groups.get(entry.id)
  if(group)group.files.push(file);else groups.set(entry.id,{entry,files:[file]})
 }
 return {files,groups:Array.from(groups.values()),excluded,saved}
}

// One window owns both drafts and the current workflow. Only an accepted start
// crosses into Go's durable batch; abandoning a read cannot forget that start.
export class BatchWorkflow {
 private context:BatchContext={state:null,sending:false,pending:false}
 private panel:BatchPanel={kind:'closed'}
 private selected:ReadonlyMap<string,BatchSelection>=new Map()
 private applicationSelections:ReadonlyMap<string,ReadonlyMap<string,BatchSelection>>=new Map()
 private operation:Operation|null=null
 private attempt:Attempt|null=null
 private error=''
 private active=false
 private lifetime=0
 private listeners=new Set<()=>void>()
 private view:ReturnType<BatchWorkflow['readView']>
 constructor(private adapter:BatchAdapter){
  try{const id=adapter.storage.load();if(id)this.attempt={id,flow:null}}catch{this.error='无法读取原批量设置身份，请检查会话存储。'}
  this.view=this.readView()
 }
 getSnapshot=()=>this.view
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(){this.view=this.readView();for(const listener of this.listeners)listener()}
 private readView(){
  const {state,sending,pending}=this.context,activity=this.operation?.kind??null
  const busy=!state||state.busy||sending||pending
  const quitting=!!(state?.quit?.prompt||state?.quit?.exiting||state?.quit?.restarting)
  const executing=['running','waiting'].includes(state?.batch?.state??'')
  const blocked=!!this.attempt||!!activity
  const review=this.active&&!busy&&!quitting&&!executing&&!blocked
  const close=this.active&&!this.attempt&&activity!=='stopping'
  const filePanel=this.panel.kind==='files'?this.panel:null
  const flow=this.panel.kind==='choose'||this.panel.kind==='preview'?this.panel.flow:null
  return {
   panel:this.panel,selected:this.selected,applicationSelections:this.applicationSelections,error:this.error,activity,activityLabel:activity?activityLabels[activity]:'',
   pending:this.attempt?.id??'',batch:state?.batch??null,recovery:state?.recovery??null,
   submissionBlocked:blocked,
   can:{
    select:this.active&&!busy&&!state?.batchBlocked&&!blocked&&!state?.quit?.exiting&&!state?.quit?.restarting&&!(state?.quit?.prompt&&state.quit.intent==='update')&&!!state?.writableKinds?.includes('file')&&['closed','selected'].includes(this.panel.kind),
    review,close,showResults:close&&!!state?.batch,
    chooseFiles:review&&!!state?.writableKinds?.includes('file')&&!!filePanel?.draft.groups.some(group=>!filePanel.draft.excluded.has(group.entry.id)),
    editFiles:this.active&&!!filePanel&&!blocked,
    chooseApp:review&&this.panel.kind==='choose',
    prepareApplication:review&&this.panel.kind==='application'&&!!state?.writableKinds?.includes('file'),
    returnToFiles:close&&flow?.source==='files',changeApp:close&&this.panel.kind==='preview'&&flow?.source!=='application',
    start:review&&this.panel.kind==='preview'&&!!this.panel.preview.items?.some(item=>item.status==='queued'),
    stop:this.active&&!blocked&&['running','waiting','paused'].includes(state?.batch?.state??''),
    reconcile:this.active&&!!this.attempt&&!activity,
   },
  } as const
 }
 connect(){
  if(this.active)return
  this.active=true;++this.lifetime;this.publish()
  if(this.attempt)void this.reconcile()
 }
 disconnect(){
  this.active=false;++this.lifetime;this.operation=null
  this.publish()
 }
 updateContext=(context:BatchContext)=>{
  const state=this.context.state
  this.context={...context,state:state&&(!context.state||context.state.version<state.version)?state:context.state}
  this.acceptEvidence();this.publish()
 }
 private acceptSnapshot(snapshot:Snapshot){
  if(!this.context.state||snapshot.version>this.context.state.version)this.context={...this.context,state:snapshot}
  this.adapter.accept(snapshot)
  this.acceptEvidence()
 }
 private acceptEvidence(){
  if(this.active&&this.attempt&&this.context.state?.batch?.commands?.includes(this.attempt.id))this.finishAccepted(this.attempt)
 }
 private begin(kind:Activity){const operation={kind};this.operation=operation;this.error='';this.publish();return operation}
 private current(operation:Operation){return this.active&&this.operation===operation}
 private finish(operation:Operation){if(this.current(operation)){this.operation=null;this.publish()}}
 private navigate(panel:BatchPanel){this.operation=null;this.panel=panel;this.error='';this.publish()}
 close=()=>{if(this.view.can.close)this.navigate({kind:'closed'})}
 showSelected=(app?:AppCopy)=>{if(this.view.can.close&&this.selection(app?.path).size)this.navigate({kind:'selected',app})}
 showResults=()=>{if(this.view.can.showResults)this.navigate({kind:'results'})}
 private selection(path=''){return path?this.applicationSelections.get(path)??emptySelection:this.selected}
 private setSelection(path:string,selected:ReadonlyMap<string,BatchSelection>){
  if(!path){this.selected=selected;return}
  const applications=new Map(this.applicationSelections)
  if(selected.size)applications.set(path,selected);else applications.delete(path)
  this.applicationSelections=applications
 }
 toggle=(entry:Entry,path='')=>{
  if(!this.view.can.select||!eligible(entry))return
  const selected=new Map(this.selection(path))
  if(selected.has(entry.id))selected.delete(entry.id);else selected.set(entry.id,selectionOf(entry))
  this.setSelection(path,selected);this.publish()
 }
 toggleVisible=(entries:Entry[],path='')=>{
  if(!this.view.can.select)return
  const items=entries.filter(eligible),selected=new Map(this.selection(path)),all=items.every(entry=>selected.has(entry.id))
  for(const entry of items){if(all)selected.delete(entry.id);else selected.set(entry.id,selectionOf(entry))}
  this.setSelection(path,selected);this.publish()
 }
 removeSelected=(id:string,path='')=>{if(this.view.can.select){const selected=new Map(this.selection(path));selected.delete(id);this.setSelection(path,selected);this.publish()}}
 clearSelection=(path='')=>{if(this.view.can.select){this.setSelection(path,emptySelection);this.publish()}}
 choose=()=>{
  if(this.view.can.select&&this.selected.size)this.navigate({kind:'choose',flow:{source:'selection',resumeID:'',items:Array.from(this.selected.values())}})
 }
 chooseApplication=async(app:AppCopy)=>{
  if(!this.view.can.select||!app.path||app.metadataError||!this.selection(app.path).size)return
  this.navigate({kind:'application',flow:{source:'application',resumeID:'',app:{...app},items:Array.from(this.selection(app.path).values())}})
  await this.retryApplication()
 }
 retryApplication=async()=>{
  if(!this.view.can.prepareApplication||this.panel.kind!=='application')return
  await this.prepareFlow(this.panel.flow,this.panel.flow.app)
 }
 chooseFiles=()=>{
  if(!this.view.can.chooseFiles||this.panel.kind!=='files')return
  const draft=this.panel.draft,items=draft.groups.filter(group=>!draft.excluded.has(group.entry.id)).map(group=>selectionOf(group.entry))
  this.navigate({kind:'choose',flow:{source:'files',resumeID:'',items,draft}})
 }
 returnToFiles=()=>{
  if(!this.view.can.returnToFiles||(this.panel.kind!=='choose'&&this.panel.kind!=='preview')||this.panel.flow.source!=='files')return
  this.navigate({kind:'files',draft:this.panel.flow.draft})
 }
 changeApp=()=>{if(this.view.can.changeApp&&this.panel.kind==='preview'&&this.panel.flow.source!=='application')this.navigate({kind:'choose',flow:this.panel.flow})}
 private dropReason(otherDialog:boolean){
  const {state,sending,pending}=this.context
  if(!this.active||!state)return '正在读取设置状态，请稍后再拖入。'
  if(state.busy||sending||pending||this.attempt||['running','waiting'].includes(state.batch?.state??''))return '请先处理当前设置，再拖入文件；本次文件未加入队列。'
  if(state.quit?.prompt||state.quit?.exiting||state.quit?.restarting)return '请先处理当前退出或重启操作。'
  if(this.operation)return `${activityLabels[this.operation.kind]}，请完成后再拖入文件。`
  if(!['closed','files'].includes(this.panel.kind)||otherDialog)return '请先关闭当前面板，或返回识别清单后再拖入文件。'
  return ''
 }
 receiveFiles=async(paths:unknown,otherDialog=false):Promise<string>=>{
  const reason=this.dropReason(otherDialog)
  if(reason)return reason
  if(!Array.isArray(paths)||!paths.length||!paths.every(path=>typeof path==='string'))return '只支持拖入本机普通文件。'
  const draft=this.panel.kind==='files'?this.panel.draft:fileDraft()
  this.panel={kind:'files',draft}
  const operation=this.begin('identifying')
  try{
   const result=await this.adapter.identify(paths)
   if(!this.current(operation))return ''
   const files=new Map(draft.files.map(file=>[file.path,file]))
   for(const file of result??[]){
    if(files.has(file.path)&&!files.get(file.path)?.error)continue
    const matches=(file.entries??[]).filter(eligible)
    files.set(file.path,{...file,choice:matches.length===1?matches[0].id:''})
   }
   this.panel={kind:'files',draft:fileDraft(Array.from(files.values()),draft.excluded,draft.saved)}
  }catch(error){if(this.current(operation))this.error=`文件识别失败：${message(error)}。请重新拖入。`}
  finally{this.finish(operation)}
  return ''
 }
 chooseFileType=(path:string,choice:string)=>{
  if(!this.view.can.editFiles||this.panel.kind!=='files')return
  const draft=this.panel.draft,file=draft.files.find(file=>file.path===path)
  if(!file?.entries?.some(entry=>eligible(entry)&&entry.id===choice))return
  this.panel={kind:'files',draft:fileDraft(draft.files.map(file=>file.path===path?{...file,choice}:file),draft.excluded,draft.saved)};this.publish()
 }
 toggleFileType=(id:string)=>{
  if(!this.view.can.editFiles||this.panel.kind!=='files')return
  const draft=this.panel.draft
  if(!draft.groups.some(group=>group.entry.id===id))return
  const excluded=new Set(draft.excluded)
  if(excluded.has(id))excluded.delete(id);else excluded.add(id)
  this.panel={kind:'files',draft:fileDraft(draft.files,excluded,draft.saved)};this.publish()
 }
 saveFileType=async(id:string)=>{
  if(!this.view.can.editFiles||this.panel.kind!=='files')return
  const draft=this.panel.draft,entry=draft.groups.find(group=>group.entry.id===id)?.entry
  if(!entry||draft.saved[id]==='已保存手动关联')return
  const operation=this.begin('saving')
  let status=''
  try{const result=await this.adapter.saveType(entry.association.key);status=result.saved?'已保存手动关联':'未保存，可继续设置'}
  catch(error){status=`保存失败：${message(error)}。可继续设置。`}
  if(this.current(operation))this.panel={kind:'files',draft:fileDraft(draft.files,draft.excluded,{...draft.saved,[id]:status})}
  this.finish(operation)
 }
 pickApplication=async()=>{
  if(!this.view.can.chooseApp)return
  const operation=this.begin('picking')
  try{
   const result=await this.adapter.pickApplication()
   if(!this.current(operation))return
   this.finish(operation)
   if(!result.cancelled&&result.app)await this.prepare(result.app)
  }catch(error){if(this.current(operation))this.error=message(error)}
  finally{this.finish(operation)}
 }
 prepare=async(app:AppCopy)=>{
  if(!this.view.can.chooseApp||this.panel.kind!=='choose')return
  await this.prepareFlow(this.panel.flow,app)
 }
 private async prepareFlow(flow:Flow,app:AppCopy){
  const operation=this.begin('preparing')
  try{
   const preview=await this.adapter.prepare(flow.items,app.path,flow.resumeID)
   if(this.current(operation))this.panel={kind:'preview',flow,preview}
  }catch(error){if(this.current(operation))this.error=message(error)}
  finally{this.finish(operation)}
 }
 resume=async(mode:'remaining'|'problems')=>{
  const batch=this.context.state?.batch
  if(!batch||!this.view.can.review||this.panel.kind!=='results')return
  const items=(batch.items??[]).filter(item=>mode==='remaining'?item.status==='queued':problem(item.status)).map(item=>item.selection)
  if(!items.length)return
  this.navigate({kind:'choose',flow:{items,resumeID:batch.id,source:'resume'}})
  await this.prepare(batch.target)
 }
 private forget(){
  try{this.adapter.storage.clear();this.attempt=null;return true}
  catch(error){this.operation=null;this.error=`无法清除原批量设置身份：${message(error)}；请重试核对。`;this.publish();return false}
 }
 private finishAccepted(attempt:Attempt){
  if(!this.forget())return
  if(attempt.flow?.source==='selection'||attempt.flow?.source==='application'){
   const path=attempt.flow.source==='application'?attempt.flow.app.path:''
   const selected=new Map(this.selection(path))
   for(const item of attempt.flow.items)selected.delete(`${item.association.kind}:${item.association.key}`)
   this.setSelection(path,selected)
  }
  this.navigate({kind:'results'})
 }
 private acceptResult(result:BatchResult,attempt:Attempt){
  this.acceptSnapshot(result.snapshot)
  // Matching snapshot evidence already decided admission, including a possible
  // cleanup error. Do not repeat that transition for the response's outcome.
  if(this.attempt!==attempt||this.context.state?.batch?.commands?.includes(attempt.id))return
  if(result.outcome==='accepted'||result.outcome==='existing'){this.finishAccepted(attempt);return}
  if(!this.forget())return
  this.navigate(this.context.state?.batch?{kind:'results'}:attempt.flow?.source==='application'?{kind:'application',flow:attempt.flow}:attempt.flow?{kind:'choose',flow:attempt.flow}:{kind:'closed'})
  this.error=result.message;this.publish()
 }
 start=async(replace:boolean,recoveryRequestID:string)=>{
  if(!this.view.can.start||this.panel.kind!=='preview')return
  const {preview,flow}=this.panel,old=this.context.state?.recovery
  if((preview.replaceBatchID&&!replace)||(old&&(!old.ready||old.record.requestID!==recoveryRequestID)))return
  try{this.adapter.storage.save(preview.id)}catch(error){this.error=`无法保存原提交身份：${message(error)}`;this.publish();return}
  const attempt={id:preview.id,flow},lifetime=this.lifetime
  this.attempt=attempt
  const operation=this.begin('starting')
  try{
   const result=await this.adapter.start(preview.id,replace?preview.replaceBatchID:'',old?recoveryRequestID:'')
   if(this.active&&lifetime===this.lifetime)this.acceptResult(result,attempt)
  }catch(error){
   if(this.current(operation)&&this.attempt===attempt){
    this.operation=null;this.error=`提交应答中断，正在核对原批次：${message(error)}`;this.publish()
    await this.reconcile()
   }
  }finally{this.finish(operation)}
 }
 reconcile=async()=>{
  if(!this.view.can.reconcile||!this.attempt)return
  const attempt=this.attempt,lifetime=this.lifetime,operation=this.begin('reconciling')
  try{
   const result=await this.adapter.reconcile(attempt.id)
   if(this.active&&lifetime===this.lifetime)this.acceptResult(result,attempt)
  }catch(error){if(this.current(operation))this.error=`无法核对原批量设置：${message(error)}`}
  finally{this.finish(operation)}
 }
 stop=async()=>{
  if(!this.view.can.stop||!this.context.state?.batch)return
  const operation=this.begin('stopping')
  try{
   const result=await this.adapter.stop(this.context.state.batch.id)
   if(this.current(operation)){this.acceptSnapshot(result.snapshot);if(result.outcome!=='stopped')this.error=result.message}
  }catch(error){if(this.current(operation))this.error=`停止指令尚未确认，请重试：${message(error)}`}
  finally{this.finish(operation)}
 }
 retryCurrent=async()=>{
  const state=this.context.state,association=state?.recovery?.record.association??state?.batch?.items?.find(item=>item.status==='waiting')?.selection.association
  if(this.active&&association)await this.adapter.retry(association)
 }
 // Stable user actions are the public interface; lifecycle and adapter wiring
 // remain in the React binding, not in individual displays.
 readonly actions={chooseApplication:this.chooseApplication,retryApplication:this.retryApplication,close:this.close,showSelected:this.showSelected,showResults:this.showResults,toggle:this.toggle,toggleVisible:this.toggleVisible,removeSelected:this.removeSelected,clearSelection:this.clearSelection,choose:this.choose,chooseFiles:this.chooseFiles,returnToFiles:this.returnToFiles,changeApp:this.changeApp,receiveFiles:this.receiveFiles,chooseFileType:this.chooseFileType,toggleFileType:this.toggleFileType,saveFileType:this.saveFileType,pickApplication:this.pickApplication,prepare:this.prepare,resume:this.resume,start:this.start,reconcile:this.reconcile,stop:this.stop,retryCurrent:this.retryCurrent} as const
}
