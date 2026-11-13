import { Item } from '@astryxdesign/core/Item'
import { Table } from '@astryxdesign/core/Table'
import { TextInput } from '@astryxdesign/core/TextInput'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {AppCopy} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {BatchItem,BatchPreview,BatchResult,BatchSelection} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import {PrepareBatch,ReconcileBatchStart,StartBatch,StopBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {PickApplication} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type {Changes} from './Changes'
import {Dialog} from './Dialog'
import {ApplicationIcon} from './ApplicationIcon'
import {message} from './errors'
import {useQueryObservations} from './QueryObservations'

const pendingKey='defaultapps.batch-start.v1'
const keyOf=(item:BatchSelection)=>`${item.association.kind}:${item.association.key}`
const selectionOf=(entry:Entry):BatchSelection=>({association:entry.association,name:entry.name||entry.association.key,extensions:entry.extensions??[]})
function savedStart(){try{return sessionStorage.getItem(pendingKey)||''}catch{return ''}}
export const batchItemLabel=(status:string)=>({queued:'未执行',waiting:'结果未定',unknown:'结果未定',confirmed:'已确认修改',unchanged:'已是目标',failed:'失败',changed:'需重新确认',unavailable:'本次不执行'}[status]??status)
const stateLabel=(state:string)=>({running:'正在设置',waiting:'等待当前项结果',paused:'后续设置已暂停',stopped:'后续设置已停止',completed:'本轮处理结束',recovered:'已恢复最近一批'}[state]??state)
type Workflow={items:BatchSelection[];resumeID:string;source?:'files'|'selection'|'resume'}

export function useBatchSettings(changes:Changes){
 const [selected,setSelected]=useState<Map<string,BatchSelection>>(()=>new Map())
 const [modal,setModal]=useState<'selected'|'choose'|'preview'|'results'|'files'|null>(null)
 const [workflow,setWorkflow]=useState<Workflow>({items:[],resumeID:''})
 const [preview,setPreview]=useState<BatchPreview|null>(null)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [pending,setPending]=useState(savedStart)
 const pendingRef=useRef(pending),workingRef=useRef(false),reconciling=useRef(false),generation=useRef(0),mounted=useRef(true)
 const latest=useRef(changes);latest.current=changes
 const workflowRef=useRef(workflow);workflowRef.current=workflow
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current}},[])
 const forget=useCallback(()=>{sessionStorage.removeItem(pendingKey);pendingRef.current='';setPending('')},[])
 const acceptResult=useCallback((result:BatchResult)=>{
  latest.current.accept(result.snapshot)
  if(result.outcome==='accepted'||result.outcome==='existing'){
   forget();if(!workflowRef.current.source||workflowRef.current.source==='selection')setSelected(new Map());setPreview(null);setModal('results');setError('')
  }else{
   forget();setError(result.message);setPreview(null)
   setModal(result.snapshot.batch?'results':'choose')
  }
 },[forget])
 const reconcile=useCallback(async()=>{
  const id=pendingRef.current
  if(!id||reconciling.current)return
  reconciling.current=true
  try{const result=await ReconcileBatchStart(id);if(mounted.current&&pendingRef.current===id)acceptResult(result)}
  catch(error){if(mounted.current)setError(`无法核对原批量设置：${message(error)}`)}
  finally{reconciling.current=false}
 },[acceptResult])
 useEffect(()=>{if(pending&&!working)void reconcile()},[pending,working,reconcile])
 const state=changes.state
 const selectionBlocked=!state||!state.writableKinds?.includes('file')||changes.blocked||working||!!pending
 const reviewBlocked=!state||state.busy||changes.sending||!!changes.pending||!!pending||working||state.batch?.state==='running'||state.batch?.state==='waiting'||!!state.quit?.exiting||!!state.quit?.restarting||!!state.quit?.prompt
 const toggle=(entry:Entry)=>{
  if(selectionBlocked||!entry.resolved||entry.association.kind!=='file')return
  setSelected(previous=>{const next=new Map(previous);if(next.has(entry.id))next.delete(entry.id);else next.set(entry.id,selectionOf(entry));return next})
 }
 const toggleVisible=(entries:Entry[])=>{
  if(selectionBlocked)return
  const eligible=entries.filter(entry=>entry.resolved&&entry.association.kind==='file')
  setSelected(previous=>{const next=new Map(previous),all=eligible.every(entry=>next.has(entry.id));for(const entry of eligible){if(all)next.delete(entry.id);else next.set(entry.id,selectionOf(entry))}return next})
 }
 const close=()=>{if(workingRef.current||pendingRef.current)return;++generation.current;setModal(null);setError('')}
 const choose=()=>{if(selectionBlocked||!selected.size)return;setWorkflow({items:Array.from(selected.values()),resumeID:'',source:'selection'});setPreview(null);setError('');setModal('choose')}
 const chooseFiles=(entries:Entry[])=>{
  if(reviewBlocked||!state?.writableKinds?.includes('file')||!entries.length)return
  setWorkflow({items:entries.map(selectionOf),resumeID:'',source:'files'});setPreview(null);setError('');setModal('choose')
 }
 const returnToFiles=()=>{if(workingRef.current||pendingRef.current)return;++generation.current;setPreview(null);setError('');setModal('files')}
 const prepare=async(app:AppCopy,flow=workflow)=>{
  if(workingRef.current)return
  const version=++generation.current
  workingRef.current=true;setWorking(true);setError('')
  try{const result=await PrepareBatch(flow.items,app.path,flow.resumeID);if(mounted.current&&version===generation.current){setPreview(result);setModal('preview')}}
  catch(error){if(mounted.current&&version===generation.current){setError(message(error));setModal('choose')}}
  finally{workingRef.current=false;if(mounted.current)setWorking(false)}
 }
 const resume=(mode:'remaining'|'problems')=>{
  const batch=state?.batch;if(!batch||reviewBlocked)return
  const items=(batch.items??[]).filter(item=>mode==='remaining'?item.status==='queued':['failed','changed','unavailable','unknown'].includes(item.status)).map(item=>item.selection)
  if(!items.length)return
  const flow:Workflow={items,resumeID:batch.id,source:'resume'};setWorkflow(flow);setPreview(null);setModal('choose');void prepare(batch.target,flow)
 }
 const start=async(replace:boolean,recovery:boolean)=>{
  if(!preview||workingRef.current||pendingRef.current)return
  try{sessionStorage.setItem(pendingKey,preview.id)}catch(error){setError(`无法保存原提交身份：${message(error)}`);return}
  pendingRef.current=preview.id;setPending(preview.id);workingRef.current=true;setWorking(true);setError('')
  try{const result=await StartBatch(preview.id,replace?preview.replaceBatchID:'',recovery?latest.current.state?.recovery?.record.requestID??'':'');if(mounted.current)acceptResult(result)}
  catch(error){if(mounted.current)setError(`提交应答中断，正在核对原批次：${message(error)}`)}
  finally{workingRef.current=false;if(mounted.current)setWorking(false)}
 }
 const stop=async()=>{
  if(!state?.batch||workingRef.current)return
  workingRef.current=true;setWorking(true);setError('')
  try{const result=await StopBatch(state.batch.id);if(mounted.current){changes.accept(result.snapshot);if(result.outcome!=='stopped')setError(result.message)}}
  catch(error){if(mounted.current)setError(`停止指令尚未确认，请重试：${message(error)}`)}
  finally{workingRef.current=false;if(mounted.current)setWorking(false)}
 }
 return {changes,selected,setSelected,modal,setModal,workflow,preview,working,error,setError,pending,reconcile,selectionBlocked,reviewBlocked,toggle,toggleVisible,close,choose,chooseFiles,returnToFiles,prepare,resume,start,stop}
}
export type BatchController=ReturnType<typeof useBatchSettings>

