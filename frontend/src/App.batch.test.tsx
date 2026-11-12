import {act,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import type {CancellablePromise} from '@wailsio/runtime'
import {GetSnapshot as GetChanges,PrepareBatch,Query,ReconcileBatchStart,StartBatch,StopBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {List} from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import {GetSnapshot,StartScan} from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type {Snapshot,BatchPreview} from '../bindings/github.com/sunven/default-apps/internal/change/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import App from './App'

vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({GetSnapshot:vi.fn(),Query:vi.fn(),PrepareBatch:vi.fn(),StartBatch:vi.fn(),StopBatch:vi.fn(),ReconcileBatchStart:vi.fn(),Requery:vi.fn(),Submit:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/catalog/service',()=>({List:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/discovery/service',()=>({GetSnapshot:vi.fn(),StartScan:vi.fn(),Reparse:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({GetStatus:()=>Promise.resolve({error:'',associations:0,applications:0}),PickApplication:vi.fn()}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))
const app={path:'/Applications/Editor.app',displayPath:'/Applications/Editor.app',name:'Editor',version:'2',bundleID:'test.editor'}
const other={...app,path:'/Applications/Other.app',displayPath:'/Applications/Other.app',name:'Other'}
const entry=(key:string,name:string):Entry=>({id:`file:${key}`,association:{kind:'file',key},name,extensions:[key],mimeTypes:[],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[],sources:[{kind:'common',inputKind:'identifier',rawInput:key,normalizedInput:key,label:name}]})
const entries=[entry('markdown','Markdown'),entry('json','JSON'),entry('text','纯文本')]
const catalog={version:1,scanning:false,apps:[{app,associationIDs:entries.map(e=>e.id),declarations:[],definitions:[],issues:[]},{app:other,associationIDs:[],declarations:[],definitions:[],issues:[]}],entries,issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
const initial:Snapshot={version:1,busy:false,batchBlocked:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file'],storageError:null,recovery:null,quit:{promptID:0,prompt:false,exiting:false}}
const listeners=new Map<string,(event:any)=>void>()
let preview:BatchPreview
const resolved=<T,>(value:T)=>Promise.resolve(value) as CancellablePromise<T>
function running(p:BatchPreview):Snapshot{return {...initial,version:10,busy:true,batchBlocked:true,batch:{id:'batch-1',revision:1,state:'waiting',target:p.target,items:(p.items??[]).map((item,index)=>({...item,status:index===0?'waiting':item.status,requestID:index===0?'request-1':''})),error:'',createdAt:'now',commands:[p.id],runItems:(p.items??[]).map(item=>item.selection.association.key)}}}
beforeEach(()=>{
 vi.resetAllMocks();sessionStorage.clear();listeners.clear()
 vi.mocked(Events.On).mockImplementation((name,listener)=>{listeners.set(name,listener);return()=>{listeners.delete(name)}})
 vi.mocked(GetChanges).mockResolvedValue(initial)
 vi.mocked(List).mockResolvedValue(entries)
 vi.mocked(GetSnapshot).mockResolvedValue(catalog)
 vi.mocked(StartScan).mockResolvedValue(catalog)
 vi.mocked(Query).mockImplementation(association=>resolved({association,version:1,default:{known:true,app:other,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[app],observedAt:'now',stale:false,error:null}}))
 vi.mocked(PrepareBatch).mockImplementation((items,path,resumeID)=>{
  preview={id:'preview-1',target:path===app.path?app:other,baseBatchID:resumeID,baseRevision:0,resumeBatchID:resumeID,replaceBatchID:'',items:(items??[]).map(selection=>({selection,expected:{known:true,path:other.path},observed:other,status:'queued',message:'',requestID:'',attempts:0}))}
  return resolved(preview)
 })
 vi.mocked(StartBatch).mockImplementation(()=>resolved({outcome:'accepted',message:'',snapshot:running(preview)}))
 vi.mocked(StopBatch).mockImplementation(()=>resolved({outcome:'stopped',message:'',snapshot:{...running(preview),version:11,batchBlocked:false,batch:{...running(preview).batch!,state:'stopped'}}}))
})
async function openFiles(){render(<App/>);await userEvent.click(screen.getByRole('button',{name:'文件类型'}));await waitFor(()=>expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).not.toHaveAttribute('aria-disabled','true'))}
async function chooseEditor(){await userEvent.click(screen.getByRole('button',{name:'选择应用…'}));await userEvent.click(await screen.findByRole('button',{name:`选择 Editor ${app.path}`}));return await screen.findByRole('dialog',{name:'预览批量设置'})}

test('batch picker shows icons for installed copies and candidates outside the catalog',async()=>{
 const candidate={...app,path:'/Volumes/External/Editor.app',iconData:'external-editor-icon'}
 const icons={...catalog,apps:catalog.apps.map(item=>({...item,app:{...item.app,iconData:`${item.app.name}-icon`}}))}
 vi.mocked(GetSnapshot).mockResolvedValue(icons)
 vi.mocked(StartScan).mockResolvedValue(icons)
 vi.mocked(Query).mockImplementation(association=>resolved({association,version:1,default:{known:true,app:other,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[icons.apps[0].app,candidate],observedAt:'now',stale:false,error:null}}))
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 const dialog=await screen.findByRole('dialog',{name:'为所选类型选择应用'})
 await waitFor(()=>expect(within(dialog).queryByText('正在查询系统候选…')).not.toBeInTheDocument())
 for(const copy of [...icons.apps.map(item=>item.app),candidate]){
  const option=within(dialog).getByRole('button',{name:`选择 ${copy.name} ${copy.path}`})
  expect(option.querySelector('img')).toHaveAttribute('src',`data:image/png;base64,${copy.iconData}`)
 }
 expect(PrepareBatch).not.toHaveBeenCalled()
})

test('keeps selections across searches and views, and selects only current filtered results',async()=>{
 await openFiles()
 const search=screen.getByRole('searchbox',{name:'搜索文件类型'})
 await userEvent.type(search,'Markdown');await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 await userEvent.clear(search)
 expect(screen.getByRole('checkbox',{name:'全选当前筛选结果'})).toBePartiallyChecked()
 await userEvent.type(search,'JSON');await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 2 个类型')
 for(const view of ['应用','URL 协议']){
  await userEvent.click(screen.getByRole('button',{name:view}))
  expect(screen.queryByRole('region',{name:'已选文件类型'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'选择应用…'})).not.toBeInTheDocument()
 }
 await userEvent.click(screen.getByRole('button',{name:'文件类型'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 2 个类型')
 expect(screen.getByRole('checkbox',{name:'勾选 JSON json'})).toBeChecked()
 await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 1 个类型')
 await userEvent.click(screen.getByRole('button',{name:'查看已选'}))
 const selected=screen.getByRole('dialog',{name:'已选文件类型'})
 expect(within(selected).getByText('Markdown')).toBeVisible();expect(within(selected).queryByText('JSON')).toBeNull()
 expect(StartBatch).not.toHaveBeenCalled()
})

test('previews selected types before one start, locks modifications and stops only following items',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}));await userEvent.click(screen.getByRole('checkbox',{name:'勾选 JSON json'}))
 const dialog=await chooseEditor()
 expect(within(dialog).getByText('Markdown')).toBeVisible();expect(within(dialog).getByText('JSON')).toBeVisible()
 expect(StartBatch).not.toHaveBeenCalled()
 await userEvent.click(within(dialog).getByRole('button',{name:'开始设置 2 项'}))
 const results=await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(StartBatch).toHaveBeenCalledExactlyOnceWith('preview-1','','')
 expect(screen.getByRole('checkbox',{name:'勾选 JSON json'})).toHaveAttribute('aria-disabled','true')
 await userEvent.click(within(results).getByRole('button',{name:'停止后续设置'}))
 expect(StopBatch).toHaveBeenCalledExactlyOnceWith('batch-1')
 expect(await within(results).findByText('后续设置已停止')).toBeVisible()
 expect(within(results).getByRole('button',{name:'继续未执行的 1 项…'})).toHaveAttribute('aria-disabled','true')
 expect(within(results).getByText('结果未定')).toBeVisible()
})

test('read-only reconciliation recovers a lost start reply without another start',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}));await chooseEditor()
 vi.mocked(StartBatch).mockRejectedValueOnce(new Error('reply lost'))
 vi.mocked(ReconcileBatchStart).mockImplementation(()=>resolved({outcome:'existing',message:'',snapshot:running(preview)}))
 await userEvent.click(screen.getByRole('button',{name:'开始设置 1 项'}))
 await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(StartBatch).toHaveBeenCalledTimes(1)
 expect(ReconcileBatchStart).toHaveBeenCalledExactlyOnceWith('preview-1')
 expect(sessionStorage.getItem('defaultapps.batch-start.v1')).toBeNull()
})

test('a reload with an outstanding start only reconciles its original identity',async()=>{
 preview={id:'saved-preview',target:app,items:[{selection:{association:entries[0].association,name:'Markdown',extensions:['md']},expected:{known:true,path:other.path},observed:other,status:'queued',message:'',requestID:'',attempts:0}],baseBatchID:'',baseRevision:0,resumeBatchID:'',replaceBatchID:''}
 sessionStorage.setItem('defaultapps.batch-start.v1',preview.id)
 vi.mocked(ReconcileBatchStart).mockResolvedValue({outcome:'existing',message:'',snapshot:running(preview)})
 render(<App/>);await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(StartBatch).not.toHaveBeenCalled();expect(PrepareBatch).not.toHaveBeenCalled()
 expect(ReconcileBatchStart).toHaveBeenCalledExactlyOnceWith('saved-preview')
})

test('partial results remain distinct and retry previews only problem items',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}));await chooseEditor();await userEvent.click(screen.getByRole('button',{name:'开始设置 3 项'}))
 const active=running(preview)
 const result={...active,version:12,busy:false,batchBlocked:false,batch:{...active.batch!,state:'completed',revision:3,items:active.batch!.items!.map((item,index)=>({...item,status:['confirmed','changed','failed'][index]}))}}
 await act(async()=>listeners.get('defaultapps:change')?.({data:result}))
 const dialog=screen.getByRole('dialog',{name:'最近一次批量设置'})
 expect(within(dialog).getByText('已确认修改 1')).toBeVisible();expect(within(dialog).getByText('需重新确认 1')).toBeVisible();expect(within(dialog).getByText('失败 1')).toBeVisible()
 await userEvent.click(within(dialog).getByRole('button',{name:'重新处理 2 个问题项…'}))
 await screen.findByRole('dialog',{name:'预览批量设置'})
 const calls=vi.mocked(PrepareBatch).mock.calls,last=calls[calls.length-1]
 expect(last[0]!.map(item=>item.association.key)).toEqual(['json','text'])
 expect(last[2]).toBe('batch-1');expect(StartBatch).toHaveBeenCalledTimes(1)
})


test('table cell activation and checkbox selection stay independent',async()=>{
 await openFiles()
 const table=screen.getByRole('table',{name:'关联目录'})
 const name=within(table).getByRole('button',{name:'Markdown markdown'})
 const row=name.closest('tr')!
 const checkbox=within(row).getByRole('checkbox',{name:'勾选 Markdown markdown'})
 await userEvent.click(checkbox)
 expect(checkbox).toBeChecked()
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await userEvent.click(within(row).getByRole('cell',{name:'markdown'}))
 expect(screen.getByRole('dialog',{name:'Markdown'})).toBeVisible()
 expect(checkbox).toBeChecked()
 await userEvent.keyboard('{Escape}')
 checkbox.focus()
 await userEvent.keyboard(' ')
 expect(checkbox).not.toBeChecked()
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(name).toHaveAttribute('aria-pressed','true')
 expect(StartBatch).not.toHaveBeenCalled()
})
