import {act,render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {GetSnapshot,Submit,Requery} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import {ChangeStatus,useChanges} from './Changes'
vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({GetSnapshot:vi.fn(),Submit:vi.fn(),Requery:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))
const copy={path:'/Applications/Reader.app',displayPath:'/Applications/Reader.app',name:'Reader',version:'2',bundleID:'test.reader'}
const association={kind:'file',key:'com.adobe.pdf'}
const observation={known:true,app:null,observedAt:'2026-11-06T00:00:00Z',error:null,stale:false}
const empty:Snapshot={version:1,busy:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file','scheme'],storageError:null}
const request:Request={requestID:'one',association,target:copy,preflight:observation,phase:'accepted',acceptedAt:'now',submittedAt:'',completion:{known:false,error:null,completedAt:''},readback:{state:'pending',observation},confirmed:false,storageError:null}
let notify:(event:{data:Snapshot})=>void
beforeEach(()=>{vi.resetAllMocks();vi.mocked(GetSnapshot).mockResolvedValue(empty);vi.mocked(Events.On).mockImplementation((_name,fn)=>{notify=fn as typeof notify;return ()=>{}})})
function Screen(){const changes=useChanges();return <><button disabled={changes.blocked} onClick={()=>void changes.submit(association,copy,observation)}>修改</button><ChangeStatus changes={changes} onReturn={()=>{}}/></>}
test('explicit action sends one canonical copy and shows accepted separately from submitted',async()=>{
 vi.mocked(Submit).mockResolvedValue({outcome:'accepted',message:'',request,snapshot:{...empty,version:2,busy:true,activeRequestID:'one',requests:[request]},observation:null})
 render(<Screen/>);await userEvent.click(screen.getByRole('button',{name:'修改'}));
 expect(Submit).toHaveBeenCalledTimes(1);expect(vi.mocked(Submit).mock.calls[0][0]).toMatchObject({association,targetPath:copy.path,expected:{known:true,path:''}})
 expect(await screen.findByText('已受理 · 等待提交系统')).toBeVisible();expect(screen.getByText(copy.path)).toBeVisible();expect(screen.getByRole('button',{name:'修改'})).toBeDisabled()
 await act(async()=>notify({data:{...empty,version:3,busy:true,activeRequestID:'one',requests:[{...request,phase:'submitted',submittedAt:'now'}]}}))
 expect(screen.getByText('已提交系统 · 等待系统返回')).toBeVisible()
})
test('native error and failed readback preserve actual facts and retry never submits again',async()=>{
 const failed={...request,phase:'completed',completion:{known:true,error:{domain:'NativeDomain',code:91,description:'Denied by system'},completedAt:'now'},readback:{state:'failed',observation:{...observation,stale:true,error:{message:'Query failed'}}}}
 vi.mocked(GetSnapshot).mockResolvedValue({...empty,version:5,busy:true,activeRequestID:'one',requests:[failed]})
 vi.mocked(Requery).mockResolvedValue({...empty,version:6,requests:[{...failed,phase:'resolved',readback:{state:'valid',observation:{...observation,app:copy}}}]})
 render(<Screen/>);expect(await screen.findByText('系统已返回 · 回读失败，等待重查')).toBeVisible()
 expect(screen.getByText('NativeDomain · 91 · Denied by system')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'重新回读'}));expect(Requery).toHaveBeenCalledWith(association);expect(Submit).not.toHaveBeenCalled()
 expect(await screen.findByText('系统返回错误 · 已读取实际默认')).toBeVisible();expect(screen.queryByText('已确认本次修改')).not.toBeInTheDocument()
})
test('known success and separate clear error survive an older event',async()=>{
 const confirmed={...request,phase:'resolved',confirmed:true,completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation:{...observation,app:copy}},storageError:{operation:'clear',message:'Disk full'}}
 vi.mocked(GetSnapshot).mockResolvedValue({...empty,version:9,requests:[confirmed]})
 render(<Screen/>);expect(await screen.findByText('已确认本次修改')).toBeVisible();expect(screen.getByText(/未定记录清除失败：Disk full/)).toBeVisible()
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