export function BatchCheckbox({checked,partial=false,disabled,label,onChange}:{checked:boolean;partial?:boolean;disabled:boolean;label:string;onChange:()=>void}){
 return <CheckboxInput className="batch-checkbox" label={label} isLabelHidden value={partial?'indeterminate':checked} isDisabled={disabled} onChange={onChange} onKeyDown={event=>event.stopPropagation()} size="sm"/>
}

export function BatchBars({controller:c,showSelection}:{controller:BatchController;showSelection:boolean}){
 const b=c.changes.state?.batch,items=b?.items??[]
 const current=items.find(item=>item.status==='waiting')
 const done=items.filter(item=>!['queued','waiting','unknown'].includes(item.status)).length
 return <>
  {b?<section className="batch-progress" aria-label="批量设置进度">
   <HStack gap={2} align="center" className="batch-progress-copy"><strong>{stateLabel(b.state)}</strong><Text>已处理 {done} / {items.length} 项 · {b.target.name||b.target.path}</Text>{current?<Text className="batch-current">当前：{current.selection.name||current.selection.association.key}</Text>:null}</HStack>
   <HStack gap={2} align="center" className="batch-actions"><Button label="查看批次" variant="secondary" onClick={()=>{c.setError('');c.setModal('results')}}/>{['running','waiting','paused'].includes(b.state)?<Button label="停止后续设置" variant="secondary" isDisabled={c.working} onClick={()=>void c.stop()}/>:null}</HStack>
  </section>:null}
  {showSelection&&c.selected.size>0?<section className="batch-selection-bar" aria-label="已选文件类型"><strong>已选 {c.selected.size} 个类型</strong><Text>选择一个应用，统一设置默认</Text><HStack gap={2} align="center" className="batch-actions"><Button label="查看已选" variant="secondary" onClick={()=>c.setModal('selected')}/><Button label="清空" variant="secondary" isDisabled={c.selectionBlocked} onClick={()=>c.setSelected(new Map())}/><Button label="选择应用…" variant="primary" isDisabled={c.selectionBlocked} onClick={c.choose}/></HStack></section>:null}
  {c.error&&!c.modal?<p className="batch-inline-error" role="alert">{c.error}</p>:null}
  {c.pending?<HStack gap={2} align="center" className="batch-reconcile" role="status">正在核对原批量设置，核对完成前暂停新修改。<Button label="核对批量设置" variant="secondary" isDisabled={c.working} onClick={()=>void c.reconcile()}/></HStack>:null}
 </>
}

