import {useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react'
import {PrepareBatch,ReconcileBatchStart,StartBatch,StopBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {AddIdentifiedType,IdentifyFiles,PickApplication} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type {Changes} from './Changes'
import {BatchWorkflow} from './batchWorkflow'

const pendingKey='defaultapps.batch-start.v1'

export function useBatchSettings(changes:Changes){
 const latest=useRef(changes)
 useLayoutEffect(()=>{latest.current=changes})
 const [workflow]=useState(()=>new BatchWorkflow({
  identify:paths=>IdentifyFiles(paths),saveType:id=>AddIdentifiedType(id),pickApplication:()=>PickApplication(),
  prepare:(items,path,resumeID)=>PrepareBatch([...items],path,resumeID),
  start:(id,replaceID,recoveryID)=>StartBatch(id,replaceID,recoveryID),reconcile:id=>ReconcileBatchStart(id),stop:id=>StopBatch(id),
  accept:snapshot=>latest.current.accept(snapshot),retry:association=>latest.current.retry(association),
  storage:{load:()=>sessionStorage.getItem(pendingKey)||'',save:id=>sessionStorage.setItem(pendingKey,id),clear:()=>sessionStorage.removeItem(pendingKey)},
 }))
 useLayoutEffect(()=>{workflow.connect();return()=>workflow.disconnect()},[workflow])
 useLayoutEffect(()=>{workflow.updateContext({state:changes.state,sending:changes.sending,pending:!!changes.pending})},[workflow,changes.state,changes.sending,changes.pending])
 const state=useSyncExternalStore(workflow.subscribe,workflow.getSnapshot)
 return {...state,...workflow.actions}
}
export type BatchController=ReturnType<typeof useBatchSettings>
