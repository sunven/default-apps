import {act,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import type {CancellablePromise} from '@wailsio/runtime'
import {GetSnapshot as GetChanges,PrepareBatch,Query,ReconcileBatchStart,StartBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {List} from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import {GetSnapshot,StartScan} from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import {IdentifyFiles,AddIdentifiedType} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import type {Snapshot,BatchPreview} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {IdentifiedFile} from '../bindings/github.com/sunven/default-apps/internal/manual/models'
import App from './App'

vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({GetSnapshot:vi.fn(),Query:vi.fn(),PrepareBatch:vi.fn(),StartBatch:vi.fn(),StopBatch:vi.fn(),ReconcileBatchStart:vi.fn(),Requery:vi.fn(),Submit:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/catalog/service',()=>({List:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/discovery/service',()=>({GetSnapshot:vi.fn(),StartScan:vi.fn(),Reparse:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({GetStatus:()=>Promise.resolve({error:'',associations:0,applications:0}),PickApplication:vi.fn(),IdentifyFiles:vi.fn(),AddIdentifiedType:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))

const app={path:'/Applications/Editor.app',displayPath:'/Applications/Editor.app',name:'Editor',version:'2',bundleID:'test.editor'}
const other={...app,path:'/Applications/Other.app',displayPath:'/Applications/Other.app',name:'Other'}
const entry=(key:string,name:string):Entry=>({id:`file:${key}`,association:{kind:'file',key},name,extensions:['pdf'],mimeTypes:[],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[],sources:[]})
const pdf=entry('com.adobe.pdf','PDF'),text=entry('public.text','文本'),manual=entry('public.json','JSON')
const entries=[pdf,text,manual]
const catalog={version:1,scanning:false,apps:[{app,associationIDs:entries.map(e=>e.id),declarations:[],definitions:[],issues:[]},{app:other,associationIDs:[],declarations:[],definitions:[],issues:[]}],entries,issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
const initial:Snapshot={version:1,busy:false,batchBlocked:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file'],storageError:null,recovery:null,quit:{promptID:0,prompt:false,exiting:false}}
const listeners=new Map<string,(event:any)=>void|Promise<void>>()
const resolved=<T,>(value:T)=>Promise.resolve(value) as CancellablePromise<T>
const file=(path:string,type:Entry=pdf):IdentifiedFile=>({path,name:path.split('/').pop()!,entries:[type],error:''})
let preview:BatchPreview
beforeEach(()=>{
 vi.resetAllMocks();sessionStorage.clear();listeners.clear()
 vi.mocked(Events.On).mockImplementation((name,listener)=>{listeners.set(name,listener);return()=>{listeners.delete(name)}})
 vi.mocked(GetChanges).mockResolvedValue(initial);vi.mocked(List).mockResolvedValue(entries)
 vi.mocked(GetSnapshot).mockResolvedValue(catalog);vi.mocked(StartScan).mockResolvedValue(catalog)
 vi.mocked(Query).mockImplementation(association=>resolved({association,version:1,default:{known:true,app:other,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[app],observedAt:'now',stale:false,error:null}}))
 vi.mocked(IdentifyFiles).mockImplementation(paths=>resolved((paths??[]).map(path=>file(path))))
 vi.mocked(AddIdentifiedType).mockResolvedValue({saved:true,cancelled:false,entry:pdf,app:null})
 vi.mocked(PrepareBatch).mockImplementation((items,path,resumeID)=>{
  preview={id:'drop-preview',target:app,baseBatchID:'',baseRevision:0,resumeBatchID:resumeID,replaceBatchID:'',items:(items??[]).map(selection=>({selection,expected:{known:true,path:other.path},observed:other,status:'queued',message:'',requestID:'',attempts:0}))}
  return resolved(preview)
 })
 vi.mocked(StartBatch).mockImplementation(()=>resolved({outcome:'accepted',message:'',snapshot:{...initial,version:2,busy:true,batchBlocked:true,batch:{id:'drop-batch',revision:1,state:'waiting',target:app,items:preview.items,error:'',createdAt:'now',commands:[preview.id],runItems:[]}}}))
})
async function mount(){const result=render(<App/>);await waitFor(()=>expect(listeners.has('defaultapps:files-dropped')).toBe(true));await waitFor(()=>expect(screen.getByRole('button',{name:'文件类型'})).toBeEnabled());return result}
async function drop(paths:string[]){await act(async()=>{await listeners.get('defaultapps:files-dropped')?.({data:paths})})}
async function choose(){await userEvent.click(screen.getByRole('button',{name:/为 \d+ 个类型选择应用/}));await userEvent.click(await screen.findByRole('button',{name:`选择 Editor ${app.path}`}));return screen.findByRole('dialog',{name:'预览批量设置'})}

test('native drops deduplicate actual types, preview before writing and preserve existing checkboxes',async()=>{
 await mount();await userEvent.click(screen.getByRole('button',{name:'文件类型'}));await userEvent.click(screen.getByRole('checkbox',{name:'勾选 JSON public.json'}))
 vi.mocked(IdentifyFiles).mockResolvedValue([file('/one.pdf'),file('/two.pdf'),file('/different.pdf',text)])
 await drop(['/one.pdf','/two.pdf','/different.pdf'])
 const list=screen.getByRole('dialog',{name:'拖入文件识别清单'})
 expect(list).toHaveTextContent('2 个类型 · 3 个文件')
 expect(within(list).getAllByText('当前默认：Other')).toHaveLength(2)
 expect(AddIdentifiedType).not.toHaveBeenCalled();expect(StartBatch).not.toHaveBeenCalled()
 const dialog=await choose()
 expect(PrepareBatch).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({association:pdf.association}),expect.objectContaining({association:text.association})]),app.path,'')
 expect(vi.mocked(PrepareBatch).mock.calls[0][0]).toHaveLength(2)
 expect(dialog).toHaveTextContent('所有同类文件')
 await userEvent.click(within(dialog).getByRole('button',{name:'开始设置 2 项'}))
 await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(StartBatch).toHaveBeenCalledExactlyOnceWith('drop-preview','','')
 expect(screen.getByRole('checkbox',{name:'勾选 JSON public.json'})).toBeChecked()
 expect(sessionStorage.getItem('defaultapps.batch-start.v1')).toBeNull()
})

test('appends files, preserves exclusions and returns from preview without changing its contents',async()=>{
 await mount();await drop(['/one.pdf'])
 await userEvent.click(screen.getByRole('button',{name:'移除 PDF'}))
 vi.mocked(IdentifyFiles).mockResolvedValue([file('/one.pdf'),file('/next.pdf'),file('/note.pdf',text)])
 await drop(['/one.pdf','/next.pdf','/note.pdf'])
 expect(screen.getByRole('dialog')).toHaveTextContent('1 个类型 · 3 个文件')
 expect(screen.getByRole('button',{name:'恢复 PDF'})).toBeVisible()
 await choose()
 await drop(['/ignored.pdf'])
 expect(IdentifyFiles).toHaveBeenCalledTimes(2)
 expect(vi.mocked(PrepareBatch).mock.calls[0][0]).toHaveLength(1)
 await userEvent.click(screen.getByRole('button',{name:'返回识别清单'}))
 expect(screen.getByRole('dialog',{name:'拖入文件识别清单'})).toHaveTextContent('1 个类型 · 3 个文件')
 await userEvent.click(screen.getByRole('button',{name:'恢复 PDF'}))
 expect(screen.getByRole('button',{name:'为 2 个类型选择应用…'})).toBeEnabled()
 expect(StartBatch).not.toHaveBeenCalled()
})

test('mixed inputs keep usable types and require an explicit choice for ambiguous files',async()=>{
 await mount()
 vi.mocked(IdentifyFiles).mockResolvedValue([file('/one.pdf'),{path:'/folder',name:'folder',entries:[],error:'不支持文件夹'}, {...file('/ambiguous.pdf'),entries:[text,manual]}])
 await drop(['/one.pdf','/folder','/ambiguous.pdf'])
 expect(screen.getByText('不支持文件夹')).toBeVisible()
 expect(screen.getByRole('button',{name:'为 1 个类型选择应用…'})).toBeEnabled()
 await userEvent.click(screen.getByRole('radio',{name:'文本 · public.text'}))
 expect(screen.getByRole('button',{name:'为 2 个类型选择应用…'})).toBeEnabled()
 await userEvent.selectOptions(screen.getByRole('combobox',{name:'文件类型 ambiguous.pdf'}),manual.id)
 await choose()
 expect(vi.mocked(PrepareBatch).mock.calls[0][0]).toHaveLength(2)
 expect(vi.mocked(PrepareBatch).mock.calls[0][0]).toContainEqual(expect.objectContaining({association:manual.association}))
})

test('refuses new drops while identifying and discards late responses after cancellation',async()=>{
 await mount()
 let finish!:(files:IdentifiedFile[])=>void
 vi.mocked(IdentifyFiles).mockImplementation(()=>new Promise(resolve=>{finish=resolve}) as CancellablePromise<IdentifiedFile[]>)
 let pending:void|Promise<void>
 act(()=>{pending=listeners.get('defaultapps:files-dropped')?.({data:['/late.pdf']})})
 expect(await screen.findByRole('status')).toHaveTextContent('正在识别')
 await drop(['/refused.pdf'])
 expect(IdentifyFiles).toHaveBeenCalledTimes(1)
 await userEvent.click(screen.getByRole('button',{name:'取消'}))
 await act(async()=>{finish([file('/late.pdf')]);await pending})
 expect(screen.queryByRole('dialog',{name:'拖入文件识别清单'})).toBeNull()
 vi.mocked(IdentifyFiles).mockResolvedValue([file('/fresh.pdf')])
 await drop(['/fresh.pdf'])
 expect(screen.getByRole('dialog')).toHaveTextContent('fresh.pdf')
 expect(screen.getByRole('dialog')).not.toHaveTextContent('late.pdf')
})

test('running changes and other dialogs reject drops without queueing or replacing content',async()=>{
 await mount()
 await userEvent.click(screen.getByRole('button',{name:'补充文件类型…'}))
 await drop(['/refused.pdf'])
 expect(IdentifyFiles).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'关闭补充文件类型'}))
 await act(async()=>listeners.get('defaultapps:change')?.({data:{...initial,version:3,busy:true}}))
 await drop(['/busy.pdf'])
 expect(IdentifyFiles).not.toHaveBeenCalled()
 await act(async()=>listeners.get('defaultapps:change')?.({data:{...initial,version:4}}))
 expect(IdentifyFiles).not.toHaveBeenCalled()
 await drop(['/accepted.pdf'])
 expect(IdentifyFiles).toHaveBeenCalledExactlyOnceWith(['/accepted.pdf'])
})

test('optional manual saving reports failure, keeps setting available and survives cancelling a successful save',async()=>{
 await mount();await drop(['/one.pdf'])
 vi.mocked(AddIdentifiedType).mockRejectedValueOnce(new Error('disk full'))
 await userEvent.click(screen.getByRole('button',{name:'保存为手动关联'}))
 expect(await screen.findByText(/保存失败：disk full/)).toBeVisible()
 expect(screen.getByRole('button',{name:'为 1 个类型选择应用…'})).toBeEnabled()
 await userEvent.click(screen.getByRole('button',{name:'保存为手动关联'}))
 expect(await screen.findByText('已保存手动关联')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'取消'}))
 expect(AddIdentifiedType).toHaveBeenCalledTimes(2)
 expect(StartBatch).not.toHaveBeenCalled()
 expect(sessionStorage.length).toBe(0)
})

