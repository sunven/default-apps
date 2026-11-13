import {act,render,renderHook,screen,waitFor,within} from '@testing-library/react'
import {StrictMode} from 'react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {GetSnapshot,Submit,Requery,ReconcileSubmission} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import {ChangeStatus,useChanges} from './Changes'
import {NotificationHost} from './Notifications'
vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({GetSnapshot:vi.fn(),Submit:vi.fn(),Requery:vi.fn(),ReconcileSubmission:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))
const copy={path:'/Applications/Reader.app',displayPath:'/Applications/Reader.app',name:'Reader',version:'2',bundleID:'test.reader'}
const association={kind:'file',key:'com.adobe.pdf'}
const observation={known:true,app:null,observedAt:'2026-11-06T00:00:00Z',error:null,stale:false}
const empty:Snapshot={version:1,busy:false,batchBlocked:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file','scheme'],storageError:null,recovery:null,quit:{prompt:false,promptID:0,exiting:false}}
const request:Request={requestID:'one',association,target:copy,preflight:observation,phase:'accepted',acceptedAt:'now',submittedAt:'',completion:{known:false,error:null,completedAt:''},readback:{state:'pending',observation},confirmed:false,storageError:null}
let notify:(event:{data:Snapshot})=>void
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();vi.mocked(GetSnapshot).mockResolvedValue(empty);vi.mocked(Events.On).mockImplementation((_name,fn)=>{notify=fn as typeof notify;return ()=>{}})})
function Screen(){const changes=useChanges();return <><NotificationHost/><button disabled={changes.blocked} onClick={()=>void changes.submit(association,copy,observation)}>修改</button><ChangeStatus changes={changes} onReturn={()=>{}}/></>}
test('failed initial state can be retried without writes or replaying completed history',async()=>{
 let finish!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockRejectedValueOnce(new Error('transport disconnected'))
  .mockReturnValueOnce(new Promise<Snapshot>(resolve=>{finish=resolve}) as ReturnType<typeof GetSnapshot>)
 render(<Screen/>)
 const retry=await screen.findByRole('button',{name:'重试读取修改状态'})
 expect(screen.getByRole('button',{name:'修改'})).toBeDisabled()
 await userEvent.dblClick(retry)
 expect(GetSnapshot).toHaveBeenCalledTimes(2)
 expect(retry).toHaveAttribute('aria-disabled','true')
 expect(screen.getByRole('button',{name:'修改'})).toBeDisabled()
 await act(async()=>finish({...empty,requests:[{...request,phase:'resolved',confirmed:true}]}))
 expect(screen.getByRole('button',{name:'修改'})).toBeEnabled()
 expect(screen.queryByText(/无法读取修改状态/)).not.toBeInTheDocument()
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
 expect(Submit).not.toHaveBeenCalled()
 expect(Requery).not.toHaveBeenCalled()
 expect(ReconcileSubmission).not.toHaveBeenCalled()
})

test('an initial state failure arriving after an event does not show a stale read error',async()=>{
 let fail!:(error:Error)=>void
 vi.mocked(GetSnapshot).mockReturnValue(new Promise<Snapshot>((_resolve,reject)=>{fail=reject}) as ReturnType<typeof GetSnapshot>)
 const {result}=renderHook(()=>useChanges())
 await act(async()=>notify({data:{...empty,version:9}}))
 await act(async()=>fail(new Error('late failure')))
 expect(result.current.blocked).toBe(false)
 expect(result.current.message).toBe('')
 expect(result.current.snapshotError).toBe('')
})

test.each(['snapshot','failure'])('a newer change event survives a late retry %s',async outcome=>{
 let finish!:(value:Snapshot)=>void,fail!:(error:Error)=>void
 vi.mocked(GetSnapshot).mockRejectedValueOnce(new Error('disconnected'))
  .mockReturnValueOnce(new Promise<Snapshot>((resolve,reject)=>{finish=resolve;fail=reject}) as ReturnType<typeof GetSnapshot>)
 const {result}=renderHook(()=>useChanges())
 await waitFor(()=>expect(result.current.snapshotError).toContain('disconnected'))
 act(()=>{void result.current.retrySnapshot()})
 await act(async()=>notify({data:{...empty,version:9,busy:true}}))
 await act(async()=>{if(outcome==='snapshot')finish(empty);else fail(new Error('late failure'))})
 expect(result.current.state?.version).toBe(9)
 expect(result.current.blocked).toBe(true)
 expect(result.current.snapshotError).toBe('')
 expect(Submit).not.toHaveBeenCalled()
})

