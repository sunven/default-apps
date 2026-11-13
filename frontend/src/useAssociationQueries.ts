import {useCallback,useEffect,useRef} from 'react'
import {Events} from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import type {Association,DefaultObservation,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import {useQueryModule,useQueryObservations} from './QueryObservations'
import type {QueryWatch} from './associationQueries'
import {notify,dismissNotification} from './Notifications'

// Trustworthy mirrors association.DefaultObservation.Trustworthy in Go.
export const isTrustworthy=(observation:DefaultObservation|undefined)=>!!observation?.known&&!observation.error&&!observation.stale

export function observationFor(state:{observations?:QueryResult[]|null}|null|undefined,association:Association,observations?:Record<string,QueryResult>):DefaultObservation|undefined {
 const snapshot=state?.observations?.find(value=>value.association.kind===association.kind&&value.association.key===association.key)
 const current=observations?.[`${association.kind}:${association.key}`]
 return (current&&(!snapshot||current.version>=snapshot.version)?current:snapshot)?.default
}

type QueryEntry=Pick<Entry,'id'|'association'|'resolved'>
type Options={
 selected?:QueryEntry
 entries:QueryEntry[]
 snapshotObservations?:QueryResult[]|null
 getVisibleAssociationIDs:()=>Set<string>
}

// Browsing owns its refresh triggers; shared observations and query lifetimes
// belong to the window's query module, also used by the two batch panels.
export function useAssociationQueries({selected,entries,snapshotObservations,getVisibleAssociationIDs}:Options){
 const queries=useQueryModule()
 const current=useQueryObservations(selected?.resolved?[selected.association]:[],'selected')
 const background=useQueryObservations(entries.filter(entry=>entry.resolved).map(entry=>entry.association),'background')
 const requestVersion=useRef(0)
 useEffect(()=>{for(const value of snapshotObservations??[])queries.accept(value)},[queries,snapshotObservations])
 useEffect(()=>()=>{++requestVersion.current},[selected?.id])
 const refresh=useCallback(async(notifyUser=false)=>{
  const version=++requestVersion.current
  if(!selected?.resolved)return
  const id=notifyUser?notify('pending','正在重新查询关联…',{description:selected.association.key}):undefined
  await current.refresh()
  if(id!==undefined){
   const result=queries.getSnapshot().observations[selected.id]
   if(version===requestVersion.current&&result&&!queries.getSnapshot().rowErrors[selected.id]&&isTrustworthy(result.default)&&result.candidates.known&&!result.candidates.error&&!result.candidates.stale)notify('success','关联查询已更新',{id,description:selected.association.key})
   else dismissNotification(id)
  }
 },[selected,current.refresh,queries])
 const visibleRefresh=useRef(()=>{})
 const foreground=useRef(new Set<QueryWatch>())
 visibleRefresh.current=()=>{
  const ids=getVisibleAssociationIDs()
  void refresh()
  const watch=queries.watch(entries.filter(entry=>entry.resolved&&ids.has(entry.id)&&entry.id!==selected?.id).map(entry=>entry.association),'refresh')
  foreground.current.add(watch)
  void watch.ready.then(()=>{watch.close();foreground.current.delete(watch)})
 }
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const off=Events.On('defaultapps:activated',()=>{if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;visibleRefresh.current()},100)})
  return()=>{off();if(timer!==undefined)clearTimeout(timer);for(const watch of foreground.current)watch.close();foreground.current.clear()}
 },[])
 return {observations:current.observations,rowErrors:current.rowErrors,loading:!!selected?.resolved&&current.refreshing,prefetching:background.refreshing,refresh}
}
