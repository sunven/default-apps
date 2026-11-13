import {afterEach,expect,test,vi} from 'vitest'
import {AssociationQueries,type QueryAdapter} from './associationQueries'
import type {Association,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'

const association=(key:string):Association=>({kind:'file',key})
const pdf=association('pdf')
const value=(a=pdf,version=1):QueryResult=>({association:a,version,default:{known:true,app:null,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[],observedAt:'now',stale:false,error:null}})
function deferred(){
 let resolve!:(result:QueryResult)=>void,reject!:(error:Error)=>void
 const promise=new Promise<QueryResult>((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
const modules:AssociationQueries[]=[]
function setup(){
 const calls:{association:Association;reply:ReturnType<typeof deferred>}[]=[]
 let publish!:(result:QueryResult)=>void
 const off=vi.fn()
 const adapter:QueryAdapter={query:vi.fn(a=>{const reply=deferred();calls.push({association:a,reply});return reply.promise}),subscribe:vi.fn(accept=>{publish=accept;return off})}
 const queries=new AssociationQueries(adapter);queries.start();modules.push(queries)
 return {queries,calls,adapter,off,publish:(result:QueryResult)=>publish(result)}
}
afterEach(()=>{for(const queries of modules.splice(0))queries.stop()})

test('two consumers share a query; closing one preserves the other and its observation',async()=>{
 const {queries,calls}=setup()
 const browser=queries.watch([pdf],'selected'),panel=queries.watch([pdf])
 expect(calls).toHaveLength(1)
 browser.close()
 calls[0].reply.resolve(value());await panel.ready
 expect(queries.getSnapshot().observations['file:pdf']).toEqual(value())
 expect(queries.getSnapshot().pending['file:pdf']).toBeUndefined()
 panel.close()
})

test('a global background budget prioritizes panel demand and removes closed queued work',async()=>{
 const {queries,calls}=setup()
 const background=queries.watch(Array.from({length:8},(_,i)=>association(String(i))),'background')
 const panel=queries.watch([pdf])
 expect(calls).toHaveLength(4)
 calls[0].reply.resolve(value(calls[0].association));await Promise.resolve();await Promise.resolve()
 expect(calls).toHaveLength(5)
 expect(calls[4].association).toEqual(pdf)
 background.close()
 calls[4].reply.resolve(value());await panel.ready
 expect(calls).toHaveLength(5)
})

test('explicit refresh bypasses obsolete work and all waiters follow its result',async()=>{
 const {queries,calls}=setup()
 const background=queries.watch([pdf],'background'),panel=queries.watch([pdf])
 const refreshed=panel.refresh()
 expect(calls).toHaveLength(2)
 calls[1].reply.resolve(value(pdf,2));await refreshed;await background.ready;await panel.ready
 calls[0].reply.reject(new Error('old failure'));await Promise.resolve()
 expect(queries.getSnapshot().observations['file:pdf'].version).toBe(2)
 expect(queries.getSnapshot().rowErrors['file:pdf']).toBeUndefined()
})

test('reopening displays the cached observation while refreshing, and a failure retains it',async()=>{
 const {queries,calls}=setup()
 const first=queries.watch([pdf]);calls[0].reply.resolve(value());await first.ready;first.close()
 const reopened=queries.watch([pdf])
 expect(calls).toHaveLength(2)
 expect(queries.getSnapshot().observations['file:pdf']).toEqual(value())
 expect(queries.getSnapshot().pending['file:pdf']).toBe(true)
 calls[1].reply.reject(new Error('offline'));await reopened.ready
 expect(queries.getSnapshot().observations['file:pdf']).toEqual(value())
 expect(queries.getSnapshot().rowErrors['file:pdf']).toBe('offline')
})

test('new events fence old snapshots, superseded replies and unversioned errors',async()=>{
 const {queries,calls,publish}=setup()
 const watch=queries.watch([pdf])
 publish(value(pdf,5));queries.accept(value(pdf,1))
 calls[0].reply.reject(new Error('obsolete'));await watch.ready
 const refresh=watch.refresh()
 publish(value(pdf,6))
 calls[1].reply.resolve({...value(pdf,9),superseded:true});await refresh
 expect(queries.getSnapshot().observations['file:pdf'].version).toBe(6)
 expect(queries.getSnapshot().rowErrors['file:pdf']).toBeUndefined()
})

test('a superseded refresh cannot present a cached observation as freshly queried',async()=>{
 const {queries,calls,publish}=setup()
 publish(value())
 const watch=queries.watch([pdf])
 calls[0].reply.resolve({...value(),superseded:true});await watch.ready
 expect(queries.getSnapshot().observations['file:pdf']).toEqual(value())
 expect(queries.getSnapshot().rowErrors['file:pdf']).toContain('请重新查询')
})

test('default and candidate failures preserve their independent known observations',async()=>{
 const {queries,calls,publish}=setup()
 publish(value(pdf,1))
 const watch=queries.watch([pdf])
 const partial={...value(pdf,2),candidates:{...value().candidates,stale:true,error:{message:'candidates failed'}}}
 calls[0].reply.resolve(partial);await watch.ready
 expect(queries.getSnapshot().observations['file:pdf'].default.error).toBeNull()
 expect(queries.getSnapshot().observations['file:pdf'].candidates).toEqual(partial.candidates)
})

test('a stopped lifetime cannot contaminate a restarted module or consume its budget',async()=>{
 const {queries,calls,off}=setup()
 const previous=queries.watch([pdf],'background')
 queries.stop();queries.start()
 const current=queries.watch([pdf],'background')
 previous.close()
 calls[0].reply.resolve(value(pdf,99));await previous.ready;await Promise.resolve()
 expect(queries.getSnapshot().observations['file:pdf']).toBeUndefined()
 expect(queries.getSnapshot().pending['file:pdf']).toBe(true)
 calls[1].reply.resolve(value(pdf,1));await current.ready
 expect(queries.getSnapshot().observations['file:pdf'].version).toBe(1)
 expect(off).toHaveBeenCalledOnce()
})
