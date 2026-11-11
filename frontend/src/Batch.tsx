import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {AppCopy,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {BatchItem,BatchPreview,BatchResult,BatchSelection} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import {PrepareBatch,Query,ReconcileBatchStart,StartBatch,StopBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {PickApplication} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type {Changes} from './Changes'
import {Dialog} from './Dialog'
import {ApplicationIcon} from './ApplicationIcon'
import {message} from './errors'
import './batch.css'

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
 const ref=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(ref.current)ref.current.indeterminate=partial},[partial])
 return <input ref={ref} className="batch-checkbox" type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} onKeyDown={event=>event.stopPropagation()}/>
}

export function BatchBars({controller:c,showSelection}:{controller:BatchController;showSelection:boolean}){
 const b=c.changes.state?.batch,items=b?.items??[]
 const current=items.find(item=>item.status==='waiting')
 const done=items.filter(item=>!['queued','waiting','unknown'].includes(item.status)).length
 return <>
  {b?<section className="batch-progress" aria-label="批量设置进度">
   <div className="batch-progress-copy"><strong>{stateLabel(b.state)}</strong><span>已处理 {done} / {items.length} 项 · {b.target.name||b.target.path}</span>{current?<span className="batch-current">当前：{current.selection.name||current.selection.association.key}</span>:null}</div>
   <div className="batch-actions"><button className="btn" onClick={()=>{c.setError('');c.setModal('results')}}>查看批次</button>{['running','waiting','paused'].includes(b.state)?<button className="btn" disabled={c.working} onClick={()=>void c.stop()}>停止后续设置</button>:null}</div>
  </section>:null}
  {showSelection&&c.selected.size>0?<section className="batch-selection-bar" aria-label="已选文件类型"><strong>已选 {c.selected.size} 个类型</strong><span>选择一个应用，统一设置默认</span><div className="batch-actions"><button className="btn" onClick={()=>c.setModal('selected')}>查看已选</button><button className="btn" disabled={c.selectionBlocked} onClick={()=>c.setSelected(new Map())}>清空</button><button className="btn btn--primary" disabled={c.selectionBlocked} onClick={c.choose}>选择应用…</button></div></section>:null}
  {c.error&&!c.modal?<p className="batch-inline-error" role="alert">{c.error}</p>:null}
  {c.pending?<div className="batch-reconcile" role="status">正在核对原批量设置，核对完成前暂停新修改。<button className="btn" disabled={c.working} onClick={()=>void c.reconcile()}>核对批量设置</button></div>:null}
 </>
}

function BatchAppPicker({items,apps,disabled,onSelect,onError}:{items:BatchSelection[];apps:AppCopy[];disabled:boolean;onSelect:(app:AppCopy)=>void;onError:(error:string)=>void}){
 const [query,setQuery]=useState(''),[results,setResults]=useState<(QueryResult|null)[]|null>(null),[picking,setPicking]=useState(false)
 useEffect(()=>{
  let active=true,cursor=0
  const collected:(QueryResult|null)[]=new Array(items.length).fill(null)
  const worker=async()=>{while(active&&cursor<items.length){const index=cursor++;try{collected[index]=await Query(items[index].association)}catch{collected[index]=null}}}
  void Promise.all(Array.from({length:Math.min(4,items.length)},worker)).then(()=>{if(active)setResults(collected)})
  return()=>{active=false}
 },[items])
 const {candidates,unknown}=useMemo(()=>{
  const copies=new Map(apps.filter(app=>!!app.path&&!app.metadataError).map(app=>[app.path,{app,coverage:0}]))
  let unknown=0
  for(const result of results??new Array(items.length).fill(null)){
   if(!result||result.superseded||!result.candidates.known||result.candidates.error||result.candidates.stale){unknown++;continue}
   const seen=new Set<string>()
   for(const app of result.candidates.apps??[]){if(seen.has(app.path)||app.metadataError)continue;seen.add(app.path);const previous=copies.get(app.path);copies.set(app.path,{app,coverage:(previous?.coverage??0)+1})}
  }
  const candidates=Array.from(copies.values()).sort((a,b)=>b.coverage-a.coverage||a.app.name.localeCompare(b.app.name)||a.app.path.localeCompare(b.app.path))
  return {candidates,unknown}
 },[apps,results,items.length])
 const needle=query.trim().toLocaleLowerCase()
 const visible=candidates.filter(({app})=>[app.name,app.path,app.version,app.bundleID].some(value=>value?.toLocaleLowerCase().includes(needle)))
 const pick=async()=>{setPicking(true);try{const result=await PickApplication();if(!result.cancelled&&result.app)onSelect(result.app)}catch(error){onError(message(error))}finally{setPicking(false)}}
 return <>
  <p>为 {items.length} 个文件类型选择同一个默认应用。系统候选覆盖全部类型的应用优先显示。</p>
  <label className="batch-search">搜索应用<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="名称、版本或路径" autoComplete="off"/></label>
  {!results?<p className="batch-muted" role="status">正在查询系统候选…</p>:unknown?<p className="batch-muted">{unknown} 项候选尚未查明，覆盖数量仅包含查询成功的项目。</p>:null}
  <div className="batch-app-list" aria-label="批量目标应用">{visible.map(({app,coverage})=><button className="batch-app-option" key={app.path} disabled={disabled||picking} onClick={()=>onSelect(app)} aria-label={`选择 ${app.name} ${app.path}`}>
   <ApplicationIcon app={app} className="application-icon--row"/><span className="batch-app-copy"><strong>{app.name||app.path}</strong><span>版本 {app.version||'未知'} · {app.path}</span></span><span className="batch-coverage">{results?`${coverage} / ${items.length} 项系统候选${unknown?' · 部分未知':''}`:'覆盖查询中'}</span>
  </button>)}</div>
  {!visible.length?<p>没有匹配的应用，可调整搜索或选择其他应用。</p>:null}
  <div className="batch-dialog-actions"><button className="btn" disabled={disabled||picking} onClick={()=>void pick()}>{picking?'正在选择…':'选择其他应用…'}</button><span className="batch-muted">属于系统候选不保证本次设置一定成功。</span></div>
 </>
}