test('an abandoned mount cannot supply change state after StrictMode restarts the effect',async()=>{
 let finish!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockReturnValueOnce(new Promise<Snapshot>(resolve=>{finish=resolve}) as ReturnType<typeof GetSnapshot>)
  .mockRejectedValueOnce(new Error('disconnected'))
 const {result}=renderHook(()=>useChanges(),{wrapper:StrictMode})
 await waitFor(()=>expect(result.current.snapshotError).toContain('disconnected'))
 await act(async()=>finish({...empty,version:9}))
 expect(result.current.blocked).toBe(true)
 expect(result.current.state).toBeNull()
 vi.mocked(GetSnapshot).mockResolvedValue(empty)
 await act(async()=>result.current.retrySnapshot())
 expect(result.current.state?.version).toBe(1)
 expect(result.current.blocked).toBe(false)
})

test('completed items from an earlier batch do not become single-change notifications',async()=>{
 render(<Screen/>);await waitFor(()=>expect(screen.getByRole('button',{name:'修改'})).toBeEnabled())
 const completed={...request,batchID:'previous-batch',phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}}}
 await act(async()=>notify({data:{...empty,version:2,requests:[completed]}}))
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
 await act(async()=>notify({data:{...empty,version:3,requests:[completed,{...request,requestID:'single'}]}}))
 expect(await screen.findByText('已受理 · 等待提交系统')).toBeVisible()
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
})
test('explicit action sends one canonical copy and shows accepted separately from submitted',async()=>{
 vi.mocked(Submit).mockResolvedValue({outcome:'accepted',message:'',request,snapshot:{...empty,version:2,busy:true,activeRequestID:'one',requests:[request]},observation:null})
 render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}));
 expect(Submit).toHaveBeenCalledTimes(1);expect(vi.mocked(Submit).mock.calls[0][0]).toMatchObject({association,targetPath:copy.path,expected:{known:true,path:''}})
 const accepted=await screen.findByText('已受理 · 等待提交系统')
 expect(within(accepted.closest('li')!).getByText(copy.path)).toBeVisible();expect(screen.getByRole('button',{name:'修改'})).toBeDisabled()
 await act(async()=>notify({data:{...empty,version:3,busy:true,activeRequestID:'one',requests:[{...request,phase:'submitted',submittedAt:'now'}]}}))
 expect(await screen.findByText('已提交系统 · 等待系统返回')).toBeVisible()
})
test.each([association,{kind:'scheme',key:'test-error-scheme'}])('native error and failed readback preserve actual facts and retry never submits again: $kind',async currentAssociation=>{
 const failed={...request,association:currentAssociation,phase:'completed',completion:{known:true,error:{domain:'NativeDomain',code:91,description:'Denied by system'},completedAt:'now'},readback:{state:'failed',observation:{...observation,stale:true,error:{message:'Query failed'}}}}
 vi.mocked(GetSnapshot).mockResolvedValue({...empty,version:5,busy:true,activeRequestID:'one',requests:[failed]})
 vi.mocked(Requery).mockResolvedValue({...empty,version:6,requests:[{...failed,phase:'resolved',readback:{state:'valid',observation:{...observation,app:copy}}}]})
 render(<Screen/>);expect(await screen.findByText('系统已返回 · 回读失败，等待重查')).toBeVisible()
 expect(screen.getByText('NativeDomain · 91 · Denied by system')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'重新回读'}));expect(Requery).toHaveBeenCalledWith(currentAssociation);expect(Submit).not.toHaveBeenCalled()
 expect(await screen.findByText('系统返回错误 · 已读取实际默认')).toBeVisible();expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
})
test('known success and separate clear error survive an older event',async()=>{
 const confirmed={...request,phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}},storageError:{operation:'clear',message:'Disk full'}}
 render(<Screen/>);await waitFor(()=>expect(screen.getByRole('button',{name:'修改'})).toBeEnabled())
 await act(async()=>notify({data:{...empty,version:9,requests:[confirmed]}}))
 expect(await screen.findByText('已确认本次修改')).toBeVisible();expect(screen.getByText(/未定记录清除失败：Disk full/)).toBeVisible()
 await act(async()=>notify({data:{...empty,version:8,busy:true,activeRequestID:'one',requests:[request]}}))
 expect(screen.getByText('已确认本次修改')).toBeVisible();expect(screen.getByRole('button',{name:'修改'})).toBeEnabled()
})
test('save and preflight rejection show not submitted and keep explicit action available',async()=>{
 vi.mocked(Submit).mockResolvedValue({outcome:'storage_error',message:'未提交：无法保存未定记录',request:null,snapshot:{...empty,version:2},observation:null})
 render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}));expect(await screen.findByText('未提交：无法保存未定记录')).toBeVisible();expect(screen.getByRole('button',{name:'修改'})).toBeEnabled();expect(screen.queryByText('已受理 · 等待提交系统')).not.toBeInTheDocument()
})
test('one missing snapshot after a lost submit reply cannot permit a duplicate action',async()=>{
 vi.mocked(Submit).mockRejectedValue(new Error('transport disconnected'))
 render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}));await userEvent.click(await screen.findByRole('button',{name:'查看原请求状态'}))
 expect(screen.getByRole('button',{name:'修改'})).toBeDisabled();expect(screen.getByRole('button',{name:'查看原请求状态'})).toBeVisible();expect(Submit).toHaveBeenCalledTimes(1)
})

