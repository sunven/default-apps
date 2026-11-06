import {useEffect,useRef,useState} from 'react'
import type {AppCopy,Association,DefaultObservation} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import {RespondQuit} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {Dialog} from './Dialog'
import type {Changes} from './Changes'

type Choice={association:Association;target:AppCopy;observed:DefaultObservation;oldRequestID:string;oldTarget:string}
export function useRecoveryAction(changes:Changes){
 const [choice,setChoice]=useState<Choice|null>(null)
 const submit=(association:Association,target:AppCopy,observed:DefaultObservation)=>{
  if(changes.blocked)return
  const recovery=changes.state?.recovery
  if(recovery){setChoice({association,target,observed,oldRequestID:recovery.record.requestID,oldTarget:recovery.record.target.path});return}
  void changes.submit(association,target,observed)
 }
 const confirm=()=>{if(!choice||changes.blocked)return;setChoice(null);void changes.submit(choice.association,choice.target,choice.observed,choice.oldRequestID)}
 const dialog=choice?<Dialog title="上次修改仍可能完成" onClose={()=>setChoice(null)}>
  <div className="lifecycle-explanation"><p>上次修改的结果未知。即使已重新打开应用，系统仍可能之后完成它。</p>
  <p>旧目标：<span>{choice.oldTarget}</span></p><p>新目标：<span>{choice.target.path}</span></p>
  <p>新的修改只与本次打开后的请求逐项执行。旧请求之后仍可能改变当前默认；应用会如实显示查询结果。</p></div>
  <div className="lifecycle-actions"><button onClick={()=>setChoice(null)}>返回</button><button disabled={changes.blocked} onClick={confirm}>明确提交新修改</button></div>
 </Dialog>:null
 return {submit,dialog}
}

export function LifecycleStatus({changes}:{changes:Changes}){
 const recovery=changes.state?.recovery
 const requested=useRef('')
 const [quitError,setQuitError]=useState('')
 useEffect(()=>{
  if(recovery&&requested.current!==recovery.record.requestID){requested.current=recovery.record.requestID;void changes.retry(recovery.record.association)}
 },[recovery?.record.requestID,changes.retry])
 const current=recovery?changes.state?.observations?.find(value=>value.association.kind===recovery.record.association.kind&&value.association.key===recovery.record.association.key)?.default:undefined
 const quit=changes.state?.quit
 const resultKnown=!!changes.state&&!changes.state.busy&&!recovery
 const respond=async(exit:boolean)=>{if(!quit?.prompt)return;try{setQuitError('');await RespondQuit(quit.promptID,exit)}catch(error){setQuitError(`退出选择未送达，请重试：${String(error)}`)}}
 return <>
  {recovery?<section className="recovery-status" aria-label="上次修改与当前观察">
   <div className="change-summary"><strong>上次修改结果未知</strong><span>{recovery.record.association.key}</span><button onClick={()=>void changes.retry(recovery.record.association)}>重新查询当前默认</button></div>
   <p>旧目标：{recovery.record.target.path}</p>
   <p>当前观察：{current?.known?current.app?.path??'无默认应用':'尚未取得有效观察'}{current?.stale?'（上次有效观察）':''}</p>
   {current?.error?<p className="change-error">当前查询失败：{current.error.message}。有效查询后才可再次修改。</p>:null}
   <p>当前观察不能证明上次修改成功。旧请求仍可能完成；再次修改前会说明旧目标。</p>
  </section>:null}
  {quit?.prompt?<Dialog title={resultKnown?'修改结果已可查看':'修改结果仍未确定'} onClose={()=>void respond(false)}>
   <div className="lifecycle-explanation">{resultKnown?<p>系统结果和当前默认已可查看。可以留在应用继续查看，或仍然退出。</p>:<><p>系统可能在退出后完成修改。退出不会撤回已经提出的系统请求。</p><p>重新打开应用后会查询当前默认，上次修改仍按结果未知显示。</p></>}</div>
   {quitError?<p className="change-error" role="status">{quitError}</p>:null}
   <div className="lifecycle-actions"><button onClick={()=>void respond(false)}>留在应用</button><button onClick={()=>void respond(true)}>仍然退出</button></div>
  </Dialog>:null}
 </>
}
