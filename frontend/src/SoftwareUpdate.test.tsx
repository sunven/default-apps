import {act,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {StrictMode} from 'react'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {Check,Download,GetSnapshot,Restart} from '../bindings/github.com/sunven/default-apps/internal/appupdate/service'
import type {Snapshot} from '../bindings/github.com/sunven/default-apps/internal/appupdate/models'
import {SoftwareUpdate} from './SoftwareUpdate'
import {notify} from './Notifications'

vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()},Browser:{OpenURL:vi.fn(()=>Promise.resolve())}}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/appupdate/service',()=>({Check:vi.fn(),Download:vi.fn(),GetSnapshot:vi.fn(),Restart:vi.fn()}))
vi.mock('./Notifications',async importOriginal=>({...await importOriginal<typeof import('./Notifications')>(),notify:vi.fn()}))
const initial:Snapshot={version:1,currentVersion:'0.1.0',phase:'idle',disabledReason:'',release:null,written:0,total:0,error:'',installPath:'',releaseURL:'https://github.com/sunven/default-apps/releases/latest'}
const available:Snapshot={...initial,version:2,phase:'available',release:{version:'0.2.0',date:'',notes:'修复关联查询\n新增软件更新'}}
let emit:(value:Snapshot)=>void
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(GetSnapshot).mockResolvedValue(initial)
 vi.mocked(Check).mockResolvedValue({...initial,version:2,phase:'checking'})
 vi.mocked(Download).mockResolvedValue({...available,version:3,phase:'downloading'})
 vi.mocked(Restart).mockResolvedValue({...available,version:6,phase:'restarting'})
 vi.mocked(Events.On).mockImplementation((_name,listener)=>{emit=value=>listener({data:value} as never);return()=>{}})
})
async function open(){render(<SoftwareUpdate/>);await userEvent.click(screen.getByRole('button',{name:'软件更新'}));return screen.getByRole('dialog',{name:'软件更新'})}

test('failed initial state offers a single read retry without starting an update',async()=>{
 let finish!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockRejectedValue(new Error('transport disconnected'))
 await open()
 const retry=await screen.findByRole('button',{name:'重试读取更新状态'})
 const before=vi.mocked(GetSnapshot).mock.calls.length
 vi.mocked(GetSnapshot).mockReturnValue(new Promise<Snapshot>(resolve=>{finish=resolve}) as ReturnType<typeof GetSnapshot>)
 await userEvent.dblClick(retry)
 expect(GetSnapshot).toHaveBeenCalledTimes(before+1)
 expect(retry).toHaveAttribute('aria-disabled','true')
 expect(screen.queryByRole('button',{name:'检查更新'})).not.toBeInTheDocument()
 await act(async()=>finish(initial))
 expect(screen.getByRole('button',{name:'检查更新'})).toBeVisible()
 expect(screen.queryByText(/无法读取更新状态/)).not.toBeInTheDocument()
 expect(Check).not.toHaveBeenCalled();expect(Download).not.toHaveBeenCalled();expect(Restart).not.toHaveBeenCalled()
})

test('reopening after a state failure recovers update controls',async()=>{
 vi.mocked(GetSnapshot).mockRejectedValue(new Error('transport disconnected'))
 await open()
 expect(await screen.findByRole('alert')).toHaveTextContent('无法读取更新状态')
 await userEvent.keyboard('{Escape}')
 vi.mocked(GetSnapshot).mockResolvedValue(initial)
 await userEvent.click(screen.getByRole('button',{name:'软件更新'}))
 expect(await screen.findByRole('button',{name:'检查更新'})).toBeVisible()
 expect(screen.queryByText(/无法读取更新状态/)).not.toBeInTheDocument()
 expect(Check).not.toHaveBeenCalled();expect(Download).not.toHaveBeenCalled();expect(Restart).not.toHaveBeenCalled()
})

test('an initial state failure arriving after an event does not show a stale read error',async()=>{
 let fail!:(error:Error)=>void
 vi.mocked(GetSnapshot).mockReturnValue(new Promise<Snapshot>((_resolve,reject)=>{fail=reject}) as ReturnType<typeof GetSnapshot>)
 await open()
 await act(async()=>emit(available))
 await act(async()=>fail(new Error('late failure')))
 expect(screen.getByText('版本 0.2.0')).toBeVisible()
 expect(screen.queryByText(/无法读取更新状态/)).not.toBeInTheDocument()
})

