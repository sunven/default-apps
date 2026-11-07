import {useCallback,useEffect,useRef,useState} from 'react'
import {Events} from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import {GetSnapshot,Submit,Requery,ReconcileSubmission} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request,Submission} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {AppCopy,Association,DefaultObservation} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import {observationFor} from './useAssociationQueries'
import './changes.css'

const pendingKey='defaultapps.submission.v1'
function savedSubmission():Submission|null {
 try {const saved=JSON.parse(sessionStorage.getItem(pendingKey)??'null');return saved?.version===1&&saved.input?.requestID&&saved.input?.association?.key&&saved.input?.targetPath?saved.input:null} catch{return null}
}
export function useChanges(){
 const [state,setState]=useState<Snapshot|null>(null)
 const [message,setMessage]=useState('')
 const [sending,setSending]=useState(false)
 const [pending,setPending]=useState<Submission|null>(savedSubmission)
 const pendingRef=useRef(pending)
 const version=useRef(-1),inFlight=useRef(false),reconciling=useRef(false),reconcileAgain=useRef(false),mounted=useRef(true)
 const forget=useCallback(()=>{sessionStorage.removeItem(pendingKey);pendingRef.current=null;if(mounted.current)setPending(null)},[])
 const accept=useCallback((value:Snapshot)=>{if(!mounted.current||value.version<=version.current)return;version.current=value.version;setState(value);const original=pendingRef.current;if(original&&value.requests?.some(r=>r.requestID===original.requestID&&r.association.kind===original.association.kind&&r.association.key===original.association.key&&r.target.path===original.targetPath)){forget();setMessage('')}},[forget])
 useEffect(()=>{mounted.current=true;const off=Events.On('defaultapps:change',event=>accept(event.data));void GetSnapshot().then(accept).catch(error=>{if(mounted.current)setMessage(`无法读取修改状态：${String(error)}`)});return()=>{mounted.current=false;off()}},[accept])
 const recoverReply=useCallback(async function reconcile(){
  if(!pending)return
  if(reconciling.current){reconcileAgain.current=true;return}
  reconciling.current=true
  try {
   const result=await ReconcileSubmission(pending)
   if(!mounted.current||pendingRef.current?.requestID!==pending.requestID)return
   accept(result.snapshot)
   if(!pendingRef.current)return
   if(result.state==='decided'&&result.result){forget();setMessage(result.result.outcome==='existing'?'已找到原修改请求。':result.result.message)}
   else setMessage('原请求仍在核对受理条件，受理结果待确认。')
  }catch(error){if(mounted.current)setMessage(`无法核对原请求：${String(error)}`)}
  finally{reconciling.current=false;if(reconcileAgain.current){reconcileAgain.current=false;if(mounted.current&&pendingRef.current?.requestID===pending.requestID)void reconcile()}}
 },[pending,accept,forget])
 // A reload or the next authoritative update recovers the same admission. This
 // endpoint can close a never-arrived request; it never invokes the setter.
 useEffect(()=>{if(!sending&&pending)void recoverReply()},[state?.version,sending,pending,recoverReply])
 const submit=async(association:Association,target:AppCopy,observed:DefaultObservation,recoveryRequestID='')=>{
  if(inFlight.current||state?.busy||state?.quit?.exiting||pending)return
  const input={requestID:crypto.randomUUID(),recoveryRequestID,association,targetPath:target.path,expected:{known:observed.known&&!observed.stale&&!observed.error,path:observed.app?.path??''}}
  try{sessionStorage.setItem(pendingKey,JSON.stringify({version:1,input}))}catch{setMessage('无法保存原请求标识，请恢复会话存储后再修改。');return}
  inFlight.current=true;pendingRef.current=input;setPending(input);setSending(true);setMessage('')
  try{const result=await Submit(input);if(!mounted.current)return;accept(result.snapshot);if(result.outcome==='interrupted'){setMessage(result.message)}else{forget();setMessage(result.outcome==='accepted'||result.outcome==='existing'?'':result.message)}}
  catch(error){if(mounted.current&&pendingRef.current?.requestID===input.requestID)setMessage(`提交应答中断，受理结果待确认。${String(error)}`)}
  finally{inFlight.current=false;if(mounted.current)setSending(false)}
 }
 const retry=async(association:Association)=>{try{accept(await Requery(association));setMessage('')}catch(error){setMessage(`重新查询失败：${String(error)}`)}}
 return {state,message,sending,pending,blocked:!state||state.busy||!!state.quit?.exiting||sending||!!pending,submit,retry,recoverReply}
}
export type Changes=ReturnType<typeof useChanges>
export function requestLabel(request:Request){
 if(request.phase==='recovered')return '上次修改结果未知'
 if(request.confirmed)return '已确认本次修改'
 if(request.completion.known){if(request.readback.state==='failed')return '系统已返回 · 回读失败，等待重查';if(request.readback.state==='valid')return request.completion.error?'系统返回错误 · 已读取实际默认':'系统已返回 · 实际默认与目标不同';return '系统已返回 · 正在回读'}
 return request.phase==='submitted'?'已提交系统 · 等待系统返回':'已受理 · 等待提交系统'
}
export function ChangeStatus({changes,onReturn}:{changes:Changes;onReturn:(association:Association)=>void}){
 const requests=changes.state?.requests?.filter(r=>r.phase!=='recovered')
 const request=requests?.find(r=>r.requestID===changes.state?.activeRequestID)??requests?.[requests.length-1]
 const actual=request?observationFor(changes.state,request.association)??request.readback.observation:undefined
 if(!request&&!changes.pending&&!changes.message&&!changes.state?.storageError)return null
 return <section className="change-status" data-tone={request?.confirmed?'success':request?.completion.error||request?.readback.state==='failed'||changes.message||changes.state?.storageError?'warning':'pending'} aria-label="修改请求状态" aria-live="polite">
  {request?<><div className="change-summary"><strong>{requestLabel(request)}</strong><span>{request.association.key}</span><button className="btn" onClick={()=>onReturn(request.association)}>返回请求项</button>{request.readback.state==='failed'?<button className="btn" onClick={()=>void changes.retry(request.association)}>重新回读</button>:null}</div>
  <p className="change-target">目标：<span>{request.target.path}</span></p>
  {request.completion.error?<p className="change-error">{request.completion.error.domain} · {request.completion.error.code} · {request.completion.error.description}</p>:null}
  {request.readback.state==='valid'?<p>实际默认：{actual?.app?.path??'无默认应用'}{actual?.stale?'（最后有效观察）':''}{actual?.error?` · 查询失败：${actual.error.message}`:''}</p>:null}
  {request.readback.state==='failed'?<p>保留最后有效观察：{request.readback.observation.app?.path??'无默认应用'} · {request.readback.observation.error?.message}</p>:null}
  {request.storageError?<p className="change-error">系统结果与回读已知；未定记录清除失败：{request.storageError.message}</p>:null}</>:null}
  {changes.pending&&!request?<p>正在核对原修改请求 · {changes.pending.association.key}<br/>目标：{changes.pending.targetPath}</p>:null}
  {changes.message?<p role="status">{changes.message}</p>:null}
  {changes.pending?<button className="btn" onClick={()=>void changes.recoverReply()}>查看原请求状态</button>:null}
  {changes.state?.storageError?<p className="change-error">配置读取失败：{changes.state.storageError.message}</p>:null}
 </section>
}