test('reload reconciles the original parameters without a second submission',async()=>{
 vi.mocked(Submit).mockRejectedValue(new Error('reply lost'))
 vi.mocked(ReconcileSubmission).mockResolvedValue({state:'pending',result:null,snapshot:empty})
 const first=render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}))
 const original=vi.mocked(Submit).mock.calls[0][0]
 expect(await screen.findByRole('button',{name:'查看原请求状态'})).toBeVisible()
 first.unmount()
 const restored={...empty,version:10,busy:true,activeRequestID:original.requestID,requests:[{...request,requestID:original.requestID}]}
 vi.mocked(ReconcileSubmission).mockResolvedValue({state:'decided',result:{outcome:'existing',message:'',request:{...request,requestID:original.requestID},snapshot:restored,observation:null},snapshot:restored})
 render(<Screen/>);expect(await screen.findByText('已受理 · 等待提交系统')).toBeVisible()
 expect(ReconcileSubmission).toHaveBeenLastCalledWith(original);expect(Submit).toHaveBeenCalledTimes(1)
 expect(screen.queryByRole('button',{name:'查看原请求状态'})).not.toBeInTheDocument()
})

test('a newer accepted event ends reply uncertainty even while an older reconciliation is still pending',async()=>{
 let resolve!:(value:any)=>void
 vi.mocked(Submit).mockRejectedValue(new Error('reply lost'))
 vi.mocked(ReconcileSubmission).mockReturnValue(new Promise(r=>{resolve=r}) as ReturnType<typeof ReconcileSubmission>)
 render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}))
 const original=vi.mocked(Submit).mock.calls[0][0]
 await act(async()=>notify({data:{...empty,version:8,busy:true,activeRequestID:original.requestID,requests:[{...request,requestID:original.requestID}]}}))
 await act(async()=>resolve({state:'pending',result:null,snapshot:empty}))
 expect(await screen.findByText('已受理 · 等待提交系统')).toBeVisible()
 expect(screen.queryByRole('button',{name:'查看原请求状态'})).not.toBeInTheDocument()
 expect(screen.queryByText('原请求仍在核对受理条件，受理结果待确认。')).not.toBeInTheDocument()
})

test('an immediate completion event survives the later initial snapshot and duplicate notifications',async()=>{
 let finish!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockReturnValue(new Promise(resolve=>{finish=resolve}) as ReturnType<typeof GetSnapshot>)
 const confirmed={...request,phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}}}
 render(<Screen/>)
 await act(async()=>notify({data:{...empty,version:12,requests:[confirmed]}}))
 await act(async()=>{finish({...empty,version:3,busy:true,activeRequestID:'one',requests:[request]});notify({data:{...empty,version:12,requests:[confirmed]}})})
 expect(await screen.findByText('已确认本次修改')).toBeVisible();expect(screen.queryByText('已受理 · 等待提交系统')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'修改'})).toBeEnabled();expect(Submit).not.toHaveBeenCalled()
})

test('external refresh updates the displayed actual default while preserving the original completed request',async()=>{
 const confirmed={...request,phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}}}
 render(<Screen/>);await waitFor(()=>expect(screen.getByRole('button',{name:'修改'})).toBeEnabled())
 await act(async()=>notify({data:{...empty,version:9,requests:[confirmed]}}));await screen.findByText('已确认本次修改')
 await act(async()=>notify({data:{...empty,version:10,requests:[confirmed],observations:[{association,version:2,default:{...observation,app:{...copy,path:'/External/Reader.app'}},candidates:{known:true,apps:[],error:null,stale:false,observedAt:'now'}}]}}))
 expect(await screen.findByText('实际默认：/External/Reader.app')).toBeVisible()
 expect(screen.getByText(copy.path)).toBeVisible();expect(screen.getByText('已确认本次修改')).toBeVisible();expect(Submit).not.toHaveBeenCalled()
})

function CrossKindScreen(){const changes=useChanges();return <><NotificationHost/>
 <button disabled={changes.blocked} onClick={()=>void changes.submit({kind:'scheme',key:'http'},copy,observation)}>修改 http</button>
 <button disabled={changes.blocked} onClick={()=>void changes.submit({kind:'scheme',key:'https'},copy,observation)}>修改 https</button>
 <button disabled={changes.blocked} onClick={()=>void changes.submit(association,copy,observation)}>修改文件类型</button>
 <ChangeStatus changes={changes} onReturn={()=>{}}/></>}