function BatchAppPicker({items,apps,disabled,onSelect,onError}:{items:BatchSelection[];apps:AppCopy[];disabled:boolean;onSelect:(app:AppCopy)=>void;onError:(error:string)=>void}){
 const [query,setQuery]=useState(''),[picking,setPicking]=useState(false)
 const observations=useQueryObservations(items.map(item=>item.association))
 const {candidates,unknown,previous}=useMemo(()=>{
  const copies=new Map(apps.filter(app=>!!app.path&&!app.metadataError).map(app=>[app.path,{app,coverage:0}]))
  let unknown=0,previous=0
  for(const item of items){
   const id=keyOf(item),result=observations.observations[id]
   if(!result?.candidates.known){unknown++;continue}
   if(observations.rowErrors[id]||result.candidates.error||result.candidates.stale)previous++
   const seen=new Set<string>()
   for(const app of result.candidates.apps??[]){if(seen.has(app.path)||app.metadataError)continue;seen.add(app.path);const existing=copies.get(app.path);copies.set(app.path,{app,coverage:(existing?.coverage??0)+1})}
  }
  const candidates=Array.from(copies.values()).sort((a,b)=>b.coverage-a.coverage||a.app.name.localeCompare(b.app.name)||a.app.path.localeCompare(b.app.path))
  return {candidates,unknown,previous}
 },[apps,items,observations.observations,observations.rowErrors])
 // Freeze the initial coverage ranking for this opening. Later observations may
 // change counts or add copies, but must not move a button beneath the pointer.
 const [order,setOrder]=useState<AppCopy[]|null>(null)
 const hasPrevious=items.length>0&&items.every(item=>observations.observations[keyOf(item)]?.candidates.known)
 useEffect(()=>{
  if(order===null){if(hasPrevious||observations.settled)setOrder(candidates.map(({app})=>app));return}
  const paths=new Set(order.map(app=>app.path))
  const added=candidates.filter(({app})=>!paths.has(app.path)).map(({app})=>app)
  if(added.length)setOrder([...order,...added])
 },[candidates,order,hasPrevious,observations.settled])
 const byPath=new Map(candidates.map(value=>[value.app.path,value]))
 const ranked=order===null
  ? (hasPrevious||observations.settled?candidates:[...candidates].sort((a,b)=>a.app.name.localeCompare(b.app.name)||a.app.path.localeCompare(b.app.path)))
  : [...order.map(app=>byPath.get(app.path)??{app,coverage:0}),...candidates.filter(({app})=>!order.some(copy=>copy.path===app.path))]
 const needle=query.trim().toLocaleLowerCase()
 const visible=ranked.filter(({app})=>[app.name,app.path,app.version,app.bundleID].some(value=>value?.toLocaleLowerCase().includes(needle)))
 const pick=async()=>{setPicking(true);try{const result=await PickApplication();if(!result.cancelled&&result.app)onSelect(result.app)}catch(error){onError(message(error))}finally{setPicking(false)}}
 return <>
  <p>为 {items.length} 个文件类型选择同一个默认应用。系统候选覆盖全部类型的应用优先显示。</p>
  <TextInput containerClassName="batch-search" label="搜索应用" type="search" value={query} onChange={setQuery} placeholder="名称、版本或路径" autoComplete="off"/>
  {observations.refreshing?<Text as="p" type="supporting" role="status">{hasPrevious?'正在刷新系统候选，暂显示上次查询结果…':'正在查询系统候选…'}</Text>:null}
  {previous?<Text as="p" type="supporting" role="status">{previous} 项刷新失败，保留上次查询结果；预览前将重新检查。</Text>:null}
  {unknown?<Text as="p" type="supporting">{unknown} 项候选尚未查明，覆盖数量仅包含已知项目。</Text>:null}
  <VStack gap={0} className="batch-app-list" aria-label="批量目标应用">{visible.map(({app,coverage})=><Item as="button" role="button" className="batch-app-option" key={app.path} isDisabled={disabled||picking} onClick={()=>onSelect(app)} aria-label={`选择 ${app.name} ${app.path}`} startContent={<ApplicationIcon app={app} className="application-icon--row"/>} label={app.name||app.path} description={`版本 ${app.version||'未知'} · ${app.path}`} endContent={<Text type="supporting" className="batch-coverage">{`${previous?'上次查询覆盖 · ':''}${coverage} / ${items.length} 项系统候选${unknown?' · 部分未知':''}`}</Text>}/>)}</VStack>
  {!visible.length?<p>没有匹配的应用，可调整搜索或选择其他应用。</p>:null}
  <HStack gap={2} align="center" className="batch-dialog-actions"><Button label={picking?'正在选择…':'选择其他应用…'} variant="secondary" isDisabled={disabled||picking} onClick={()=>void pick()}/><Text className="batch-muted">属于系统候选不保证本次设置一定成功。</Text></HStack>
 </>
}

