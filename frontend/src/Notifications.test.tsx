import {useState} from 'react'
import {act,fireEvent,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,expect,test,vi} from 'vitest'
import {NotificationHost,notify} from './Notifications'
import {Dialog} from './Dialog'

afterEach(()=>vi.useRealTimers())

test('success closes after four seconds while errors and progress remain manually dismissible',async()=>{
 render(<NotificationHost/>)
 vi.useFakeTimers()
 act(()=>{
  notify('pending','等待系统',{id:'progress'})
  notify('error','操作失败',{id:'error'})
  notify('success','保存成功',{id:'success'})
 })
 await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
 expect(screen.getAllByRole('button',{name:'关闭通知'})).toHaveLength(3)
 await act(async()=>{await vi.advanceTimersByTimeAsync(3998)})
 expect(screen.getByText('保存成功')).toBeInTheDocument()
 await act(async()=>{await vi.advanceTimersByTimeAsync(500)})
 expect(screen.queryByText('保存成功')).not.toBeInTheDocument()
 await act(async()=>{await vi.advanceTimersByTimeAsync(15000)})
 expect(screen.getByText('操作失败')).toBeInTheDocument()
 const progress=screen.getByText('等待系统').closest('li')!
 fireEvent.click(within(progress).getByRole('button',{name:'关闭通知'}))
 await act(async()=>{await vi.advanceTimersByTimeAsync(500)})
 expect(screen.queryByText('等待系统')).not.toBeInTheDocument()
 expect(screen.getByText('操作失败')).toBeInTheDocument()
})

test('a result arriving during the close animation survives the old progress removal timer',async()=>{
 render(<NotificationHost/>)
 vi.useFakeTimers()
 act(()=>{notify('pending','等待回读',{id:'quick-result'})})
 await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
 fireEvent.click(screen.getByRole('button',{name:'关闭通知'}))
 act(()=>{notify('success','回读成功',{id:'quick-result'})})
 await act(async()=>{await vi.advanceTimersByTimeAsync(500)})
 expect(screen.queryByText('等待回读')).not.toBeInTheDocument()
 expect(screen.getByText('回读成功')).toBeInTheDocument()
})

function DialogScreen(){
 const [first,setFirst]=useState(false),[second,setSecond]=useState(false)
 return <><NotificationHost/><button onClick={()=>setFirst(true)}>打开弹窗</button>
  {first?<Dialog title="第一层" onClose={()=>setFirst(false)}><button onClick={()=>setSecond(true)}>再开一层</button></Dialog>:null}
  {second?<Dialog title="第二层" onClose={()=>setSecond(false)}><p>内容</p></Dialog>:null}
 </>
}
test('one stable notification host follows the top dialog and returns without losing its toast',async()=>{
 render(<DialogScreen/>)
 act(()=>{notify('pending','仍在处理',{id:'moving'})})
 const title=await screen.findByText('仍在处理')
 const host=title.closest('.notification-host')!
 await userEvent.click(screen.getByRole('button',{name:'打开弹窗'}))
 expect(host.parentElement).toBe(screen.getByRole('dialog',{name:'第一层'}))
 await userEvent.click(screen.getByRole('button',{name:'再开一层'}))
 expect(host.parentElement).toBe(screen.getByRole('dialog',{name:'第二层'}))
 expect(screen.getAllByText('仍在处理')).toHaveLength(1)
 await userEvent.click(screen.getByRole('button',{name:'关闭第二层'}))
 expect(host.parentElement).toBe(screen.getByRole('dialog',{name:'第一层'}))
 await userEvent.click(screen.getByRole('button',{name:'关闭第一层'}))
 expect(host.parentElement).toBe(document.body)
 expect(screen.getByRole('button',{name:'打开弹窗'})).toHaveFocus()
 await userEvent.click(screen.getByRole('button',{name:'关闭通知'}))
 expect(title.closest('li')).toHaveAttribute('data-removed','true')
})
