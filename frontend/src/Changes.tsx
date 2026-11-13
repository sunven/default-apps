import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Events} from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import {GetSnapshot,Submit,Requery,ReconcileSubmission} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request,Submission} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {AppCopy,Association,DefaultObservation,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import {observationFor} from './useAssociationQueries'
import {notify,dismissNotification,isNotificationVisible} from './Notifications'

const pendingKey='defaultapps.submission.v1'
function savedSubmission():Submission|null {
 try {const saved=JSON.parse(sessionStorage.getItem(pendingKey)??'null');return saved?.version===1&&saved.input?.requestID&&saved.input?.association?.key&&saved.input?.targetPath?saved.input:null} catch{return null}
}
export function useChanges(){
 const [state,setState]=useState<Snapshot|null>(null)
 const [message,setMessage]=useState('')
 const [snapshotError,setSnapshotError]=useState('')
 const [loadingSnapshot,setLoadingSnapshot]=useState(false)
 const [sending,setSending]=useState(false)
 const [pending,setPending]=useState<Submission|null>(savedSubmission)
 const historicalRequests=useRef(new Set<string>())
 const pendingRef=useRef(pending)
 const snapshotRequest=useRef<symbol|null>(null)
 const version=useRef(-1),inFlight=useRef(false),reconciling=useRef(false),reconcileAgain=useRef(false),mounted=useRef(true)
 const forget=useCallback(()=>{sessionStorage.removeItem(pendingKey);pendingRef.current=null;if(mounted.current)setPending(null)},[])
 const accept=useCallback((value:Snapshot)=>{if(!mounted.current||value.version<=version.current)return;version.current=value.version;setState(value);setSnapshotError('');const original=pendingRef.current;if(original&&value.requests?.some(r=>r.requestID===original.requestID&&r.association.kind===original.association.kind&&r.association.key===original.association.key&&r.target.path===original.targetPath)){forget();setMessage('')}},[forget])
 const retrySnapshot=useCallback(async()=>{
  if(!mounted.current||snapshotRequest.current||version.current>=0)return
  const request=Symbol();snapshotRequest.current=request;setLoadingSnapshot(true)
  try {
   const value=await GetSnapshot()
   if(!mounted.current||snapshotRequest.current!==request)return
   if(version.current<0)for(const item of value.requests??[])if(item.phase==='resolved')historicalRequests.current.add(item.requestID)
   accept(value)
  }catch(error){
   if(mounted.current&&snapshotRequest.current===request&&version.current<0)setSnapshotError(`无法读取修改状态：${String(error)}`)
  }finally{
   if(snapshotRequest.current===request){snapshotRequest.current=null;if(mounted.current)setLoadingSnapshot(false)}
  }
 },[accept])
 useEffect(()=>{mounted.current=true;const off=Events.On('defaultapps:change',event=>accept(event.data));void retrySnapshot();return()=>{mounted.current=false;snapshotRequest.current=null;off()}},[accept,retrySnapshot])
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
  if(!state||inFlight.current||state.busy||state.batchBlocked||state.quit?.exiting||state.quit?.restarting||(state.quit?.prompt&&state.quit.intent==='update')||pending)return
  const input={requestID:crypto.randomUUID(),recoveryRequestID,association,targetPath:target.path,expected:{known:observed.known&&!observed.stale&&!observed.error,path:observed.app?.path??''}}
  try{sessionStorage.setItem(pendingKey,JSON.stringify({version:1,input}))}catch{setMessage('无法保存原请求标识，请恢复会话存储后再修改。');return}
  inFlight.current=true;pendingRef.current=input;setPending(input);setSending(true);setMessage('')
  try{const result=await Submit(input);if(!mounted.current)return;accept(result.snapshot);if(result.outcome==='interrupted'){setMessage(result.message)}else{forget();setMessage(result.outcome==='accepted'||result.outcome==='existing'?'':result.message)}}
  catch(error){if(mounted.current&&pendingRef.current?.requestID===input.requestID)setMessage(`提交应答中断，受理结果待确认。${String(error)}`)}
  finally{inFlight.current=false;if(mounted.current)setSending(false)}
 }
 const retry=async(association:Association)=>{try{accept(await Requery(association));setMessage('')}catch(error){setMessage(`重新查询失败：${String(error)}`)}}
 return {state,message,snapshotError,loadingSnapshot,retrySnapshot,sending,pending,historicalRequests,accept,blocked:!state||state.busy||!!state.batchBlocked||!!state.quit?.exiting||!!state.quit?.restarting||!!(state.quit?.prompt&&state.quit.intent==='update')||sending||!!pending,submit,retry,recoverReply}
}
export type Changes=ReturnType<typeof useChanges>
export function requestLabel(request:Request){
 if(request.phase==='recovered')return '上次修改结果未知'
 if(request.confirmed)return '已确认本次修改'
 if(request.completion.known){if(request.readback.state==='failed')return '系统已返回 · 回读失败，等待重查';if(request.readback.state==='valid')return request.completion.error?'系统返回错误 · 已读取实际默认':'系统已返回 · 实际默认与目标不同';return '系统已返回 · 正在回读'}
 return request.phase==='submitted'?'已提交系统 · 等待系统返回':'已受理 · 等待提交系统'
}
export function ChangeStatus({changes,onReturn,observations}:{changes:Changes;onReturn:(association:Association)=>void;observations?:Record<string,QueryResult>}){
 const presented=useRef(new Map<string,{stage:string;description:string}>())
 const pendingToast=useRef<string|null>(null)
 const latest=useRef({changes,onReturn});latest.current={changes,onReturn}
 useEffect(()=>{
  const publish=(id:string,stage:string,title:string,description:string,tone:Parameters<typeof notify>[0],actions:React.ReactNode)=>{
   const previous=presented.current.get(id)
   const visible=isNotificationVisible(id)
   if(previous?.stage===stage&&(previous.description===description||!visible))return
   presented.current.set(id,{stage,description})
   notify(tone,title,{id,description:<>{description.split('\n').filter(Boolean).map((line,index)=><p key={index}>{line.startsWith('目标：')?<>目标：<Text>{line.slice(3)}</Text></>:line}</p>)}{actions?<HStack gap={2} align="center" className="notification-actions">{actions}</HStack>:null}</>})
  }
  for(const request of changes.state?.requests??[]){
   if(request.batchID||changes.state?.batch?.items?.some(item=>item.requestID===request.requestID))continue
   if(request.phase==='recovered'||changes.historicalRequests.current.has(request.requestID))continue
   const actual=observationFor(changes.state,request.association,observations)??request.readback.observation
   const error=request.completion.error
   const description=[request.association.key,`目标：${request.target.path}`,
    error?`${error.domain} · ${error.code} · ${error.description}`:'',
    request.readback.state==='valid'?`实际默认：${actual?.app?.path??'无默认应用'}${actual?.stale?'（最后有效观察）':''}${actual?.error?` · 查询失败：${actual.error.message}`:''}`:'',
    request.readback.state==='failed'?`保留最后有效观察：${request.readback.observation.app?.path??'无默认应用'} · ${request.readback.observation.error?.message??''}`:'',
   ].filter(Boolean).join('\n')
   const stage=JSON.stringify([requestLabel(request),error,request.readback.state,request.readback.observation?.error])
   publish(`change:${request.requestID}`,stage,requestLabel(request),description,
    request.confirmed?'success':error||request.readback.state==='failed'?'error':request.readback.state==='valid'?'warning':'pending',
    <><Button label="返回请求项" onClick={()=>latest.current.onReturn(request.association)}/>{request.readback.state==='failed'?<Button label="重新回读" onClick={()=>void latest.current.changes.retry(request.association)}/>:null}</>)
  }
  if(changes.pending){
   const pending=changes.pending
   pendingToast.current=`change:${pending.requestID}`
   publish(`change:${pending.requestID}`,`pending:${changes.message}`,'正在核对原修改请求',
    `${pending.association.key}\n目标：${pending.targetPath}${changes.message?`\n${changes.message}`:''}`,changes.message?'warning':'pending',
    <Button label="查看原请求状态" onClick={()=>void latest.current.changes.recoverReply()}/>)
  }else if(pendingToast.current){
   if(!changes.state?.requests?.some(request=>`change:${request.requestID}`===pendingToast.current))dismissNotification(pendingToast.current)
   pendingToast.current=null
  }
  const messageID='change:message'
  if(changes.message&&!changes.pending)publish(messageID,changes.message,changes.message,'','warning',null)
  else if(presented.current.has(messageID)){dismissNotification(messageID);presented.current.delete(messageID)}
 },[changes.state,changes.pending,changes.message,changes.historicalRequests,observations])
 const storageRequests=changes.state?.requests?.filter(request=>request.storageError)??[]
 if(!changes.snapshotError&&!changes.state?.storageError&&!storageRequests.length)return null
 return <section className="recovery-status" aria-label={changes.snapshotError?'修改状态读取失败':'修改配置故障'} role="alert">
  {changes.snapshotError?<><p className="change-error">{changes.snapshotError}</p><Button label="重试读取修改状态" variant="secondary" isLoading={changes.loadingSnapshot} onClick={()=>void changes.retrySnapshot()}/></>:null}
  {storageRequests.map(request=><p key={request.requestID} className="change-error">{request.association.key} · 系统结果与回读已知；未定记录清除失败：{request.storageError!.message}</p>)}
  {changes.state?.storageError?<p className="change-error">配置读取失败：{changes.state.storageError.message}</p>:null}
 </section>
}