function ItemTable({items,preview=false}:{items:BatchItem[];preview?:boolean}){
 return <Table className="batch-table" aria-label={preview?'批量设置预览':'批量设置结果'} data={items.map(item=>({...item,id:keyOf(item.selection)}))} idKey="id" density="compact" dividers="rows" verticalAlign="top" textOverflow="wrap" columns={[
  {key:'selection',header:'文件类型',renderCell:item=><VStack gap={1}><Text weight="semibold">{item.selection.name||item.selection.association.key}</Text><Text type="supporting">{(item.selection.extensions??[]).map(ext=>`.${ext}`).join(' · ')}</Text><Text type="supporting">{item.selection.association.key}</Text></VStack>},
  {key:'observed',header:preview?'当前默认':'最近观察',renderCell:item=><VStack gap={1}>{item.observed?<><Text>{item.observed.name||item.observed.path}</Text><Text type="supporting">{item.observed.path}</Text></>:<Text>{item.expected.known?'无默认应用':'尚无有效观察'}</Text>}</VStack>},
  {key:'status',header:preview?'本次操作':'处理结果',renderCell:item=><VStack gap={1}><Text className="batch-item-status" data-status={item.status}>{preview&&item.status==='queued'?'将设置':batchItemLabel(item.status)}</Text>{item.message?<Text type="supporting">{item.message}</Text>:null}{item.previousUnknown?<Text type="supporting">之前的请求仍可能完成。</Text>:null}</VStack>},
 ]}/>

}

