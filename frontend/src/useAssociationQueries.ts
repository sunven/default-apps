import {useCallback,useReducer,useRef} from 'react'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Association,DefaultObservation,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
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

export function useAssociationQueries(){
 const [state,dispatch]=useReducer(reduce,{observations:{},rowErrors:{},issued:{}})
 const sequence=useRef(0)
 const acceptObservation=useCallback((value:QueryResult)=>dispatch({type:'result',value}),[])
 const query=useCallback(async(association:Association,isCurrent:()=>boolean=()=>true)=>{
  const token=++sequence.current,id=`${association.kind}:${association.key}`
  dispatch({type:'started',id,token})
  try{const value=await Query(association);if(isCurrent())dispatch({type:'result',value,token})}
  catch(error){if(isCurrent())dispatch({type:'failed',id,token,message:message(error)})}
 },[])
 return {observations:state.observations,rowErrors:state.rowErrors,query,acceptObservation}
}
