import { act, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type { QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import App from './App'
import { GetSnapshot, StartScan } from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import { Events } from '@wailsio/runtime'
import userEvent from '@testing-library/user-event'

vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service', () => ({ Query: vi.fn(),GetSnapshot:()=>Promise.resolve({version:0,busy:false,activeRequestID:'',requests:[],observations:[],writableKinds:[],storageError:null}) }))
vi.mock('../bindings/github.com/sunven/default-apps/internal/catalog/service', () => ({ List: vi.fn() }))
vi.mock('../bindings/github.com/sunven/default-apps/internal/discovery/service', () => ({ GetSnapshot:vi.fn(), StartScan:vi.fn() }))
vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({GetStatus:()=>Promise.resolve({error:'',associations:0,applications:0})}))
vi.mock('@wailsio/runtime', () => ({ Events:{On:vi.fn(() => () => {})} }))
const emptySnapshot: Snapshot = {version:1,scanning:false,apps:[],entries:[],issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
const pdfEntry: Entry = {id:'file:com.adobe.pdf',association:{kind:'file',key:'com.adobe.pdf'},name:'PDF 文稿',extensions:['pdf'],mimeTypes:['application/pdf'],sources:[{kind:'common',inputKind:'extension',rawInput:'pdf',normalizedInput:'pdf',label:'PDF 文稿'}],resolved:true,unresolvedReason:'',diagnosticIdentifiers:[]}
const observedAt = '2026-11-05T10:00:00Z'
const observation: QueryResult = {
 association: {kind: 'file', key: 'com.adobe.pdf'}, version: 1,
 default: {known: true, app: {path: '/Volumes/Archive/Reader.app', displayPath: '/Volumes/Archive/Reader.app', name: 'Reader', version: '2.0', bundleID: 'test.reader'}, observedAt, stale: false, error: null},
 candidates: {known: true, apps: [{path: '/Applications/Preview.app', displayPath: '/Applications/Preview.app', name: '预览', version: '11.0', bundleID: 'com.apple.Preview'}], observedAt, stale: false, error: null},
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(List).mockResolvedValue([pdfEntry]); vi.mocked(GetSnapshot).mockResolvedValue(emptySnapshot); vi.mocked(StartScan).mockResolvedValue(emptySnapshot);vi.mocked(Events.On).mockReturnValue(() => {}) })

async function closeDetails() {while(screen.queryAllByRole('dialog').length) await userEvent.keyboard('{Escape}')}
async function openEntry(name:string|RegExp) {await closeDetails();await userEvent.click(screen.getByRole('button',{name}))}
async function renderFile() {render(<App />);await userEvent.click(screen.getByRole('button',{name:'文件类型'}));const first=document.querySelector<HTMLButtonElement>('[data-association-id]');if(first)await userEvent.click(first)}
const current=()=>within(screen.getByRole('region',{name:'当前默认应用'}))

test('shows the PDF current default and independently returned candidate copies', async () => {
 vi.mocked(Query).mockResolvedValue(observation)
 await renderFile()
 const current=await screen.findByRole('region',{name: '当前默认应用'})
 expect(await within(current).findByText('Reader')).toBeVisible()
 expect(within(current).getByText('/Volumes/Archive/Reader.app')).toBeVisible()
 expect(within(current).getByText('版本 2.0')).toBeVisible()
 const candidates=screen.getByRole('region',{name:'系统候选应用'})
 expect(within(candidates).getByText('预览')).toBeVisible()
 expect(within(candidates).queryByText('Reader')).not.toBeInTheDocument()
})

test('distinguishes a successful missing default from an empty candidate list', async () => {
 vi.mocked(Query).mockResolvedValue({...observation, default: {...observation.default, app: null}, candidates: {...observation.candidates, apps: []}})
 await renderFile()
 expect(await screen.findByText('系统未返回默认应用')).toBeVisible()
 expect(screen.getByText('系统未返回候选应用')).toBeVisible()
 expect(screen.queryByText('正在查询…')).not.toBeInTheDocument()
})

test('refresh keeps the last default visible and marks a failed update while candidates succeed', async () => {
 vi.mocked(Query).mockResolvedValueOnce(observation).mockResolvedValueOnce({...observation, version: 2,
  default: {...observation.default, stale: true, error: {message:'系统服务暂时不可用'}},
  candidates: {...observation.candidates, apps: []},
 })
 await renderFile()
 expect(await current().findByText('Reader')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(await screen.findByText(/默认应用待更新/)).toBeVisible()
 expect(current().getByText('Reader')).toBeVisible()
 expect(screen.getByText('系统服务暂时不可用')).toBeVisible()
 expect(screen.getByText('系统未返回候选应用')).toBeVisible()
})

test('shows independent initial errors and allows retry to a valid empty observation', async () => {
 vi.mocked(Query).mockResolvedValueOnce({...observation,
  default: {...observation.default, known:false, app:null, error:{message:'默认查询不可用'}},
  candidates: {...observation.candidates, known:false, apps:[], error:{message:'候选查询不可用'}},
 }).mockResolvedValueOnce({...observation, default:{...observation.default, app:null}, candidates:{...observation.candidates,apps:[]}})
 await renderFile()
 expect(await screen.findByText('默认应用查询失败')).toBeVisible()
 expect(screen.getByText('候选应用查询失败')).toBeVisible()
 expect(screen.queryByText('系统未返回默认应用')).not.toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(await screen.findByText('系统未返回默认应用')).toBeVisible()
 expect(screen.queryByText('默认应用查询失败')).not.toBeInTheDocument()
})

test('shows loading without inventing an empty default, then retains data during a refresh', async () => {
 let complete!: (value: QueryResult) => void
 const pending = new Promise<QueryResult>(resolve => { complete=resolve })
 vi.mocked(Query).mockReturnValueOnce(pending as ReturnType<typeof Query>)
 await renderFile()
 expect(await screen.findByText('正在读取系统默认…')).toBeVisible()
 expect(screen.getByText('正在读取系统候选…')).toBeVisible()
 expect(screen.getByRole('button',{name:'正在查询…'})).toBeDisabled()
 await act(async () => complete(observation))
 const refreshing = new Promise<QueryResult>(resolve => { complete=resolve })
 vi.mocked(Query).mockReturnValueOnce(refreshing as ReturnType<typeof Query>)
 await userEvent.click(screen.getByRole('button',{name:'重新查询'}))
 expect(current().getByText('Reader')).toBeVisible()
 expect(screen.getByRole('button',{name:'正在查询…'})).toBeDisabled()
 await act(async () => complete({...observation,version:2}))
 expect(screen.getByRole('button',{name:'重新查询'})).toBeEnabled()
})

test('keyboard users can focus the scrollable results after the refresh control', async () => {
 vi.mocked(Query).mockResolvedValue(observation)
 await renderFile()
 await current().findByText('Reader')
 screen.getByRole('button',{name:'重新查询'}).focus()
 expect(screen.getByRole('button',{name:'重新查询'})).toHaveFocus()
 await userEvent.tab()
 expect(screen.getByRole('region',{name:'PDF 文稿 查询结果'})).toHaveFocus()
})


test('browses ambiguous file identities and separate HTTP and HTTPS associations', async () => {
 const jpeg = {...pdfEntry,id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG',extensions:['jpg','jpeg']}
 const exported = {...jpeg,id:'file:com.example.export.jpg',association:{kind:'file',key:'com.example.export.jpg'},name:'JPEG export',extensions:['jpg']}
 const http = {...pdfEntry,id:'scheme:http',association:{kind:'scheme',key:'http'},name:'http',extensions:[],mimeTypes:[]}
 const https = {...http,id:'scheme:https',association:{kind:'scheme',key:'https'},name:'https'}
 vi.mocked(List).mockResolvedValue([pdfEntry,jpeg,exported,http,https])
 vi.mocked(Query).mockImplementation(association => Promise.resolve({...observation,association,default:{...observation.default,app:{...observation.default.app!,name:association.key}}}) as ReturnType<typeof Query>)
 await renderFile()
 await openEntry(/JPEG public.jpeg/)
 expect(await within(screen.getByRole('region',{name:'当前默认应用'})).findByText('public.jpeg')).toBeVisible()
 expect(screen.getByRole('button',{name:/JPEG export com.example.export.jpg/})).toBeVisible()
 expect(screen.getByRole('region',{name:'关联来源'})).toHaveTextContent('常用项')
 await closeDetails();await userEvent.click(screen.getByRole('button',{name:'URL 协议'}))
 await openEntry('https https')
 expect(await within(screen.getByRole('region',{name:'当前默认应用'})).findByText('https')).toBeVisible()
 await openEntry('http http')
 expect(await within(screen.getByRole('region',{name:'当前默认应用'})).findByText('http')).toBeVisible()
 expect(Query).toHaveBeenCalledWith({kind:'scheme',key:'http'})
 expect(Query).toHaveBeenCalledWith({kind:'scheme',key:'https'})
})


test('unresolved inputs explain the file identification path without querying a fabricated type', async () => {
 vi.mocked(List).mockResolvedValue([{...pdfEntry,id:'unresolved:extension:odd',association:{kind:'file',key:''},name:'Unknown',resolved:false,unresolvedReason:'系统仅返回动态类型',diagnosticIdentifiers:['dyn.example']}])
 await renderFile()
 expect(await screen.findByText('系统仅返回动态类型')).toBeVisible()
 expect(screen.getByText(/选择文件识别类型/)).toBeVisible()
 expect(screen.queryByText('系统未返回默认应用')).not.toBeInTheDocument()
 expect(Query).not.toHaveBeenCalled()
 expect(screen.getByRole('button',{name:'重新解析'})).toBeEnabled()
})

test('catalog failure has a retry and an empty protocol view hides previous details', async () => {
 vi.mocked(List).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce([pdfEntry])
 vi.mocked(Query).mockResolvedValue(observation)
 await renderFile()
 expect(await screen.findByText('关联目录暂时不可用')).toBeVisible()
 expect(screen.queryByText('系统未返回默认应用')).not.toBeInTheDocument()
 await userEvent.click(screen.getByRole('button',{name:'重试加载目录'}))
 await openEntry('PDF 文稿 com.adobe.pdf')
 expect(await current().findByText('Reader')).toBeVisible()
 await closeDetails();await userEvent.click(screen.getByRole('button',{name:'URL 协议'}))
 expect(screen.getByText('此入口暂无关联')).toBeVisible()
 expect(screen.queryByText('Reader')).not.toBeInTheDocument()
})

test('returning to a type after a transport failure keeps that types own last observation', async () => {
 const jpeg = {...pdfEntry,id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG'}
 vi.mocked(List).mockResolvedValue([pdfEntry,jpeg])
 let pdfCalls=0
 vi.mocked(Query).mockImplementation(association=>(association.key===jpeg.association.key ? Promise.resolve({...observation,association,default:{...observation.default,app:null}}) : ++pdfCalls===1 ? Promise.resolve(observation) : Promise.reject(new Error('连接已断开'))) as ReturnType<typeof Query>)
 await renderFile()
 await current().findByText('Reader')
 await openEntry('JPEG public.jpeg')
 expect(await screen.findByText('系统未返回默认应用')).toBeVisible()
 await openEntry('PDF 文稿 com.adobe.pdf')
 expect(await screen.findByRole('alert')).toHaveTextContent('显示最后有效观察')
 expect(current().getByText('Reader')).toBeVisible()
})


test('opens with installed copies, declared associations, and an independent default outside the scan', async () => {
 const app={path:'/Applications/Reader.app',displayPath:'/Applications/Reader.app',name:'Reader',version:'1',bundleID:'test.reader'}
 const second={...app,path:'/Volumes/Tools/Reader.app',displayPath:'/Volumes/Tools/Reader.app',version:'2'}
 const snapshot:Snapshot={...emptySnapshot,version:2,entries:[pdfEntry],apps:[
  {app,associationIDs:[pdfEntry.id],issues:[],declarations:[],definitions:[]},
  {app:second,associationIDs:[],issues:[],declarations:[],definitions:[]},
 ],issues:[{path:'/Applications/Broken.app',origin:'Info.plist',message:'无法读取声明'}]}
 vi.mocked(StartScan).mockResolvedValue(snapshot)
 vi.mocked(Query).mockResolvedValue(observation)
 render(<App />)
 expect(screen.getByRole('button',{name:'应用'})).toHaveAttribute('aria-pressed','true')
 const apps=await screen.findByRole('region',{name:'已安装应用列表'})
 expect(await within(apps).findByText('/Applications/Reader.app')).toBeVisible()
 expect(within(apps).getByText('/Volumes/Tools/Reader.app')).toBeVisible()
 expect(await screen.findByRole('region',{name:'声明关联列表'})).toHaveTextContent('PDF 文稿')
 await openEntry('PDF 文稿 com.adobe.pdf')
 expect(await within(screen.getByRole('region',{name:'当前默认应用'})).findByText('/Volumes/Archive/Reader.app')).toBeVisible()
 expect(screen.getByText('扫描问题 · 1')).toBeVisible()
 await userEvent.click(screen.getByRole('button',{name:'查看此副本 /Volumes/Archive/Reader.app'}))
 expect(screen.getByRole('region',{name:'所选应用副本'})).toHaveTextContent('/Volumes/Archive/Reader.app')
 await closeDetails();await userEvent.click(within(apps).getByRole('button',{name:/Reader 2/}))
 expect(screen.getByText('此应用未声明可处理的文件类型或 URL 协议')).toBeVisible()
 expect(screen.queryByRole('region',{name:'当前默认应用'})).not.toBeInTheDocument()
})


test('newer scan events win over a late snapshot and every declared type gets its own default', async () => {
 let callback!: (event:{data:Snapshot})=>void
 vi.mocked(Events.On).mockImplementation((name,listener)=>{if(name==='defaultapps:catalog')callback=listener as typeof callback;return ()=>{}})
 let resolveSnapshot!: (value:Snapshot)=>void
 vi.mocked(GetSnapshot).mockReturnValue(new Promise(resolve=>{resolveSnapshot=resolve}) as ReturnType<typeof GetSnapshot>)
 const jpeg={...pdfEntry,id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG'}
 const app={path:'/Applications/Viewer.app',displayPath:'/Applications/Viewer.app',name:'Viewer',version:'3',bundleID:'test.viewer'}
 const snapshot:Snapshot={...emptySnapshot,version:4,entries:[pdfEntry,jpeg],apps:[{app,associationIDs:[pdfEntry.id,jpeg.id],issues:[],declarations:[],definitions:[]}]}
 vi.mocked(StartScan).mockResolvedValue({...emptySnapshot,version:2,scanning:true})
 vi.mocked(Query).mockImplementation(association=>Promise.resolve({...observation,association,default:{...observation.default,app:{...app,name:association.kind==='file'&&association.key==='public.jpeg'?'Photo Editor':'PDF Reader'}}}) as ReturnType<typeof Query>)
 render(<App />)
 await act(async()=>{callback({data:snapshot});resolveSnapshot({...emptySnapshot,version:1})})
 expect(await screen.findByRole('heading',{name:'Viewer',level:1})).toBeVisible()
 const rows=screen.getByRole('region',{name:'声明关联列表'})
 expect(await within(rows).findByText('Photo Editor')).toBeVisible()
 expect(within(rows).getByText('PDF Reader')).toBeVisible()
})


test('a declaration row reports a failed default query without turning it into no default', async () => {
 const jpeg={...pdfEntry,id:'file:public.jpeg',association:{kind:'file',key:'public.jpeg'},name:'JPEG'}
 const app={path:'/Applications/Viewer.app',displayPath:'/Applications/Viewer.app',name:'Viewer',version:'3',bundleID:'test.viewer'}
 vi.mocked(StartScan).mockResolvedValue({...emptySnapshot,version:4,entries:[pdfEntry,jpeg],apps:[{app,associationIDs:[pdfEntry.id,jpeg.id],issues:[],declarations:[],definitions:[]}]})
 vi.mocked(Query).mockImplementation(association=>(association.key==='public.jpeg' ? Promise.reject(new Error('连接不可用')) : Promise.resolve(observation)) as ReturnType<typeof Query>)
 render(<App />)
 const rows=await screen.findByRole('region',{name:'声明关联列表'})
 expect(await within(rows).findByText('查询连接失败')).toBeVisible()
 expect(within(rows).queryByText('无默认应用')).not.toBeInTheDocument()
})