test('scheme submission and reload preserve its identity and block file and other scheme writes until readback',async()=>{
 const scheme={kind:'scheme',key:'http'}
 const pending={...request,association:scheme,phase:'submitted'}
 const state={...empty,version:2,busy:true,activeRequestID:'one',requests:[pending]}
 vi.mocked(Submit).mockResolvedValue({outcome:'accepted',message:'',request:pending,snapshot:state,observation:null})
 const page=render(<CrossKindScreen/>);await userEvent.click(screen.getByRole('button',{name:'修改 http'}))
 expect(Submit).toHaveBeenCalledTimes(1)
 expect(vi.mocked(Submit).mock.calls[0][0].association).toEqual(scheme)
 for(const name of ['修改 http','修改 https','修改文件类型'])expect(screen.getByRole('button',{name})).toBeDisabled()
 const original=vi.mocked(Submit).mock.calls[0][0]
 page.unmount();vi.mocked(GetSnapshot).mockResolvedValue(state)
 render(<CrossKindScreen/>);expect(await screen.findByText('已提交系统 · 等待系统返回')).toBeVisible()
 for(const name of ['修改 http','修改 https','修改文件类型'])expect(screen.getByRole('button',{name})).toBeDisabled()
 const failed={...pending,phase:'completed',completion:{known:true,error:null,completedAt:'now'},readback:{state:'failed',observation:{...observation,stale:true,error:{message:'Scheme query failed'}}}}
 await act(async()=>notify({data:{...state,version:3,requests:[failed]}}))
 expect(screen.getByRole('button',{name:'修改文件类型'})).toBeDisabled()
 vi.mocked(Requery).mockResolvedValue({...state,version:4,busy:false,batchBlocked:false,activeRequestID:'',requests:[{...failed,phase:'resolved',confirmed:true,readback:{state:'valid',observation:{...observation,app:copy}}}]})
 await userEvent.click(await screen.findByRole('button',{name:'重新回读'}))
 expect(Requery).toHaveBeenCalledWith(scheme);expect(Submit).toHaveBeenCalledTimes(1)
 expect(vi.mocked(Submit).mock.calls[0][0]).toEqual(original)
 expect(await screen.findByText('已确认本次修改')).toBeVisible()
 for(const name of ['修改 http','修改 https','修改文件类型'])expect(screen.getByRole('button',{name})).toBeEnabled()
})

test('closing progress does not unlock writes or replay on unrelated snapshots; a new result can notify once',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...empty,version:2,busy:true,activeRequestID:'one',requests:[request]})
 render(<StrictMode><Screen/></StrictMode>)
 await screen.findByText('已受理 · 等待提交系统')
 await userEvent.click(screen.getByRole('button',{name:'关闭通知'}))
 await waitFor(()=>expect(screen.queryByText('已受理 · 等待提交系统')).not.toBeInTheDocument())
 expect(screen.getByRole('button',{name:'修改'})).toBeDisabled()
 await act(async()=>notify({data:{...empty,version:3,busy:true,activeRequestID:'one',requests:[request]}}))
 expect(screen.queryByText('已受理 · 等待提交系统')).not.toBeInTheDocument()
 const confirmed={...request,phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}}}
 await act(async()=>notify({data:{...empty,version:4,requests:[confirmed]}}))
 expect(await screen.findByText('已确认本次修改')).toBeVisible()
 await act(async()=>notify({data:{...empty,version:5,requests:[confirmed]}}))
 expect(screen.getAllByText('已确认本次修改')).toHaveLength(1)
 await userEvent.click(screen.getByRole('button',{name:'关闭通知'}))
 await waitFor(()=>expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument())
 await act(async()=>notify({data:{...empty,version:6,requests:[confirmed],observations:[{association,version:2,default:{...observation,app:{...copy,path:'/Other.app'}},candidates:{known:true,apps:[],error:null,stale:false,observedAt:'now'}}]}}))
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'修改'})).toBeEnabled()
 expect(Submit).not.toHaveBeenCalled()
})

test('initial completed history stays silent while configuration problems remain visible',async()=>{
 const confirmed={...request,phase:'resolved',confirmed:true,storageError:{operation:'clear',message:'Disk full'}}
 vi.mocked(GetSnapshot).mockResolvedValue({...empty,version:8,requests:[confirmed]})
 render(<Screen/>)
 expect(await screen.findByRole('alert')).toHaveTextContent('未定记录清除失败：Disk full')
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
 await act(async()=>notify({data:{...empty,version:9,requests:[confirmed]}}))
 expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
})
