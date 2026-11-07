import {useCallback,useEffect,useReducer,useRef,useState} from 'react'
import {Events} from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Association,DefaultObservation,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import {message} from './errors'

// Trustworthy mirrors association.DefaultObservation.Trustworthy in Go.
export const isTrustworthy=(observation:DefaultObservation|undefined)=>!!observation?.known&&!observation.error&&!observation.stale

export function observationFor(state:{observations?:QueryResult[]|null}|null|undefined,association:Association):DefaultObservation|undefined {
 return state?.observations?.find(value=>value.association.kind===association.kind&&value.association.key===association.key)?.default
}

type State={
 observations:Record<string,QueryResult>
 rowErrors:Record<string,string>
 issued:Record<string,{token:number;observedVersion:number}>
}
type Action=
 | {type:'started';id:string;token:number}
 | {type:'result';value:QueryResult;token?:number}
 | {type:'failed';id:string;token:number;message:string}

function reduce(state:State,action:Action):State {
 if(action.type==='started')return {...state,issued:{...state.issued,[action.id]:{token:action.token,observedVersion:state.observations[action.id]?.version??-1}}}
 if(action.type==='failed'){
  const issued=state.issued[action.id]
  // A late rejection has no server version. Its issuance and the last accepted
  // observation fence it against both newer calls and authoritative snapshots.
  if(issued?.token!==action.token || issued.observedVersion!==(state.observations[action.id]?.version??-1))return state
  return {...state,rowErrors:{...state.rowErrors,[action.id]:action.message}}
 }
 const {value,token}=action
 if(value.superseded)return state
 const id=`${value.association.kind}:${value.association.key}`,current=state.observations[id]
 if(current && (value.version<current.version || (value.version===current.version && (token===undefined || token!==state.issued[id]?.token))))return state
 const errors={...state.rowErrors};delete errors[id]
 return {...state,observations:{...state.observations,[id]:value},rowErrors:errors}
}

type QueryEntry=Pick<Entry,'id'|'association'|'resolved'>
type Options={
 selected?:QueryEntry
 entries:QueryEntry[]
 snapshotObservations?:QueryResult[]|null
 getVisibleAssociationIDs:()=>Set<string>
}

// The caller owns browsing and viewport measurement; this hook owns query timing.
export function useAssociationQueries({selected,entries,snapshotObservations,getVisibleAssociationIDs}:Options){
 const [state,dispatch]=useReducer(reduce,{observations:{},rowErrors:{},issued:{}})
 const [loading,setLoading]=useState(false)
 const sequence=useRef(0),requestVersion=useRef(0)
 useEffect(()=>{for(const value of snapshotObservations??[])dispatch({type:'result',value})},[snapshotObservations])
 const query=useCallback(async(association:Association,isCurrent:()=>boolean=()=>true)=>{
  const token=++sequence.current,id=`${association.kind}:${association.key}`
  dispatch({type:'started',id,token})
  try{const value=await Query(association);if(isCurrent())dispatch({type:'result',value,token})}
  catch(error){if(isCurrent())dispatch({type:'failed',id,token,message:message(error)})}
 },[])
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current
  if(!selected?.resolved){setLoading(false);return}
  setLoading(true)
  try{await query(selected.association,()=>version===requestVersion.current)}
  finally{if(version===requestVersion.current)setLoading(false)}
 },[selected,query])
 useEffect(()=>{void refresh();return()=>{++requestVersion.current}},[refresh])
 // A list change starts a new prefetch round; accepted observations do not.
 useEffect(()=>{
  let active=true,cursor=0
  const pending=entries.filter(entry=>entry.resolved && entry.id!==selected?.id && !state.observations[entry.id])
  const worker=async()=>{while(active && cursor<pending.length){const entry=pending[cursor++];await query(entry.association,()=>active)}}
  void Promise.all(Array.from({length:Math.min(4,pending.length)},worker))
  return()=>{active=false}
 },[entries,query])
 const visibleRefresh=useRef(()=>{})
 visibleRefresh.current=()=>{
  const ids=getVisibleAssociationIDs()
  void refresh()
  for(const entry of entries)if(entry.resolved&&ids.has(entry.id)&&entry.id!==selected?.id)void query(entry.association)
 }
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const off=Events.On('defaultapps:activated',()=>{if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;visibleRefresh.current()},100)})
  return()=>{off();if(timer!==undefined)clearTimeout(timer)}
 },[])
 return {observations:state.observations,rowErrors:state.rowErrors,loading,refresh}
}
