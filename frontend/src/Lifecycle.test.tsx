import {act,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {GetSnapshot,Requery,Submit,RespondQuit} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {Snapshot,Request} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import {useChanges} from './Changes'
import {LifecycleStatus,useRecoveryAction} from './Lifecycle'
vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({GetSnapshot:vi.fn(),Submit:vi.fn(),Requery:vi.fn(),RespondQuit:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))
const association={kind:'file',key:'com.adobe.pdf'}
const copy={path:'/Applications/OldTarget.app',displayPath:'/Applications/OldTarget.app',name:'Old target',version:'1',bundleID:'test.old'}
const nextCopy={...copy,path:'/Applications/NewTarget.app'}
const observation={known:true,app:copy,observedAt:'now',error:null,stale:false}
const request:Request={requestID:'old',association,target:copy,preflight:observation,phase:'recovered',acceptedAt:'then',submittedAt:'',completion:{known:false,error:null,completedAt:''},readback:{state:'unknown',observation},confirmed:false,storageError:null}
const recovered:Snapshot={version:2,busy:false,batchBlocked:false,activeRequestID:'',requests:[request],observations:[{association,default:observation,candidates:{known:true,apps:[],observedAt:'now',error:null,stale:false},version:1}],writableKinds:['file'],storageError:null,recovery:{record:request,ready:true},quit:{prompt:false,promptID:0,exiting:false}}
let notify:(event:{data:Snapshot})=>void
beforeEach(()=>{vi.resetAllMocks();vi.mocked(GetSnapshot).mockResolvedValue(recovered);vi.mocked(Requery).mockResolvedValue(recovered);vi.mocked(RespondQuit).mockResolvedValue(recovered);vi.mocked(Events.On).mockImplementation((_name,fn)=>{notify=fn as typeof notify;return ()=>{}})})
function Screen(){const changes=useChanges();const recovery=useRecoveryAction(changes);return <><button disabled={changes.blocked} onClick={()=>recovery.submit(association,nextCopy,observation)}>修改</button><LifecycleStatus changes={changes}/>{recovery.dialog}</>}
test('recovered current observation stays separate and Escape never submits a replacement',async()=>{
 render(<Screen/>);expect(await screen.findByText('上次修改结果未知')).toBeVisible();expect(screen.getByText(/当前观察：/)).toHaveTextContent(copy.path)
 await userEvent.click(screen.getByRole('button',{name:'修改'}))
 const dialog=screen.getByRole('dialog',{name:'上次修改仍可能完成'})
 expect(within(dialog).getByText(/旧目标：/)).toHaveTextContent(copy.path)
 expect(within(dialog).getByText(/新目标：/)).toHaveTextContent(nextCopy.path)
 expect(within(dialog).getByRole('heading',{name:'上次修改仍可能完成'})).toHaveFocus()
 await userEvent.keyboard('{Escape}')
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(Submit).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'修改'})).toHaveFocus()
})
test('explicit replacement supplies old request identity once and failed query blocks the action',async()=>{
 vi.mocked(Submit).mockResolvedValue({outcome:'accepted',message:'',request:{...request,requestID:'new',phase:'accepted'},snapshot:{...recovered,version:4,recovery:null,busy:true},observation:null})
 render(<Screen/>);await screen.findByText('上次修改结果未知')
 await userEvent.click(screen.getByRole('button',{name:'修改'}));await userEvent.click(screen.getByRole('button',{name:'返回'}));expect(Submit).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'修改'}));await userEvent.click(screen.getByRole('button',{name:'明确提交新修改'}))
 expect(Submit).toHaveBeenCalledTimes(1);expect(vi.mocked(Submit).mock.calls[0][0]).toMatchObject({recoveryRequestID:'old',targetPath:nextCopy.path})
 await act(async()=>notify({data:{...recovered,version:5,busy:true,recovery:{record:request,ready:false},observations:[{...recovered.observations![0],default:{...observation,error:{message:'offline'},stale:true}}]}}))
 expect(screen.getByRole('button',{name:'修改'})).toBeDisabled();expect(screen.getByText(/当前查询失败：offline/)).toBeVisible();expect(screen.getByRole('button',{name:'重新查询当前默认'})).toBeEnabled()
})
test('one quit prompt supports Escape stay and explicit exit by current prompt identity',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...recovered,busy:true,quit:{prompt:true,promptID:7,exiting:false}})
 render(<Screen/>);const dialog=await screen.findByRole('dialog',{name:'修改结果仍未确定'})
 expect(within(dialog).getByText(/系统可能在退出后完成修改/)).toBeVisible()
 expect(screen.getAllByRole('dialog')).toHaveLength(1)
 await userEvent.keyboard('{Escape}');expect(RespondQuit).toHaveBeenLastCalledWith(7,false)
 await act(async()=>notify({data:{...recovered,version:8,quit:{prompt:true,promptID:7,exiting:false}}}))
 await userEvent.click(screen.getByRole('button',{name:'仍然退出'}));expect(RespondQuit).toHaveBeenLastCalledWith(7,true)
})
test('completion updates the open quit explanation without another prompt or automatic exit',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...recovered,recovery:null,busy:true,quit:{prompt:true,promptID:9,exiting:false}})
 render(<Screen/>);await screen.findByRole('dialog',{name:'修改结果仍未确定'})
 await act(async()=>notify({data:{...recovered,recovery:null,version:10,busy:false,quit:{prompt:true,promptID:9,exiting:false},requests:[{...request,phase:'resolved',completion:{known:true,error:null,completedAt:'now'},readback:{state:'valid',observation},confirmed:true}]}}))
 expect(screen.getByRole('dialog',{name:'修改结果已可查看'})).toBeVisible();expect(screen.getAllByRole('dialog')).toHaveLength(1)
 expect(screen.queryByText(/上次修改仍按结果未知显示/)).not.toBeInTheDocument();expect(RespondQuit).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'仍然退出'}));expect(RespondQuit).toHaveBeenCalledWith(9,true)
})

test('update quit warning uses restart intent and Escape stays without starting installation',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...recovered,busy:true,quit:{prompt:true,promptID:11,exiting:false,intent:'update'}})
 render(<Screen/>);const dialog=await screen.findByRole('dialog',{name:'重启安装前确认'})
 expect(within(dialog).getByText(/系统可能在退出后完成修改/)).toBeVisible()
 expect(within(dialog).getByRole('button',{name:'仍然重启安装'})).toBeVisible()
 await userEvent.keyboard('{Escape}')
 expect(RespondQuit).toHaveBeenLastCalledWith(11,false)
})
