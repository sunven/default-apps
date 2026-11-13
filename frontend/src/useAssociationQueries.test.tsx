import {act,renderHook} from '@testing-library/react'
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Association,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import {AssociationQueriesProvider} from './QueryObservations'
import {useAssociationQueries} from './useAssociationQueries'

vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({Query:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))
const entry=(key:string):Entry=>({id:`file:${key}`,association:{kind:'file',key},name:key,resolved:true,extensions:[],mimeTypes:[],sources:[],unresolvedReason:'',diagnosticIdentifiers:[]})
const pdf=entry('com.adobe.pdf'),jpeg=entry('public.jpeg')
const observation=(association:Association,version=1):QueryResult=>({association,version,default:{known:true,app:null,observedAt:'2026-11-07T08:00:00Z',stale:false,error:null},candidates:{known:true,apps:[],observedAt:'2026-11-07T08:00:00Z',stale:false,error:null}})
function deferred(){
 let resolve!:(value:QueryResult)=>void,reject!:(error:Error)=>void
 const promise=new Promise<QueryResult>((accept,fail)=>{resolve=accept;reject=fail}) as ReturnType<typeof Query>
 return {promise,resolve,reject}
}
const listeners=new Map<string,(data?:unknown)=>void>()
beforeEach(()=>{
 vi.resetAllMocks();listeners.clear()
 vi.mocked(Events.On).mockImplementation((name,listener)=>{listeners.set(name,(data=true)=>listener({data} as never));return ()=>{listeners.delete(name)}})
 vi.mocked(Query).mockImplementation(association=>Promise.resolve(observation(association)) as ReturnType<typeof Query>)
})
afterEach(()=>vi.useRealTimers())

test('selection owns loading while an obsolete selection response only updates shared observations',async()=>{
 const old=deferred(),current=deferred()
 vi.mocked(Query).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
 const options={selected:pdf,entries:[],snapshotObservations:[],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,rerender}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 expect(Query).toHaveBeenCalledWith(pdf.association)
 expect(result.current.loading).toBe(true)
 rerender({...options,selected:jpeg})
 expect(Query).toHaveBeenLastCalledWith(jpeg.association)
 await act(async()=>old.resolve(observation(pdf.association)))
 expect(result.current.loading).toBe(true)
 expect(result.current.observations[pdf.id]).toEqual(observation(pdf.association))
 await act(async()=>current.resolve(observation(jpeg.association)))
 expect(result.current.loading).toBe(false)
 expect(result.current.observations[jpeg.id]).toEqual(observation(jpeg.association))
})

test('selection and restarted prefetch rounds share pending association queries',async()=>{
 const rows=[pdf,jpeg,...Array.from({length:4},(_,index)=>entry(`test.shared.${index}`))]
 const calls=new Map<string,ReturnType<typeof deferred>>()
 vi.mocked(Query).mockImplementation(association=>{
  const call=deferred();calls.set(association.key,call);return call.promise
 })
 const options={selected:pdf,entries:rows,getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,rerender}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 expect(Query).toHaveBeenCalledTimes(5)
 rerender({...options,selected:jpeg})
 rerender({...options,selected:jpeg,entries:rows.slice(0,3)})
 expect(Query).toHaveBeenCalledTimes(5)
 expect(result.current.loading).toBe(true)
 await act(async()=>{
  for(const row of rows.slice(0,5))calls.get(row.association.key)!.resolve(observation(row.association))
 })
 expect(result.current.loading).toBe(false)
 expect(result.current.prefetching).toBe(false)
 expect(result.current.observations[jpeg.id]).toEqual(observation(jpeg.association))
 expect(result.current.observations[pdf.id]).toEqual(observation(pdf.association))
 expect(Query).toHaveBeenCalledTimes(5)
})

