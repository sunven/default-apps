import {useState} from 'react'
import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,expect,test,vi} from 'vitest'
import {Dialog} from './Dialog'

afterEach(()=>vi.useRealTimers())

test('opening a dialog does not show the close tooltip without user interaction',async()=>{
 vi.useFakeTimers()
 render(<Dialog title="扫描问题" onClose={()=>{}}><p>无法读取声明</p></Dialog>)
 await act(async()=>{await vi.advanceTimersByTimeAsync(1000)})
 expect(screen.getByRole('dialog',{name:'扫描问题'})).toBeVisible()
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
 expect(screen.getByRole('heading',{name:'扫描问题'})).toHaveFocus()
})

function DialogScreen(){
 const [open,setOpen]=useState(false)
 return <><button onClick={()=>setOpen(true)}>查看扫描问题</button>
  {open?<Dialog title="扫描问题" onClose={()=>setOpen(false)}><p>无法读取声明</p></Dialog>:null}
 </>
}

test.each(['pointer','keyboard'])('%s opening focuses the title and Escape returns focus to the opener',async(input)=>{
 const user=userEvent.setup()
 render(<DialogScreen/>)
 const opener=screen.getByRole('button',{name:'查看扫描问题'})
 if(input==='pointer')await user.click(opener)
 else {await user.tab();await user.keyboard('{Enter}')}
 expect(screen.getByRole('heading',{name:'扫描问题'})).toHaveFocus()
 expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
 await user.keyboard('{Escape}')
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(opener).toHaveFocus()
 await user.click(opener)
 await user.click(screen.getByRole('button',{name:'关闭扫描问题'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(opener).toHaveFocus()
})

test('the close tooltip still responds to hover and Tab focus stays inside the dialog',async()=>{
 const user=userEvent.setup()
 render(<Dialog title="扫描问题" onClose={()=>{}}><button>重新扫描</button></Dialog>)
 const close=screen.getByRole('button',{name:'关闭扫描问题'})
 const action=screen.getByRole('button',{name:'重新扫描'})
 await user.hover(close)
 expect(await screen.findByRole('tooltip')).toHaveTextContent('关闭 · Esc')
 await user.unhover(close)
 await waitFor(()=>expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
 await user.tab()
 expect(close).toHaveFocus()
 expect(await screen.findByRole('tooltip')).toHaveTextContent('关闭 · Esc')
 await user.tab()
 expect(action).toHaveFocus()
 await user.tab()
 expect(close).toHaveFocus()
 await user.tab({shift:true})
 expect(action).toHaveFocus()
})
