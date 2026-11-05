import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { AddInput, AddIdentifiedType, GetStatus, IdentifyFile, PickApplication, ResolveInput } from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import { ManualActions } from './ManualActions'

vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({AddInput:vi.fn(),AddIdentifiedType:vi.fn(),GetStatus:vi.fn(),IdentifyFile:vi.fn(),PickApplication:vi.fn(),ResolveInput:vi.fn()}))
const jpeg:Entry={id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG',extensions:['jpg'],mimeTypes:[],sources:[],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[]}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(GetStatus).mockResolvedValue({error:'',associations:0,applications:0})
 vi.mocked(ResolveInput).mockResolvedValue({entries:[jpeg,{...jpeg,id:'file:other.jpg',association:{kind:'file',key:'other.jpg'},name:'Other JPG'}],cancelled:false,fileName:''})
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
test('requires explicit choice for ambiguous extension before saving and returns focus to its trigger',async()=>{
 const user=userEvent.setup();render(<ManualActions />)
 const trigger=screen.getByRole('button',{name:'手动补充…'});await user.click(trigger)
 await user.type(screen.getByLabelText('扩展名或协议'),'jpg')
 await user.click(screen.getByRole('button',{name:'解析输入'}))
 expect(await screen.findByText('public.jpeg')).toBeVisible()
 expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled()
 expect(AddInput).not.toHaveBeenCalled()
 await user.click(screen.getByRole('radio',{name:/JPEG public.jpeg/}))
 vi.mocked(AddInput).mockResolvedValue({saved:true,cancelled:false,entry:jpeg,app:null})
 await user.click(screen.getByRole('button',{name:'保存手动关联'}))
 expect(AddInput).toHaveBeenCalledWith('extension','jpg','file:public.jpeg')
 expect(await screen.findByText('已保存手动关联')).toBeVisible()
 await user.click(screen.getByRole('button',{name:'关闭手动补充'}))
 expect(trigger).toHaveFocus()
})

test('unresolved input offers native recognition, cancellation keeps the draft and saves nothing',async()=>{
 const user=userEvent.setup();vi.mocked(ResolveInput).mockResolvedValue({entries:[{...jpeg,id:'unresolved:extension:unknown',resolved:false,unresolvedReason:'系统返回动态类型',diagnosticIdentifiers:['dyn.fixture']}],cancelled:false,fileName:''})
 vi.mocked(IdentifyFile).mockResolvedValue({entries:[],cancelled:true,fileName:''})
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'手动补充…'}))
 await user.type(screen.getByLabelText('扩展名或协议'),'unknown');await user.click(screen.getByRole('button',{name:'解析输入'}))
 expect(await screen.findByText('系统返回动态类型')).toBeVisible();expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled()
 await user.click(screen.getByRole('button',{name:'选择文件识别类型…'}))
 expect(screen.getByText('系统返回动态类型')).toBeVisible();expect(AddInput).not.toHaveBeenCalled();expect(AddIdentifiedType).not.toHaveBeenCalled()
})
test('recognizes a file as a type and reports a failed save without success',async()=>{
 const user=userEvent.setup();vi.mocked(IdentifyFile).mockResolvedValue({entries:[jpeg],cancelled:false,fileName:'/outside/photo.jpg'});vi.mocked(AddIdentifiedType).mockRejectedValue(new Error('磁盘已满，未能保存配置'))
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'手动补充…'}));await user.click(screen.getByRole('button',{name:'选择文件识别类型…'}))
 expect(await screen.findByText('/outside/photo.jpg')).toBeVisible();expect(AddIdentifiedType).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button',{name:'保存手动关联'}));expect(AddIdentifiedType).toHaveBeenCalledWith('public.jpeg');expect(await screen.findByRole('alert')).toHaveTextContent('磁盘已满');expect(screen.queryByText('已保存手动关联')).not.toBeInTheDocument()
})
test('clears a previously resolved choice when the input changes',async()=>{
 const user=userEvent.setup();vi.mocked(ResolveInput).mockResolvedValue({entries:[jpeg],cancelled:false,fileName:''})
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'手动补充…'}));await user.type(screen.getByLabelText('扩展名或协议'),'jpg');await user.click(screen.getByRole('button',{name:'解析输入'}))
 expect(await screen.findByRole('radio')).toBeChecked();await user.type(screen.getByLabelText('扩展名或协议'),'x');expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled();expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})
test('shows stored application path without claiming a default change and makes cancellation silent',async()=>{
 const user=userEvent.setup();vi.mocked(PickApplication).mockResolvedValueOnce({saved:false,cancelled:true,entry:null,app:null}).mockResolvedValueOnce({saved:true,cancelled:false,entry:null,app:{path:'/Outside/Reader.app',displayPath:'/Alias.app',name:'Reader',version:'2',bundleID:'same.reader'}})
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'手动补充…'}));await user.click(screen.getByRole('button',{name:'添加应用位置…'}));expect(screen.queryByText(/已保存应用位置/)).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'添加应用位置…'}));expect(await screen.findByText('/Outside/Reader.app')).toBeVisible();expect(screen.getByText('尚未提出修改默认应用的请求。')).toBeVisible()
})
test('reports preserved corrupt configuration and disables actions that would overwrite it',async()=>{
 const user=userEvent.setup();vi.mocked(GetStatus).mockResolvedValue({error:'配置损坏，已保留原文件',associations:0,applications:0})
 render(<ManualActions />);expect(await screen.findByRole('alert')).toHaveTextContent('已保留原文件');await user.click(screen.getByRole('button',{name:'手动补充…'}));expect(screen.getByRole('button',{name:'添加应用位置…'})).toBeDisabled();expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled()
})
