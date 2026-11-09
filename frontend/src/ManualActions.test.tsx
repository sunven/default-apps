import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { AddInput, AddIdentifiedType, GetStatus, IdentifyFile, PickApplication, ResolveInput } from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import { ManualActions, ManualApplicationAction } from './ManualActions'

vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({AddInput:vi.fn(),AddIdentifiedType:vi.fn(),GetStatus:vi.fn(),IdentifyFile:vi.fn(),PickApplication:vi.fn(),ResolveInput:vi.fn()}))
const jpeg:Entry={id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG',extensions:['jpg'],mimeTypes:[],sources:[],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[]}
beforeEach(()=>{
 vi.resetAllMocks()
 vi.mocked(GetStatus).mockResolvedValue({error:'',associations:0,applications:0})
 vi.mocked(ResolveInput).mockResolvedValue({entries:[jpeg,{...jpeg,id:'file:other.jpg',association:{kind:'file',key:'other.jpg'},name:'Other JPG'}],cancelled:false,fileName:''})
})
test('requires explicit choice for ambiguous extension before saving and returns focus to its trigger',async()=>{
 const user=userEvent.setup();render(<ManualActions />)
 const trigger=screen.getByRole('button',{name:'补充文件类型…'});await user.click(trigger)
 expect(screen.getByRole('dialog',{name:'补充文件类型'})).toBeVisible()
 expect(screen.queryByRole('button',{name:'添加应用位置…'})).not.toBeInTheDocument()
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
 await user.click(screen.getByRole('button',{name:'关闭补充文件类型'}))
 expect(trigger).toHaveFocus()
})

test('unresolved input offers native recognition, cancellation keeps the draft and saves nothing',async()=>{
 const user=userEvent.setup();vi.mocked(ResolveInput).mockResolvedValue({entries:[{...jpeg,id:'unresolved:extension:unknown',resolved:false,unresolvedReason:'系统返回动态类型',diagnosticIdentifiers:['dyn.fixture']}],cancelled:false,fileName:''})
 vi.mocked(IdentifyFile).mockResolvedValue({entries:[],cancelled:true,fileName:''})
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'补充文件类型…'}))
 await user.type(screen.getByLabelText('扩展名或协议'),'unknown');await user.click(screen.getByRole('button',{name:'解析输入'}))
 expect(await screen.findByText('系统返回动态类型')).toBeVisible();expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled()
 await user.click(screen.getByRole('button',{name:'选择文件识别类型…'}))
 expect(screen.getByText('系统返回动态类型')).toBeVisible();expect(AddInput).not.toHaveBeenCalled();expect(AddIdentifiedType).not.toHaveBeenCalled()
})
test('recognizes a file as a type and reports a failed save without success',async()=>{
 const user=userEvent.setup();vi.mocked(IdentifyFile).mockResolvedValue({entries:[jpeg],cancelled:false,fileName:'/outside/photo.jpg'});vi.mocked(AddIdentifiedType).mockRejectedValue(new Error('磁盘已满，未能保存配置'))
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'补充文件类型…'}));await user.click(screen.getByRole('button',{name:'选择文件识别类型…'}))
 expect(await screen.findByText('/outside/photo.jpg')).toBeVisible();expect(AddIdentifiedType).not.toHaveBeenCalled()
 await user.click(screen.getByRole('button',{name:'保存手动关联'}));expect(AddIdentifiedType).toHaveBeenCalledWith('public.jpeg');expect(await screen.findByRole('alert')).toHaveTextContent('磁盘已满');expect(screen.queryByText('已保存手动关联')).not.toBeInTheDocument()
})
test('clears a previously resolved choice when the input changes',async()=>{
 const user=userEvent.setup();vi.mocked(ResolveInput).mockResolvedValue({entries:[jpeg],cancelled:false,fileName:''})
 render(<ManualActions />);await user.click(screen.getByRole('button',{name:'补充文件类型…'}));await user.type(screen.getByLabelText('扩展名或协议'),'jpg');await user.click(screen.getByRole('button',{name:'解析输入'}))
 expect(await screen.findByRole('radio')).toBeChecked();await user.type(screen.getByLabelText('扩展名或协议'),'x');expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled();expect(screen.queryByRole('radio')).not.toBeInTheDocument()
})
test('shows stored application path without claiming a default change and makes cancellation silent',async()=>{
 const user=userEvent.setup();vi.mocked(PickApplication).mockResolvedValueOnce({saved:false,cancelled:true,entry:null,app:null}).mockResolvedValueOnce({saved:true,cancelled:false,entry:null,app:{path:'/Outside/Reader.app',displayPath:'/Alias.app',name:'Reader',version:'2',bundleID:'same.reader'}})
 render(<ManualActions kind="application" />);const trigger=screen.getByRole('button',{name:'补充应用…'});await user.click(trigger)
 expect(screen.getByRole('dialog',{name:'补充应用'})).toBeVisible()
 expect(screen.queryByLabelText('扩展名或协议')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'保存手动关联'})).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'添加应用位置…'}));expect(screen.queryByText(/已保存应用位置/)).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'添加应用位置…'}));expect(await screen.findByText('/Outside/Reader.app')).toBeVisible();expect(screen.getByText('尚未提出修改默认应用的请求。')).toBeVisible()
 await user.click(screen.getByRole('button',{name:'关闭补充应用'}));expect(trigger).toHaveFocus()
})
test('reports preserved corrupt configuration and disables actions that would overwrite it',async()=>{
 const user=userEvent.setup();vi.mocked(GetStatus).mockResolvedValue({error:'配置损坏，已保留原文件',associations:0,applications:0})
 render(<><ManualActions/><ManualActions kind="application" showStorageWarning={false}/></>);expect(await screen.findByRole('alert')).toHaveTextContent('已保留原文件')
 await user.click(screen.getByRole('button',{name:'补充文件类型…'}));expect(screen.getByRole('button',{name:'保存手动关联'})).toBeDisabled()
 await user.click(screen.getByRole('button',{name:'关闭补充文件类型'}))
 await user.click(screen.getByRole('button',{name:'补充应用…'}));expect(screen.getByRole('button',{name:'添加应用位置…'})).toBeDisabled()
})

test('association other-application entry preserves the concrete selected copy',async()=>{
 const user=userEvent.setup();const selected=vi.fn()
 vi.mocked(PickApplication).mockResolvedValue({saved:true,cancelled:false,entry:null,app:{path:'/Outside/Second.app',displayPath:'/Outside/Second.app',name:'Same name',version:'3',bundleID:'same.bundle'}})
 render(<ManualApplicationAction association={{kind:'file',key:'public.jpeg'}} onSelected={selected}/>)
 await user.click(screen.getByRole('button',{name:'选择其他应用…'}))
 expect(await screen.findByText('/Outside/Second.app')).toBeVisible()
 expect(selected).toHaveBeenCalledWith(expect.objectContaining({path:'/Outside/Second.app',version:'3',bundleID:'same.bundle'}))
 expect(screen.getByText('尚未提出修改默认应用的请求。')).toBeVisible()
})
