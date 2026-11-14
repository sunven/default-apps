import {act,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,expect,test,vi} from 'vitest'
import {StrictMode} from 'react'
import {Events} from '@wailsio/runtime'
import type {CancellablePromise} from '@wailsio/runtime'
import {GetSnapshot as GetChanges,PrepareBatch,Query,ReconcileBatchStart,StartBatch,StopBatch} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {List} from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import {GetSnapshot,StartScan} from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import {PickApplication} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
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

test('application selections survive filtering and navigation independently for each copy and the file page',async()=>{
 const copy={...app,path:'/Volumes/External/Editor.app',displayPath:'/Volumes/External/Editor.app'}
 const data={...catalog,apps:[catalog.apps[0],{...catalog.apps[0],app:copy}]}
 vi.mocked(GetSnapshot).mockResolvedValue(data);vi.mocked(StartScan).mockResolvedValue(data)
 render(<App/>)
 const first=await screen.findByRole('checkbox',{name:'勾选 Markdown markdown'})
 await userEvent.click(first)
 const search=screen.getByRole('searchbox',{name:'筛选当前关联'})
 await userEvent.type(search,'JSON');await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 2 个类型')
 await userEvent.clear(search)
 await userEvent.click(screen.getByRole('button',{name:`Editor 2 ${copy.path}`}))
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).not.toBeChecked()
 await userEvent.click(screen.getByRole('checkbox',{name:'勾选 纯文本 text'}))
 await userEvent.click(screen.getByRole('button',{name:'文件类型'}))
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).not.toBeChecked()
 await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 await userEvent.click(screen.getByRole('button',{name:'应用'}))
 expect(screen.getByRole('checkbox',{name:'勾选 纯文本 text'})).toBeChecked()
 await userEvent.click(screen.getByRole('button',{name:`Editor 2 ${app.path}`}))
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).toBeChecked()
 expect(screen.getByRole('checkbox',{name:'勾选 JSON json'})).toBeChecked()
 await userEvent.click(screen.getByRole('button',{name:'查看已选'}))
 const dialog=screen.getByRole('dialog',{name:'已选文件类型'})
 expect(within(dialog).getByText(`目标：Editor · ${app.path}`)).toBeVisible()
 await userEvent.click(within(dialog).getByRole('button',{name:'移除 Markdown'}))
 await userEvent.keyboard('{Escape}')
 await userEvent.click(screen.getByRole('button',{name:'清空'}))
 expect(screen.queryByRole('region',{name:'已选文件类型'})).toBeNull()
 await userEvent.click(screen.getByRole('button',{name:'文件类型'}))
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).toBeChecked()
 await userEvent.click(screen.getByRole('button',{name:'应用'}))
 await userEvent.click(screen.getByRole('button',{name:`Editor 2 ${copy.path}`}))
 expect(screen.getByRole('checkbox',{name:'勾选 纯文本 text'})).toBeChecked()
 expect(PrepareBatch).not.toHaveBeenCalled();expect(StartBatch).not.toHaveBeenCalled()
})