function PreviewDialog({controller:c}:{controller:BatchController}){
 const p=c.preview!,recovery=c.changes.state?.recovery
 const [replace,setReplace]=useState(false),[acknowledge,setAcknowledge]=useState(false)
 const count=(p.items??[]).filter(item=>item.status==='queued').length
 const blocked=c.working||!!c.pending||!count||!!c.changes.state?.busy||!!c.changes.state?.quit?.prompt||!!c.changes.state?.quit?.exiting||!!c.changes.state?.quit?.restarting||(!!p.replaceBatchID&&!replace)||(!!recovery&&(!recovery.ready||!acknowledge))
 return <Dialog title="预览批量设置" subtitle={`将 ${count} 个文件类型设为 ${p.target.name||p.target.path}`} onClose={c.close}>
  <HStack gap={2} align="center" className="batch-target"><strong>共同目标：{p.target.name||'所选应用'}</strong><Text>{p.target.path}</Text><Button label="更换应用" variant="secondary" isDisabled={c.working||!!c.pending} onClick={()=>{c.setModal('choose');c.setError('')}}/></HStack>
  <ItemTable items={p.items??[]} preview/>
  {c.workflow.source==='files'?<p className="batch-muted">设置将影响这些类型的所有同类文件。</p>:null}
  <p className="batch-muted">按此顺序逐项设置。系统可能逐项确认；明确失败会记录并继续，结果未定时等待。</p>
  {p.replaceBatchID?<CheckboxInput className="batch-confirm" label="放弃旧批次的后续设置，以这份清单开始新批次并替换最近批次记录。" value={replace} onChange={setReplace} isDisabled={c.working}/>:null}
  {recovery?<VStack gap={0} className="batch-recovery"><p>上次修改仍可能完成。旧目标：{recovery.record.target.path}</p>{!recovery.ready?<Button label="查询旧请求的当前默认" variant="secondary" onClick={()=>void c.changes.retry(recovery.record.association)}/>:null}<CheckboxInput className="batch-confirm" label="已了解旧请求仍可能改变当前默认，明确开始新的修改。" value={acknowledge} onChange={setAcknowledge} isDisabled={!recovery.ready||c.working}/></VStack>:null}
  {c.error?<p role="alert" className="batch-error">{c.error}</p>:null}
  <HStack gap={2} align="center" className="batch-dialog-actions">{c.workflow.source==='files'?<Button label="返回识别清单" variant="secondary" isDisabled={c.working||!!c.pending} onClick={c.returnToFiles}/>:null}<Button label="暂不设置" variant="secondary" isDisabled={c.working||!!c.pending} onClick={c.close}/><Button label={c.working?'正在受理…':`开始设置 ${count} 项`} variant="primary" isDisabled={blocked} onClick={()=>void c.start(replace,acknowledge)}/></HStack>
 </Dialog>
}