test('explicit refresh replaces a pending shared request and fences its late rejection',async()=>{
 const old=deferred(),fresh=deferred()
 vi.mocked(Query).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
 const options={selected:pdf,entries:[pdf],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 let refresh!:Promise<void>
 act(()=>{refresh=result.current.refresh()})
 expect(Query).toHaveBeenCalledTimes(2)
 await act(async()=>{fresh.resolve(observation(pdf.association,2));await refresh})
 await act(async()=>old.reject(new Error('obsolete request failed')))
 expect(result.current.loading).toBe(false)
 expect(result.current.rowErrors[pdf.id]).toBeUndefined()
 expect(result.current.observations[pdf.id].version).toBe(2)
})

test.each(['snapshot','observation event'])('fresh %s clears transport errors while cached and superseded observations cannot',async(source)=>{
 const options={selected:pdf,entries:[],snapshotObservations:[] as QueryResult[],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,rerender}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 const publish=(value:QueryResult)=>act(()=>{
  if(source==='snapshot')rerender({...options,snapshotObservations:[value]})
  else listeners.get('defaultapps:observation')?.(value)
 })
 await act(async()=>{})
 vi.mocked(Query).mockRejectedValueOnce(new Error('connection lost'))
 await act(async()=>result.current.refresh())
 expect(result.current.rowErrors[pdf.id]).toBe('connection lost')
 expect(result.current.observations[pdf.id]).toEqual(observation(pdf.association))
 publish(observation(pdf.association))
 expect(result.current.rowErrors[pdf.id]).toBe('connection lost')
 vi.mocked(Query).mockResolvedValueOnce({...observation(pdf.association,2),superseded:true})
 await act(async()=>result.current.refresh())
 expect(result.current.rowErrors[pdf.id]).toBe('connection lost')
 publish(observation(pdf.association,3))
 expect(result.current.rowErrors[pdf.id]).toBeUndefined()
 expect(result.current.observations[pdf.id].version).toBe(3)
 publish(observation(pdf.association,2))
 expect(result.current.observations[pdf.id].version).toBe(3)
 vi.mocked(Query).mockRejectedValueOnce(new Error('retry failed'))
 await act(async()=>result.current.refresh())
 vi.mocked(Query).mockResolvedValueOnce(observation(pdf.association,3))
 await act(async()=>result.current.refresh())
 expect(result.current.rowErrors[pdf.id]).toBeUndefined()
})

test('an observation event survives a late initial snapshot and request rejection, and unsubscribes on unmount',async()=>{
 const call=deferred()
 vi.mocked(Query).mockReturnValueOnce(call.promise)
 const options={selected:pdf,entries:[],snapshotObservations:[] as QueryResult[],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,rerender,unmount}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 act(()=>listeners.get('defaultapps:observation')?.(observation(pdf.association,4)))
 act(()=>listeners.get('defaultapps:observation')?.(observation(jpeg.association,2)))
 rerender({...options,snapshotObservations:[observation(pdf.association,1)]})
 await act(async()=>call.reject(new Error('late transport failure')))
 expect(result.current.observations[pdf.id]).toEqual(observation(pdf.association,4))
 expect(result.current.observations[jpeg.id]).toEqual(observation(jpeg.association,2))
 expect(result.current.rowErrors[pdf.id]).toBeUndefined()
 act(()=>listeners.get('defaultapps:observation')?.({...observation(pdf.association,5),superseded:true}))
 expect(result.current.observations[pdf.id].version).toBe(4)
 unmount()
 expect(listeners.has('defaultapps:observation')).toBe(false)
})

test('prefetch skips known and unresolved entries and stops an obsolete round after the list changes',async()=>{
 const rows=Array.from({length:7},(_,index)=>entry(`test.${index}`))
 const unresolved={...entry('unknown'),resolved:false}
 const options={selected:pdf,entries:[] as Entry[],snapshotObservations:[observation(jpeg.association)],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,rerender}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 await act(async()=>{})
 vi.mocked(Query).mockClear()
 const calls=new Map<string,ReturnType<typeof deferred>>()
 vi.mocked(Query).mockImplementation(association=>{const call=deferred();calls.set(association.key,call);return call.promise})
 rerender({...options,entries:[pdf,jpeg,unresolved,...rows]})
 expect(vi.mocked(Query).mock.calls.map(([a])=>a.key)).toEqual(rows.slice(0,4).map(row=>row.association.key))
 expect(result.current.loading).toBe(false)
 await act(async()=>calls.get(rows[0].association.key)!.resolve(observation(rows[0].association)))
 expect(Query).toHaveBeenCalledTimes(5)
 expect(Query).toHaveBeenLastCalledWith(rows[4].association)
 rerender(options)
 await act(async()=>{for(const row of rows.slice(1,5))calls.get(row.association.key)!.resolve(observation(row.association))})
 expect(Query).toHaveBeenCalledTimes(5)
 expect(result.current.observations[rows[0].id]).toBeDefined()
 expect(result.current.observations[rows[1].id]).toEqual(observation(rows[1].association))
})

test('foreground bursts refresh the latest visible rows and selected entry, and unmount clears the subscription and timer',async()=>{
 const other=entry('test.other'),unresolved={...entry('unknown'),resolved:false}
 const options={selected:pdf,entries:[pdf,jpeg,other,unresolved],getVisibleAssociationIDs:()=>new Set([jpeg.id])}
 const {result,rerender,unmount}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 await act(async()=>{})
 vi.useFakeTimers();vi.mocked(Query).mockClear()
 const selected=deferred(),visible=deferred()
 vi.mocked(Query).mockReturnValueOnce(selected.promise).mockReturnValueOnce(visible.promise)
 act(()=>listeners.get('defaultapps:activated')!())
 await act(async()=>vi.advanceTimersByTimeAsync(60))
 rerender({...options,getVisibleAssociationIDs:()=>new Set([other.id,unresolved.id])})
 act(()=>listeners.get('defaultapps:activated')!())
 await act(async()=>vi.advanceTimersByTimeAsync(39))
 expect(Query).not.toHaveBeenCalled()
 await act(async()=>vi.advanceTimersByTimeAsync(1))
 expect(vi.mocked(Query).mock.calls.map(([a])=>a)).toEqual([pdf.association,other.association])
 expect(result.current.loading).toBe(true)
 await act(async()=>visible.resolve(observation(other.association,2)))
 expect(result.current.loading).toBe(true)
 await act(async()=>selected.resolve(observation(pdf.association,2)))
 expect(result.current.loading).toBe(false)
 act(()=>listeners.get('defaultapps:activated')!())
 unmount()
 expect(listeners.has('defaultapps:activated')).toBe(false)
 await act(async()=>vi.advanceTimersByTimeAsync(100))
 expect(Query).toHaveBeenCalledTimes(2)
})

test.each(['foreground query','change snapshot'])('an older background rejection cannot replace a newer %s observation',async(source)=>{
 const old=deferred()
 vi.mocked(Query).mockImplementation(association=>(association.key===jpeg.association.key?old.promise:Promise.resolve(observation(association))) as ReturnType<typeof Query>)
 const options={selected:pdf,entries:[pdf,jpeg],snapshotObservations:[] as QueryResult[],getVisibleAssociationIDs:()=>new Set([jpeg.id])}
 const {result,rerender}=renderHook(useAssociationQueries,{initialProps:options,wrapper:AssociationQueriesProvider})
 await act(async()=>{})
 if(source==='foreground query'){
  vi.useFakeTimers()
  vi.mocked(Query).mockImplementation(association=>Promise.resolve(observation(association,2)) as ReturnType<typeof Query>)
  act(()=>listeners.get('defaultapps:activated')!())
  await act(async()=>vi.advanceTimersByTimeAsync(100))
 }else rerender({...options,snapshotObservations:[observation(jpeg.association,2)]})
 expect(result.current.observations[jpeg.id]).toEqual(observation(jpeg.association,2))
 await act(async()=>old.reject(new Error('older transport failure')))
 expect(result.current.rowErrors[jpeg.id]).toBeUndefined()
 expect(result.current.observations[jpeg.id]).toEqual(observation(jpeg.association,2))
})

test('StrictMode reconnects once and fences replies from the previous provider lifetime',async()=>{
 const old=deferred(),current=deferred()
 vi.mocked(Query).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
 const options={selected:pdf,entries:[pdf],getVisibleAssociationIDs:()=>new Set<string>()}
 const {result,unmount}=renderHook(()=>useAssociationQueries(options),{wrapper:AssociationQueriesProvider,reactStrictMode:true})
 expect(Query).toHaveBeenCalledTimes(2)
 expect(listeners.size).toBe(2)
 await act(async()=>old.resolve(observation(pdf.association,99)))
 expect(result.current.observations[pdf.id]).toBeUndefined()
 expect(result.current.loading).toBe(true)
 await act(async()=>current.resolve(observation(pdf.association,1)))
 expect(result.current.observations[pdf.id].version).toBe(1)
 expect(result.current.loading).toBe(false)
 unmount();expect(listeners.size).toBe(0)
})