function ItemTable({items,preview=false}:{items:BatchItem[];preview?:boolean}){
 return <div className="batch-table-scroll"><table className="batch-table"><thead><tr><th>文件类型</th><th>{preview?'当前默认':'最近观察'}</th><th>{preview?'本次操作':'处理结果'}</th></tr></thead><tbody>{items.map(item=><tr key={keyOf(item.selection)}>
  <td><strong>{item.selection.name||item.selection.association.key}</strong><small>{(item.selection.extensions??[]).map(ext=>`.${ext}`).join(' · ')}</small><small>{item.selection.association.key}</small></td>
  <td>{item.observed?<><span>{item.observed.name||item.observed.path}</span><small>{item.observed.path}</small></>:<span>{item.expected.known?'无默认应用':'尚无有效观察'}</span>}</td>
  <td><span className="batch-item-status" data-status={item.status}>{preview&&item.status==='queued'?'将设置':batchItemLabel(item.status)}</span>{item.message?<small>{item.message}</small>:null}{item.previousUnknown?<small>之前的请求仍可能完成。</small>:null}</td>
 </tr>)}</tbody></table></div>
}

function PreviewDialog({controller:c}:{controller:BatchController}){
 const p=c.preview!,recovery=c.changes.state?.recovery
 const [replace,setReplace]=useState(false),[acknowledge,setAcknowledge]=useState(false)
 const count=(p.items??[]).filter(item=>item.status==='queued').length
 const blocked=c.working||!!c.pending||!count||!!c.changes.state?.busy||!!c.changes.state?.quit?.prompt||!!c.changes.state?.quit?.exiting||!!c.changes.state?.quit?.restarting||(!!p.replaceBatchID&&!replace)||(!!recovery&&(!recovery.ready||!acknowledge))
 return <Dialog title="预览批量设置" subtitle={`将 ${count} 个文件类型设为 ${p.target.name||p.target.path}`} onClose={c.close}>
  <div className="batch-target"><strong>共同目标：{p.target.name||'所选应用'}</strong><span>{p.target.path}</span><button className="btn" disabled={c.working||!!c.pending} onClick={()=>{c.setModal('choose');c.setError('')}}>更换应用</button></div>
  <ItemTable items={p.items??[]} preview/>
  {c.workflow.source==='files'?<p className="batch-muted">设置将影响这些类型的所有同类文件。</p>:null}
  <p className="batch-muted">按此顺序逐项设置。系统可能逐项确认；明确失败会记录并继续，结果未定时等待。</p>
  {p.replaceBatchID?<label className="batch-confirm"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)} disabled={c.working}/>放弃旧批次的后续设置，以这份清单开始新批次并替换最近批次记录。</label>:null}
  {recovery?<div className="batch-recovery"><p>上次修改仍可能完成。旧目标：{recovery.record.target.path}</p>{!recovery.ready?<button className="btn" onClick={()=>void c.changes.retry(recovery.record.association)}>查询旧请求的当前默认</button>:null}<label className="batch-confirm"><input type="checkbox" checked={acknowledge} onChange={event=>setAcknowledge(event.target.checked)} disabled={!recovery.ready||c.working}/>已了解旧请求仍可能改变当前默认，明确开始新的修改。</label></div>:null}
  {c.error?<p role="alert" className="batch-error">{c.error}</p>:null}
  <div className="batch-dialog-actions">{c.workflow.source==='files'?<button className="btn" disabled={c.working||!!c.pending} onClick={c.returnToFiles}>返回识别清单</button>:null}<button className="btn" disabled={c.working||!!c.pending} onClick={c.close}>暂不设置</button><button className="btn btn--primary" disabled={blocked} onClick={()=>void c.start(replace,acknowledge)}>{c.working?'正在受理…':`开始设置 ${count} 项`}</button></div>
 </Dialog>
}

