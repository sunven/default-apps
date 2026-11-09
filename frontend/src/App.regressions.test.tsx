import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { Events } from '@wailsio/runtime'
import { Query, GetSnapshot as ChangeSnapshot } from '../bindings/github.com/sunven/default-apps/internal/change/service'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import { GetSnapshot, Reparse, StartScan } from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import type { QueryResult, Association } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import App from './App'

vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service', () => ({Query:vi.fn(),GetSnapshot:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/catalog/service', () => ({List:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/discovery/service', () => ({GetSnapshot:vi.fn(),StartScan:vi.fn(),Reparse:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({GetStatus:()=>Promise.resolve({error:'',associations:0,applications:0})}))
vi.mock('@wailsio/runtime', () => ({Events:{On:vi.fn()}}))
const entry=(key:string,name:string,extensions:string[],common=false):Entry=>({id:`file:${key}`,association:{kind:'file',key},name,extensions,mimeTypes:[],sources:[{kind:common?'common':'declaration',inputKind:'type',rawInput:key,normalizedInput:key,label:name}],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[]})
const pdf=entry('com.adobe.pdf','PDF 文稿',['pdf'],true)
const jpeg=entry('public.jpeg','JPEG 图像',['jpg','jpeg'])
const otherJPEG=entry('test.independent.jpg','JPEG 导出',['jpg'])
const https:Entry={...entry('https','https',[],true),id:'scheme:https',association:{kind:'scheme',key:'https'}}
const app={name:'Reader',version:'2.4',path:'/Applications/Reader.app',displayPath:'/Applications/Reader.app',bundleID:'test.reader'}
const archive={...app,path:'/Volumes/Archive/Reader.app',displayPath:'/Volumes/Archive/Reader.app',version:'1.2'}
const snapshot:Snapshot={version:2,scanning:false,apps:[{app,associationIDs:[jpeg.id,pdf.id,otherJPEG.id],declarations:[],definitions:[],issues:[]},{app:archive,associationIDs:[],declarations:[],definitions:[],issues:[]}],entries:[jpeg,pdf,otherJPEG,https],issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
const listeners=new Map<string,(event:any)=>void>()
beforeEach(()=>{
 vi.resetAllMocks(); sessionStorage.clear(); listeners.clear(); vi.mocked(ChangeSnapshot).mockResolvedValue({version:0,busy:false,activeRequestID:'',requests:[],observations:[],writableKinds:[],storageError:null,recovery:null,quit:{promptID:0,prompt:false,exiting:false}})
 vi.mocked(List).mockResolvedValue(snapshot.entries!)
 vi.mocked(GetSnapshot).mockResolvedValue(snapshot)
 vi.mocked(StartScan).mockResolvedValue(snapshot)
 vi.mocked(Events.On).mockImplementation((name,listener)=>{listeners.set(name,listener);return ()=>{listeners.delete(name)}})
 vi.mocked(Query).mockImplementation(association=>Promise.resolve({association,version:1,default:{known:true,app:archive,observedAt:'2026-11-05T10:00:00Z',stale:false,error:null},candidates:{known:true,apps:[app],observedAt:'2026-11-05T10:00:00Z',stale:false,error:null}}) as unknown as ReturnType<typeof Query>)
})


test('successful foreground requery must clear a prior row transport error',async()=>{
 let fail=true
 vi.mocked(Query).mockImplementation(association=>(association.key==='public.jpeg'&&fail ? Promise.reject(new Error('prior transport failure')):Promise.resolve({association,version:2,default:{known:true,app,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[],observedAt:'now',stale:false,error:null}})) as any)
 render(<App/>);expect(await screen.findByText('查询连接失败')).toBeVisible()
 const list=screen.getByRole('region',{name:'声明关联列表'})
 vi.spyOn(list,'getBoundingClientRect').mockReturnValue({top:0,bottom:300,height:300} as any)
 for(const row of list.querySelectorAll<HTMLButtonElement>('[data-association-id]'))vi.spyOn(row,'getBoundingClientRect').mockReturnValue({top:10,bottom:30,height:20} as any)
 fail=false
 await act(async()=>{listeners.get('defaultapps:activated')?.({data:true});await new Promise(resolve=>setTimeout(resolve,140))})
 expect(screen.queryByText('查询连接失败')).not.toBeInTheDocument()
})

const observation=(association:Association,version=2):QueryResult=>({association,version,default:{known:true,app,observedAt:'2026-11-06T10:00:00Z',stale:false,error:null},candidates:{known:true,apps:[],observedAt:'2026-11-06T10:00:00Z',stale:false,error:null}})
const rowFor=(name:string)=>screen.getByRole('button',{name}).closest('.association-row') as HTMLElement

test('fresh change snapshots clear the selected row and detail errors together',async()=>{
 vi.mocked(Query).mockImplementation(association=>Promise.resolve(observation(association)) as ReturnType<typeof Query>)
 render(<App/>);await userEvent.click(await screen.findByRole('button',{name:'PDF 文稿 com.adobe.pdf'}))
 vi.mocked(Query).mockRejectedValue(new Error('current transport failure'))
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('current transport failure')
 await act(async()=>listeners.get('defaultapps:change')?.({data:{version:1,busy:false,activeRequestID:'',requests:[],observations:[observation(pdf.association,4)],writableKinds:[],storageError:null}}))
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 expect(rowFor('PDF 文稿 com.adobe.pdf')).not.toHaveTextContent('查询连接失败')
 expect(screen.getByRole('region',{name:'当前默认应用'})).toHaveTextContent('/Applications/Reader.app')
})

test('returning to a request whose sole declaration disappeared keeps the original association and browser session',async()=>{
 const custom:Entry={...https,id:'scheme:custom-review-scheme',name:'custom-review-scheme',association:{kind:'scheme',key:'custom-review-scheme'},sources:[{kind:'declaration',inputKind:'scheme',rawInput:'custom-review-scheme',normalizedInput:'custom-review-scheme',label:'custom-review-scheme',appPath:app.path}]}
 const initial={...snapshot,entries:[...snapshot.entries!,custom],apps:[{...snapshot.apps![0],associationIDs:[...snapshot.apps![0].associationIDs!,custom.id]},snapshot.apps![1]]}
 vi.mocked(GetSnapshot).mockResolvedValue(initial);vi.mocked(StartScan).mockResolvedValue(initial)
 vi.mocked(ChangeSnapshot).mockResolvedValue({version:5,busy:true,activeRequestID:'original',requests:[{requestID:'original',association:custom.association,target:app,phase:'submitted',completion:{known:false,error:null},readback:{state:'pending'},preflight:{known:true,app:archive}}],observations:[],writableKinds:['file','scheme'],storageError:null} as any)
 render(<App/>);await screen.findByRole('button',{name:'返回请求项'})
 await userEvent.click(screen.getByRole('button',{name:'文件类型'}))
 const search=screen.getByRole('searchbox',{name:'搜索文件类型'})
 await userEvent.type(search,'.jpg')
 screen.getByRole('button',{name:'JPEG 图像 public.jpeg'}).focus();await userEvent.keyboard('{End}')
 const rows=screen.getByRole('region',{name:'关联列表'});rows.scrollTop=83
 await act(async()=>listeners.get('defaultapps:catalog')?.({data:{...snapshot,version:3,apps:[snapshot.apps![1]]}}))
 vi.mocked(Query).mockImplementation(association=>Promise.resolve({...observation(association,2),default:{...observation(association).default,app:{...app,name:association.key}}}) as ReturnType<typeof Query>)
 await userEvent.click(screen.getByRole('button',{name:'返回请求项'}))
 const detail=screen.getByRole('dialog',{name:'custom-review-scheme'})
 expect(detail).toHaveTextContent('此关联已不在当前目录中；仍按原修改请求查询。')
 expect(within(detail).getByRole('region',{name:'当前默认应用'})).toHaveTextContent('custom-review-scheme')
 expect(Query).toHaveBeenCalledWith({kind:'scheme',key:'custom-review-scheme'})
 expect(screen.getByRole('region',{name:'修改请求状态'})).toHaveTextContent('目标：/Applications/Reader.app')
 await userEvent.keyboard('{Escape}')
 expect(screen.getByRole('button',{name:'返回请求项'})).toHaveFocus()
 expect(screen.getByRole('button',{name:'文件类型'})).toHaveAttribute('aria-pressed','true')
 expect(search).toHaveValue('.jpg')
 expect(screen.getByRole('button',{name:'JPEG 导出 test.independent.jpg'})).toHaveAttribute('tabindex','0')
 expect(rows.scrollTop).toBe(83)
 await userEvent.click(screen.getByRole('button',{name:'URL 协议'}))
 await userEvent.type(screen.getByRole('searchbox',{name:'搜索URL 协议'}),'https')
 screen.getByRole('region',{name:'关联列表'}).scrollTop=42
 await userEvent.click(screen.getByRole('button',{name:'返回请求项'}));await userEvent.keyboard('{Escape}')
 expect(screen.getByRole('searchbox',{name:'搜索URL 协议'})).toHaveValue('https')
 expect(screen.getByRole('button',{name:'https https'})).toHaveAttribute('tabindex','0')
 expect(screen.getByRole('region',{name:'关联列表'}).scrollTop).toBe(42)
 await userEvent.click(screen.getByRole('button',{name:'文件类型'}))
 expect(screen.getByRole('searchbox',{name:'搜索文件类型'})).toHaveValue('.jpg')
 expect(screen.getByRole('region',{name:'关联列表'}).scrollTop).toBe(83)
})

test('reparse follows the complete catalog result even when its event precedes the bridge reply',async()=>{
 const resolved=pdf
 const unresolved:Entry={...pdf,id:'opaque-original',sources:[],association:{kind:'file',key:''},resolved:false,unresolvedReason:'temporary unavailable'}
 const manualNeighbor={...otherJPEG,sources:[{...otherJPEG.sources![0],kind:'manual'}]}
 const initial={...snapshot,entries:[jpeg,manualNeighbor,unresolved,https],apps:[{...snapshot.apps![0],associationIDs:[jpeg.id,unresolved.id]}]}
 vi.mocked(List).mockResolvedValue([unresolved,https]);vi.mocked(GetSnapshot).mockResolvedValue(initial);vi.mocked(StartScan).mockResolvedValue(initial)
 render(<App/>);await userEvent.click(await screen.findByRole('button',{name:'文件类型'}));await userEvent.click(screen.getByRole('button',{name:'PDF 文稿 未解析'}))
 let token='',reply!:(value:Snapshot)=>void
 vi.mocked(Reparse).mockImplementation((_entry,value)=>{
  token=value
  queueMicrotask(()=>listeners.get('defaultapps:catalog')?.({data:{...initial,version:3,scanning:true,entries:[resolved,https]}}))
  return new Promise<Snapshot>(resolve=>{reply=resolve}) as ReturnType<typeof Reparse>
 })
 vi.mocked(List).mockResolvedValue([resolved,https])
 await userEvent.click(screen.getByRole('button',{name:'重新解析'}))
 expect(Reparse).toHaveBeenCalledWith(unresolved,token)
 expect(screen.getByText(/正在扫描应用/)).toBeVisible()
 expect(screen.getByRole('dialog',{name:'PDF 文稿'})).toHaveTextContent('temporary unavailable')
 expect(screen.getByRole('button',{name:'JPEG 图像 public.jpeg'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'JPEG 导出 test.independent.jpg'})).toBeInTheDocument()
 const complete={...initial,version:4,entries:[jpeg,manualNeighbor,resolved,https],apps:[{...initial.apps[0],associationIDs:[jpeg.id,resolved.id]}],reparses:[{token,status:'matched',entryID:resolved.id}]}
 await act(async()=>listeners.get('defaultapps:catalog')?.({data:complete}))
 const detail=screen.getByRole('dialog',{name:'PDF 文稿'})
 expect(detail).not.toHaveTextContent('temporary unavailable')
 expect(within(detail).getByRole('region',{name:'当前默认应用'})).toHaveTextContent('/Volumes/Archive/Reader.app')
 expect(within(detail).getByRole('region',{name:'关联来源'})).toHaveTextContent('常用项')
 expect(Query).toHaveBeenCalledWith({kind:'file',key:'com.adobe.pdf'})
 expect(screen.getByRole('button',{name:'JPEG 图像 public.jpeg'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'JPEG 导出 test.independent.jpg'})).toBeInTheDocument()
 await act(async()=>reply({...initial,version:3,scanning:true}))
 await act(async()=>listeners.get('defaultapps:catalog')?.({data:{...complete,version:3,reparses:[{token,status:'missing'}]}}))
 expect(detail).not.toHaveTextContent('temporary unavailable')
 expect(detail).toBeInTheDocument()
})

test('a newly ambiguous source requires an explicit type choice and still unresolved sources remain query-disabled',async()=>{
 const source={kind:'declaration',inputKind:'extension',rawInput:'shared',normalizedInput:'shared',label:'Shared type',appPath:app.path}
 const unresolved={...pdf,id:'unresolved:extension:shared',association:{kind:'file',key:''},name:'Shared type',sources:[source],resolved:false,unresolvedReason:'not yet registered'}
 const initial={...snapshot,apps:[],entries:[unresolved,https]}
 vi.mocked(List).mockResolvedValue([]);vi.mocked(GetSnapshot).mockResolvedValue(initial);vi.mocked(StartScan).mockResolvedValue(initial)
 render(<App/>);await userEvent.click(await screen.findByRole('button',{name:'文件类型'}));await userEvent.click(screen.getByRole('button',{name:'Shared type 未解析'}))
 vi.mocked(Reparse).mockImplementation((_entry,token)=>Promise.resolve<Snapshot>({...initial,version:3,entries:[{...unresolved,unresolvedReason:'still unavailable'},https],reparses:[{token,status:'matched',entryID:unresolved.id}]}) as ReturnType<typeof Reparse>)
 await userEvent.click(screen.getByRole('button',{name:'重新解析'}))
 expect(screen.getByRole('dialog',{name:'Shared type'})).toHaveTextContent('still unavailable')
 expect(Query).not.toHaveBeenCalled()
 const first={...pdf,name:'First type',sources:[source]},second={...jpeg,name:'Second type',sources:[source]}
 vi.mocked(Reparse).mockImplementation((_entry,token)=>Promise.resolve<Snapshot>({...initial,version:4,entries:[first,second,https],reparses:[{token,status:'ambiguous'}]}) as ReturnType<typeof Reparse>)
 await userEvent.click(screen.getByRole('button',{name:'重新解析'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(screen.getByText('此输入解析为多个文件类型，请在列表中选择具体类型。')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'Second type public.jpeg'}))
 expect(screen.getByRole('dialog',{name:'Second type'})).toHaveTextContent('public.jpeg')
})

const unresolvedPDF:Entry={...pdf,id:'opaque-unresolved',association:{kind:'file',key:''},resolved:false,unresolvedReason:'temporarily unavailable'}
const unresolvedCatalog:Snapshot={...snapshot,apps:[],entries:[jpeg,unresolvedPDF,https]}
async function openUnresolvedPDF() {
 vi.mocked(List).mockResolvedValue(unresolvedCatalog.entries!)
 vi.mocked(GetSnapshot).mockResolvedValue(unresolvedCatalog)
 vi.mocked(StartScan).mockResolvedValue(unresolvedCatalog)
 render(<App/>);await userEvent.click(await screen.findByRole('button',{name:'文件类型'}));await userEvent.click(screen.getByRole('button',{name:'PDF 文稿 未解析'}))
}

test.each(['matched','ambiguous','missing'])('a late %s reparse result preserves the newer selection and focus',async(status)=>{
 await openUnresolvedPDF()
 vi.mocked(Reparse).mockResolvedValue({...unresolvedCatalog,version:3,scanning:true})
 await userEvent.click(screen.getByRole('button',{name:'重新解析'}))
 const token=vi.mocked(Reparse).mock.calls[0][1]
 await userEvent.click(screen.getByRole('button',{name:'关闭PDF 文稿'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'JPEG 图像 public.jpeg'}))
 const focused=document.activeElement
 await act(async()=>listeners.get('defaultapps:catalog')?.({data:{...unresolvedCatalog,version:4,entries:[jpeg,pdf,https],reparses:[{token,status,entryID:status==='matched'?pdf.id:undefined}]}}))
 expect(screen.getByRole('dialog',{name:'JPEG 图像'})).toBeVisible()
 expect(screen.getByRole('button',{name:'JPEG 图像 public.jpeg'})).toHaveAttribute('tabindex','0')
 expect(document.activeElement).toBe(focused)
 expect(screen.queryByText('此输入解析为多个文件类型，请在列表中选择具体类型。')).not.toBeInTheDocument()
 expect(screen.queryByText('此关联来源已不在当前目录中，请重新选择关联。')).not.toBeInTheDocument()
})