test('retries previously inaccessible inputs and cleans the native drop target on unmount',async()=>{
 const mounted=await mount()
 expect(document.body).toHaveAttribute('data-file-drop-target')
 vi.mocked(IdentifyFiles).mockResolvedValueOnce([{path:'/fixed.pdf',name:'fixed.pdf',entries:[],error:'无法访问'}])
 await drop(['/fixed.pdf'])
 expect(screen.getByRole('button',{name:'为 0 个类型选择应用…'})).toBeDisabled()
 await drop(['/fixed.pdf'])
 expect(screen.getByRole('button',{name:'为 1 个类型选择应用…'})).toBeEnabled()
 mounted.unmount()
 expect(document.body).not.toHaveAttribute('data-file-drop-target')
 expect(listeners.has('defaultapps:files-dropped')).toBe(false)
})

test('a lost reply reconciles the original batch without clearing unrelated selections',async()=>{
 await mount();await userEvent.click(screen.getByRole('button',{name:'文件类型'}));await userEvent.click(screen.getByRole('checkbox',{name:'勾选 JSON public.json'}))
 await drop(['/one.pdf']);await choose()
 vi.mocked(StartBatch).mockRejectedValueOnce(new Error('reply lost'))
 vi.mocked(ReconcileBatchStart).mockResolvedValue({outcome:'existing',message:'',snapshot:{...initial,version:2}})
 await userEvent.click(screen.getByRole('button',{name:'开始设置 1 项'}))
 await waitFor(()=>expect(ReconcileBatchStart).toHaveBeenCalledWith('drop-preview'))
 expect(StartBatch).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('checkbox',{name:'勾选 JSON public.json'})).toBeChecked()
})