export function BatchDialogs({controller:c,apps}:{controller:BatchController;apps:AppCopy[]}){
 if(c.modal==='preview'&&c.preview)return <PreviewDialog key={c.preview.id} controller={c}/>
 if(c.modal==='choose')return <Dialog title="为所选类型选择应用" onClose={c.close}><BatchAppPicker items={c.workflow.items} apps={apps} disabled={c.working||!!c.pending} onSelect={app=>void c.prepare(app)} onError={c.setError}/>{c.working?<p role="status">正在检查当前默认并准备预览…</p>:null}{c.error?<p role="alert" className="batch-error">{c.error}</p>:null}{c.workflow.source==='files'?<div className="batch-dialog-actions"><button className="btn" disabled={c.working||!!c.pending} onClick={c.returnToFiles}>返回识别清单</button></div>:null}</Dialog>
 if(c.modal==='selected')return <Dialog title="已选文件类型" subtitle={`${c.selected.size} 个类型，搜索隐藏的已选项也会保留`} onClose={c.close}>
  <ul className="batch-selected-list">{Array.from(c.selected.entries()).map(([id,item])=><li key={id}><div><strong>{item.name}</strong><small>{item.association.key}</small></div><button className="btn" disabled={c.selectionBlocked} aria-label={`移除 ${item.name}`} onClick={()=>c.setSelected(previous=>{const next=new Map(previous);next.delete(id);return next})}>移除</button></li>)}</ul>
  <div className="batch-dialog-actions"><button className="btn btn--primary" disabled={c.selectionBlocked||!c.selected.size} onClick={c.choose}>选择应用…</button></div>
 </Dialog>
 const b=c.changes.state?.batch
 if(c.modal==='results'&&b){
  const items=b.items??[],remaining=items.filter(item=>item.status==='queued').length,problems=items.filter(item=>['failed','changed','unavailable','unknown'].includes(item.status)).length
  const counts=items.reduce<Record<string,number>>((result,item)=>{const label=batchItemLabel(item.status);result[label]=(result[label]??0)+1;return result},{})
  const waiting=items.find(item=>item.status==='waiting')
  return <Dialog title="最近一次批量设置" subtitle={stateLabel(b.state)} onClose={c.close}>
   <div className="batch-target"><strong>目标：{b.target.name||'所选应用'}</strong><span>{b.target.path}</span></div>
   <p className="batch-counts">{Object.entries(counts).map(([label,count])=><span key={label}>{label} {count}</span>)}</p>
   <ItemTable items={items}/>
   <p className="batch-muted">这里保留的是本批次的处理结果；继续或重试前会重新查询当前默认。</p>
   {b.error?<p className="batch-error" role="alert">{b.error}</p>:null}{c.error?<p className="batch-error" role="alert">{c.error}</p>:null}
   <div className="batch-dialog-actions">{waiting?<button className="btn" onClick={()=>void c.changes.retry(waiting.selection.association)}>重新查询当前项</button>:null}{['running','waiting','paused'].includes(b.state)?<button className="btn" disabled={c.working} onClick={()=>void c.stop()}>停止后续设置</button>:null}{remaining?<button className="btn btn--primary" disabled={c.reviewBlocked} onClick={()=>c.resume('remaining')}>继续未执行的 {remaining} 项…</button>:null}{problems?<button className="btn" disabled={c.reviewBlocked} onClick={()=>c.resume('problems')}>重新处理 {problems} 个问题项…</button>:null}</div>
  </Dialog>
 }
 return null
}