test('application batch excludes protocols and unresolved types, previews its fixed copy and starts once',async()=>{
 const scheme={...entry('https','HTTPS'),id:'scheme:https',association:{kind:'scheme',key:'https'}}
 const unresolved={...entry('unknown','未知类型'),resolved:false}
 const all=[...entries,scheme,unresolved]
 const data={...catalog,entries:all,apps:[{...catalog.apps[0],associationIDs:all.map(e=>e.id)},catalog.apps[1]]}
 vi.mocked(List).mockResolvedValue(all);vi.mocked(GetSnapshot).mockResolvedValue(data);vi.mocked(StartScan).mockResolvedValue(data)
 render(<App/>)
 await screen.findByRole('checkbox',{name:'勾选 Markdown markdown'})
 expect(screen.queryByRole('checkbox',{name:'勾选 HTTPS https'})).toBeNull()
 expect(screen.getByRole('checkbox',{name:'勾选 未知类型 unknown'})).toHaveAttribute('aria-disabled','true')
 await userEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 expect(screen.queryByRole('dialog')).toBeNull()
 await userEvent.click(screen.getByRole('button',{name:'设为 Editor…'}))
 const dialog=await screen.findByRole('dialog',{name:'预览批量设置'})
 expect(PrepareBatch).toHaveBeenCalledExactlyOnceWith(entries.map(e=>({association:e.association,name:e.name,extensions:e.extensions})),app.path,'')
 expect(within(dialog).getByText(app.path)).toBeVisible()
 expect(within(dialog).queryByRole('button',{name:'更换应用'})).toBeNull()
 expect(within(dialog).getByText('设置将影响这些类型的所有同类文件。')).toBeVisible()
 expect(StartBatch).not.toHaveBeenCalled();expect(PickApplication).not.toHaveBeenCalled()
 await userEvent.click(within(dialog).getByRole('button',{name:'返回调整'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 3 个类型')
 await userEvent.click(screen.getByRole('button',{name:'设为 Editor…'}))
 await userEvent.click(await screen.findByRole('button',{name:'开始设置 3 项'}))
 await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(StartBatch).toHaveBeenCalledExactlyOnceWith('preview-1','','')
 expect(screen.queryByRole('region',{name:'已选文件类型'})).toBeNull()
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).toHaveAttribute('aria-disabled','true')
})

test('fixed application preparation can return, ignore late results and retry an unavailable target',async()=>{
 render(<App/>);await userEvent.click(await screen.findByRole('checkbox',{name:'勾选 Markdown markdown'}))
 let finish!:(value:BatchPreview)=>void
 vi.mocked(PrepareBatch).mockReturnValueOnce(new Promise<BatchPreview>(resolve=>{finish=resolve}) as CancellablePromise<BatchPreview>)
 await userEvent.click(screen.getByRole('button',{name:'设为 Editor…'}))
 const preparing=screen.getByRole('dialog',{name:'准备批量设置'})
 expect(within(preparing).getByText('正在检查当前默认并准备预览…')).toBeVisible()
 await userEvent.click(within(preparing).getByRole('button',{name:'返回调整'}))
 await act(async()=>finish({id:'abandoned',target:app,items:[],baseBatchID:'',baseRevision:0,resumeBatchID:'',replaceBatchID:''}))
 expect(screen.queryByRole('dialog')).toBeNull()
 vi.mocked(PrepareBatch).mockRejectedValueOnce(new Error('目标应用副本不可用'))
 await userEvent.click(screen.getByRole('button',{name:'设为 Editor…'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('目标应用副本不可用')
 await userEvent.click(screen.getByRole('button',{name:'重新准备预览'}))
 await screen.findByRole('dialog',{name:'预览批量设置'})
 expect(vi.mocked(PrepareBatch).mock.calls.every(call=>call[1]===app.path)).toBe(true)
 expect(StartBatch).not.toHaveBeenCalled()
})

test('already default types remain selectable but an all-skipped application preview cannot start',async()=>{
 vi.mocked(PrepareBatch).mockImplementation(items=>resolved({id:'unchanged',target:app,baseBatchID:'',baseRevision:0,resumeBatchID:'',replaceBatchID:'',items:(items??[]).map(selection=>({selection,expected:{known:true,path:app.path},observed:app,status:'unchanged',message:'已是目标应用，无需修改。',requestID:'',attempts:0}))}))
 vi.mocked(Query).mockImplementation(association=>resolved({association,version:1,default:{known:true,app,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[app],observedAt:'now',stale:false,error:null}}))
 render(<App/>);await userEvent.click(await screen.findByRole('checkbox',{name:'勾选 Markdown markdown'}))
 await userEvent.click(screen.getByRole('button',{name:'查看已选'}))
 await userEvent.click(within(screen.getByRole('dialog',{name:'已选文件类型'})).getByRole('button',{name:'设为 Editor…'}))
 const dialog=await screen.findByRole('dialog',{name:'预览批量设置'})
 expect(within(dialog).getByText('已是目标')).toBeVisible()
 expect(within(dialog).getByRole('button',{name:'开始设置 0 项'})).toHaveAttribute('aria-disabled','true')
 expect(StartBatch).not.toHaveBeenCalled()
})

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

test('picker retains failed observations, updates coverage without moving choices, and reranks on reopen',async()=>{
 await openFiles();await act(async()=>{})
 await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 let reject!:(error:Error)=>void
 vi.mocked(Query).mockImplementation(()=>new Promise((_,no)=>{reject=no}) as ReturnType<typeof Query>)
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 const dialog=screen.getByRole('dialog',{name:'为所选类型选择应用'})
 const buttons=()=>within(within(dialog).getByLabelText('批量目标应用')).getAllByRole('button')
 expect(within(dialog).getByText(/正在刷新系统候选/)).toBeVisible()
 expect(buttons().map(button=>button.getAttribute('aria-label'))).toEqual([`选择 Editor ${app.path}`,`选择 Other ${other.path}`])
 await act(async()=>reject(new Error('offline')))
 expect(within(dialog).getByText(/1 项刷新失败/)).toBeVisible()
 expect(buttons()[0]).toHaveTextContent('上次查询覆盖 · 1 / 1 项系统候选')
 expect(buttons()[0]).not.toHaveAttribute('aria-disabled','true')
 const external={...other,name:'External',path:'/Volumes/External.app'}
 const publish=async(version:number,apps:typeof app[])=>act(async()=>listeners.get('defaultapps:observation')?.({data:{association:entries[0].association,version,default:{known:true,app:other,observedAt:'now',stale:false,error:null},candidates:{known:true,apps,observedAt:'now',stale:false,error:null}}}))
 await publish(2,[other,external])
 expect(buttons().map(button=>button.getAttribute('aria-label'))).toEqual([`选择 Editor ${app.path}`,`选择 Other ${other.path}`,`选择 External ${external.path}`])
 expect(buttons()[0]).toHaveTextContent('0 / 1 项系统候选')
 expect(buttons()[1]).toHaveTextContent('1 / 1 项系统候选')
 expect(within(dialog).queryByText(/刷新失败/)).not.toBeInTheDocument()
 await publish(3,[other])
 expect(buttons()[2]).toHaveTextContent('0 / 1 项系统候选')
 await userEvent.click(within(dialog).getByRole('button',{name:'关闭为所选类型选择应用'}))
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 const reopened=screen.getByRole('dialog',{name:'为所选类型选择应用'})
 expect(within(within(reopened).getByLabelText('批量目标应用')).getAllByRole('button')[0]).toHaveAccessibleName(`选择 Other ${other.path}`)
 expect(PrepareBatch).not.toHaveBeenCalled()
})

test('first uncached candidate round waits for coverage before its one initial sort',async()=>{
 const replies=new Map<string,(value:Awaited<ReturnType<typeof Query>>)=>void>()
 vi.mocked(Query).mockImplementation(a=>new Promise(resolve=>{replies.set(a.key,resolve)}) as ReturnType<typeof Query>)
 await openFiles()
 await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 await userEvent.click(screen.getByRole('checkbox',{name:'勾选 JSON json'}))
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 const dialog=screen.getByRole('dialog',{name:'为所选类型选择应用'})
 const first=()=>within(within(dialog).getByLabelText('批量目标应用')).getAllByRole('button')[0]
 const resolve=async(index:number)=>act(async()=>replies.get(entries[index].association.key)!({association:entries[index].association,version:1,default:{known:true,app:other,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[other],observedAt:'now',stale:false,error:null}}))
 expect(Query).toHaveBeenCalledTimes(3)
 await resolve(0)
 expect(first()).toHaveAccessibleName(`选择 Editor ${app.path}`)
 await resolve(1)
 expect(first()).toHaveAccessibleName(`选择 Other ${other.path}`)
 expect(first()).toHaveTextContent('2 / 2 项系统候选')
})

test('closing during preview preparation keeps selections and ignores the old preview after reopening',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 let finish!:(value:BatchPreview)=>void
 vi.mocked(PrepareBatch).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}) as ReturnType<typeof PrepareBatch>)
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 await userEvent.click(await screen.findByRole('button',{name:`选择 Editor ${app.path}`}))
 expect(screen.getByText('正在检查当前默认并准备预览…')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'关闭为所选类型选择应用'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'})).toBeChecked()
 const current=await chooseEditor()
 await act(async()=>finish({...preview,id:'abandoned',target:other}))
 expect(current).toHaveTextContent('共同目标：Editor');expect(current).not.toHaveTextContent('共同目标：Other')
 expect(StartBatch).not.toHaveBeenCalled()
})

test('a native picker finishing after its panel closes cannot open a preview',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}))
 let finish!:(value:Awaited<ReturnType<typeof PickApplication>>)=>void
 vi.mocked(PickApplication).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}) as ReturnType<typeof PickApplication>)
 await userEvent.click(screen.getByRole('button',{name:'选择应用…'}))
 await userEvent.click(screen.getByRole('button',{name:'选择其他应用…'}))
 await userEvent.click(screen.getByRole('button',{name:'关闭为所选类型选择应用'}))
 await act(async()=>finish({saved:true,cancelled:false,entry:null,app}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(PrepareBatch).not.toHaveBeenCalled()
})

