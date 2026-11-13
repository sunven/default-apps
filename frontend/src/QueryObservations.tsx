import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react'
import {Events} from '@wailsio/runtime'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Association} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import {AssociationQueries,associationID,type QueryAdapter,type QueryWatch} from './associationQueries'

const wails:QueryAdapter={query:association=>Query(association),subscribe:accept=>Events.On('defaultapps:observation',event=>accept(event.data))}
const Context=createContext<AssociationQueries|null>(null)

export function AssociationQueriesProvider({children,adapter=wails}:{children:ReactNode;adapter?:QueryAdapter}){
 const [queries]=useState(()=>new AssociationQueries(adapter))
 useLayoutEffect(()=>{queries.start();return()=>queries.stop()},[queries])
 return <Context.Provider value={queries}>{children}</Context.Provider>
}

export function useQueryModule(){
 const queries=useContext(Context)
 if(!queries)throw new Error('AssociationQueriesProvider is required')
 return queries
}

export function useQueryObservations(associations:Association[],intent:'background'|'panel'|'selected'='panel',enabled=true){
 const queries=useQueryModule()
 const state=useSyncExternalStore(queries.subscribe,queries.getSnapshot)
 const key=JSON.stringify(associations.map(associationID))
 const stable=useMemo(()=>associations,[key])
 const watch=useRef<QueryWatch|null>(null)
 const [settledKey,setSettledKey]=useState<string|null>(null)
 useEffect(()=>{
  setSettledKey(null)
  if(!enabled)return
  const current=queries.watch(stable,intent);watch.current=current
  let active=true
  void current.ready.then(()=>{if(active)setSettledKey(key)})
  return()=>{active=false;current.close();if(watch.current===current)watch.current=null}
 },[queries,stable,key,intent,enabled])
 const refresh=useCallback(()=>watch.current?.refresh()??Promise.resolve(),[])
 const settled=enabled&&settledKey===key
 return {...state,settled,refresh,refreshing:enabled&&(!settled||stable.some(a=>state.pending[associationID(a)]))}
}
