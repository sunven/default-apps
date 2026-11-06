import {useCallback,useEffect,useRef,useState} from 'react'
import {Events} from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import {GetSnapshot,Submit,Requery} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {AppCopy,Association,DefaultObservation} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import './changes.css'

export function useChanges(){
 const [state,setState]=useState<Snapshot|null>(null)
 const [message,setMessage]=useState('')
 const [sending,setSending]=useState(false)
 const [uncertain,setUncertain]=useState<string|null>(null)
 const version=useRef(-1),inFlight=useRef(false)
 const accept=useCallback((value:Snapshot)=>{if(value.version<=version.current)return;version.current=value.version;setState(value)},[])
 useEffect(()=>{let active=true;const off=Events.On('defaultapps:change',event=>{if(active)accept(event.data)});void GetSnapshot().then(value=>{if(active)accept(value)}).catch(error=>{if(active)setMessage(`无法读取修改状态：${String(error)}`)});return()=>{active=false;off()}},[accept])
 const submit=async(association:Association,target:AppCopy,observed:DefaultObservation)=>{
  if(inFlight.current||state?.busy||uncertain)return
  inFlight.current=true;setSending(true);setMessage('')
  const requestID=crypto.randomUUID()
  try{const result=await Submit({requestID,association,targetPath:target.path,expected:{known:observed.known&&!observed.stale&&!observed.error,path:observed.app?.path??''}});accept(result.snapshot);setMessage(result.outcome==='accepted'||result.outcome==='existing'?'':result.message)}
  catch(error){setUncertain(requestID);setMessage(`提交应答中断，受理结果待确认。${String(error)}`)}
  finally{inFlight.current=false;setSending(false)}
 }
 const retry=async(association:Association)=>{try{accept(await Requery(association));setMessage('')}catch(error){setMessage(`重新查询失败：${String(error)}`)}}
 const recoverReply=async()=>{try{const snapshot=await GetSnapshot();accept(snapshot);const found=snapshot.requests?.some(r=>r.requestID===uncertain);if(found)setUncertain(null);setMessage(found?'已找到原修改请求。':'原请求尚未出现在快照中，受理结果仍待确认；可继续查看原请求状态。')}catch(error){setMessage(`无法读取修改状态：${String(error)}`)}}
 return {state,message,sending,uncertain,blocked:!state||state.busy||sending||!!uncertain,submit,retry,recoverReply}
}
export type Changes=ReturnType<typeof useChanges>
export function requestLabel(request:Request){
 if(request.phase==='recovered')return '上次修改结果未知'
 if(request.confirmed)return '已确认本次修改'
 if(request.completion.known){if(request.readback.state==='failed')return '系统已返回 · 回读失败，等待重查';if(request.readback.state==='valid')return request.completion.error?'系统返回错误 · 已读取实际默认':'系统已返回 · 实际默认与目标不同';return '系统已返回 · 正在回读'}
 return request.phase==='submitted'?'已提交系统 · 等待系统返回':'已受理 · 等待提交系统'
}
export function ChangeStatus({changes,onReturn}:{changes:Changes;onReturn:(association:Association)=>void}){
 const request=changes.state?.requests?.find(r=>r.requestID===changes.state?.activeRequestID)??(changes.state?.requests?.length?changes.state.requests[changes.state.requests.length-1]:undefined)
 if(!request&&!changes.message&&!changes.state?.storageError)return null
 return <section className="change-status" aria-label="修改请求状态" aria-live="polite">
  {request?<><div className="change-summary"><strong>{requestLabel(request)}</strong><span>{request.association.key}</span><button onClick={()=>onReturn(request.association)}>返回请求项</button>{request.readback.state==='failed'?<button onClick={()=>void changes.retry(request.association)}>重新回读</button>:null}</div>
  <p className="change-target">目标：<span>{request.target.path}</span></p>
  {request.completion.error?<p className="change-error">{request.completion.error.domain} · {request.completion.error.code} · {request.completion.error.description}</p>:null}
  {request.readback.state==='valid'?<p>实际默认：{request.readback.observation.app?.path??'无默认应用'}</p>:null}
  {request.readback.state==='failed'?<p>保留最后有效观察：{request.readback.observation.app?.path??'无默认应用'} · {request.readback.observation.error?.message}</p>:null}
  {request.storageError?<p className="change-error">系统结果与回读已知；未定记录清除失败：{request.storageError.message}</p>:null}</>:null}
  {changes.message?<p role="status">{changes.message}</p>:null}
  {changes.uncertain?<button onClick={()=>void changes.recoverReply()}>查看原请求状态</button>:null}
  {changes.state?.storageError?<p className="change-error">配置读取失败：{changes.state.storageError.message}</p>:null}
 </section>
}