test('an admission event unlocks batch controls while the start reply is still missing',async()=>{
 await openFiles();await userEvent.click(screen.getByRole('checkbox',{name:'勾选 Markdown markdown'}));await chooseEditor()
 let reject!:(error:Error)=>void
 vi.mocked(StartBatch).mockImplementationOnce(()=>new Promise((_,no)=>{reject=no}) as ReturnType<typeof StartBatch>)
 await userEvent.click(screen.getByRole('button',{name:'开始设置 1 项'}))
 await act(async()=>listeners.get('defaultapps:change')?.({data:running(preview)}))
 const dialog=await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(within(dialog).getByRole('button',{name:'停止后续设置'})).not.toHaveAttribute('aria-disabled','true')
 expect(sessionStorage.getItem('defaultapps.batch-start.v1')).toBeNull()
 await act(async()=>reject(new Error('late transport failure')))
 expect(screen.getByRole('dialog')).toBe(dialog);expect(dialog).not.toHaveTextContent('late transport failure')
 expect(StartBatch).toHaveBeenCalledTimes(1);expect(ReconcileBatchStart).not.toHaveBeenCalled()
})

test('StrictMode reconnects the batch workflow and restores a pending identity without starting again',async()=>{
 const p:BatchPreview={id:'strict-pending',target:app,items:[],baseBatchID:'',baseRevision:0,resumeBatchID:'',replaceBatchID:''}
 sessionStorage.setItem('defaultapps.batch-start.v1',p.id)
 vi.mocked(ReconcileBatchStart).mockResolvedValue({outcome:'existing',message:'',snapshot:running(p)})
 const mounted=render(<StrictMode><App/></StrictMode>)
 await screen.findByRole('dialog',{name:'最近一次批量设置'})
 expect(ReconcileBatchStart).toHaveBeenCalled();expect(vi.mocked(ReconcileBatchStart).mock.calls.every(([id])=>id===p.id)).toBe(true)
 expect(StartBatch).not.toHaveBeenCalled();expect(PrepareBatch).not.toHaveBeenCalled()
 expect(sessionStorage.getItem('defaultapps.batch-start.v1')).toBeNull()
 mounted.unmount();expect(listeners.size).toBe(0);expect(document.body).not.toHaveAttribute('data-file-drop-target')
})