export function BatchDialogs({controller:c,apps}:{controller:BatchController;apps:AppCopy[]}){
 if(c.modal==='preview'&&c.preview)return <PreviewDialog key={c.preview.id} controller={c}/>
 if(c.modal==='choose')return <Dialog title="为所选类型选择应用" onClose={c.close}><BatchAppPicker items={c.workflow.items} apps={apps} disabled={c.working||!!c.pending} onSelect={app=>void c.prepare(app)} onError={c.setError}/>{c.working?<p role="status">正在检查当前默认并准备预览…</p>:null}{c.error?<p role="alert" className="batch-error">{c.error}</p>:null}{c.workflow.source==='files'?<HStack gap={2} align="center" className="batch-dialog-actions"><Button label="返回识别清单" variant="secondary" isDisabled={c.working||!!c.pending} onClick={c.returnToFiles}/></HStack>:null}</Dialog>
 if(c.modal==='selected')return <Dialog title="已选文件类型" subtitle={`${c.selected.size} 个类型，搜索隐藏的已选项也会保留`} onClose={c.close}>
  <ul className="batch-selected-list">{Array.from(c.selected.entries()).map(([id,item])=><li key={id}><VStack gap={0}><strong>{item.name}</strong><small>{item.association.key}</small></VStack><Button label={`移除 ${item.name}`} variant="secondary" isDisabled={c.selectionBlocked}  onClick={()=>c.setSelected(previous=>{const next=new Map(previous);next.delete(id);return next})}>移除</Button></li>)}</ul>
  <HStack gap={2} align="center" className="batch-dialog-actions"><Button label="选择应用…" variant="primary" isDisabled={c.selectionBlocked||!c.selected.size} onClick={c.choose}/></HStack>
 </Dialog>
 const b=c.changes.state?.batch
 if(c.modal==='results'&&b){
  const items=b.items??[],remaining=items.filter(item=>item.status==='queued').length,problems=items.filter(item=>['failed','changed','unavailable','unknown'].includes(item.status)).length
  const counts=items.reduce<Record<string,number>>((result,item)=>{const label=batchItemLabel(item.status);result[label]=(result[label]??0)+1;return result},{})
  const waiting=items.find(item=>item.status==='waiting')
  return <Dialog title="最近一次批量设置" subtitle={stateLabel(b.state)} onClose={c.close}>
   <HStack gap={2} align="center" className="batch-target"><strong>目标：{b.target.name||'所选应用'}</strong><Text>{b.target.path}</Text></HStack>
   <p className="batch-counts">{Object.entries(counts).map(([label,count])=><Text key={label}>{label} {count}</Text>)}</p>
   <ItemTable items={items}/>
   <p className="batch-muted">这里保留的是本批次的处理结果；继续或重试前会重新查询当前默认。</p>
   {b.error?<p className="batch-error" role="alert">{b.error}</p>:null}{c.error?<p className="batch-error" role="alert">{c.error}</p>:null}
   <HStack gap={2} align="center" className="batch-dialog-actions">{waiting?<Button label="重新查询当前项" variant="secondary" onClick={()=>void c.changes.retry(waiting.selection.association)}/>:null}{['running','waiting','paused'].includes(b.state)?<Button label="停止后续设置" variant="secondary" isDisabled={c.working} onClick={()=>void c.stop()}/>:null}{remaining?<Button label={`继续未执行的 ${remaining} 项…`} variant="primary" isDisabled={c.reviewBlocked} onClick={()=>c.resume('remaining')}>继续未执行的 {remaining} 项…</Button>:null}{problems?<Button label={`重新处理 ${problems} 个问题项…`} variant="secondary" isDisabled={c.reviewBlocked} onClick={()=>c.resume('problems')}>重新处理 {problems} 个问题项…</Button>:null}</HStack>
  </Dialog>
 }
 return null
}