test.each(['snapshot','failure'])('a newer update event survives a late retry %s',async outcome=>{
 let finish!:(value:Snapshot)=>void,fail!:(error:Error)=>void
 vi.mocked(GetSnapshot).mockRejectedValue(new Error('disconnected'))
 await open()
 const retry=await screen.findByRole('button',{name:'重试读取更新状态'})
 vi.mocked(GetSnapshot).mockReturnValue(new Promise<Snapshot>((resolve,reject)=>{finish=resolve;fail=reject}) as ReturnType<typeof GetSnapshot>)
 await userEvent.click(retry)
 await act(async()=>emit({...available,version:9}))
 await act(async()=>{if(outcome==='snapshot')finish(initial);else fail(new Error('late failure'))})
 expect(screen.getByText('版本 0.2.0')).toBeVisible()
 expect(screen.queryByText(/无法读取更新状态/)).not.toBeInTheDocument()
 expect(Check).not.toHaveBeenCalled();expect(Download).not.toHaveBeenCalled();expect(Restart).not.toHaveBeenCalled()
})

test('an abandoned mount cannot supply update state after StrictMode restarts the effect',async()=>{
 let finish!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockReturnValueOnce(new Promise<Snapshot>(resolve=>{finish=resolve}) as ReturnType<typeof GetSnapshot>)
  .mockRejectedValue(new Error('disconnected'))
 render(<StrictMode><SoftwareUpdate/></StrictMode>)
 await userEvent.click(screen.getByRole('button',{name:'软件更新'}))
 const retry=await screen.findByRole('button',{name:'重试读取更新状态'})
 await act(async()=>finish({...available,version:9}))
 expect(screen.queryByRole('button',{name:'检查更新'})).not.toBeInTheDocument()
 vi.mocked(GetSnapshot).mockResolvedValue(initial)
 await userEvent.click(retry)
 expect(await screen.findByRole('button',{name:'检查更新'})).toBeVisible()
 expect(screen.queryByText('版本 0.2.0')).not.toBeInTheDocument()
})

test('available update only downloads on click and restart needs separate confirmation',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue(available)
 const dialog=await open()
 expect(await within(dialog).findByText('版本 0.2.0')).toBeVisible()
 expect(Download).not.toHaveBeenCalled();expect(Restart).not.toHaveBeenCalled()
 await userEvent.click(within(dialog).getByRole('button',{name:'下载更新'}))
 expect(Download).toHaveBeenCalledTimes(1)
 await act(async()=>emit({...available,version:4,phase:'downloading',written:50,total:100}))
 expect(screen.getByRole('progressbar',{name:'更新下载进度'})).toHaveAttribute('aria-valuenow','50')
 await act(async()=>emit({...available,version:5,phase:'ready'}))
 expect(Restart).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'重启安装'}))
 expect(Restart).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'确认重启安装'}))
 expect(Restart).toHaveBeenCalledTimes(1)
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('unknown download size is indeterminate and closing does not cancel work',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...available,phase:'downloading',total:0,written:1024*1024})
 await open()
 expect(await screen.findByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
 expect(screen.getByText('已下载 1.0 MB')).toBeVisible()
 await userEvent.keyboard('{Escape}')
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await act(async()=>emit({...available,version:5,phase:'ready'}))
 await userEvent.click(screen.getByRole('button',{name:'软件更新'}))
 expect(screen.getByRole('button',{name:'重启安装'})).not.toHaveAttribute('aria-disabled','true')
 expect(Restart).not.toHaveBeenCalled()
})

test('late snapshot cannot replace a newer event and manual check survives dismissed notices',async()=>{
 let resolve!:(value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockReturnValue(new Promise<Snapshot>(done=>{resolve=done}) as ReturnType<typeof GetSnapshot>)
 render(<SoftwareUpdate/>)
 await act(async()=>emit(available))
 expect(notify).toHaveBeenCalledTimes(1)
 await act(async()=>resolve(initial))
 await userEvent.click(screen.getByRole('button',{name:'软件更新'}))
 expect(screen.getByText('版本 0.2.0')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'检查更新'}))
 expect(Check).toHaveBeenCalledTimes(1)
 await act(async()=>emit({...available,version:4}))
 expect(screen.getByRole('button',{name:'下载更新'})).not.toHaveAttribute('aria-disabled','true')
})

test('download errors offer retry and development mode has no update actions',async()=>{
 vi.mocked(GetSnapshot).mockResolvedValue({...available,error:'SHA-256 校验失败'})
 await open()
 expect(await screen.findByRole('alert')).toHaveTextContent('SHA-256 校验失败')
 await userEvent.click(screen.getByRole('button',{name:'重试下载'}))
 expect(Download).toHaveBeenCalledTimes(1)
 await act(async()=>emit({...initial,version:7,phase:'disabled',disabledReason:'开发版本不检查或安装更新。'}))
 expect(screen.getByText('开发版本不检查或安装更新。')).toBeVisible()
 expect(screen.queryByRole('button',{name:'检查更新'})).not.toBeInTheDocument()
})
