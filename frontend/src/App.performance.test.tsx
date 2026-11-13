import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {Events} from '@wailsio/runtime'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import {List} from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import {GetSnapshot,StartScan} from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type {Association,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import App from './App'

const {renderIcon}=vi.hoisted(()=>({renderIcon:vi.fn()}))
vi.mock('./ApplicationIcon',()=>({ApplicationIcon:(props:unknown)=>{renderIcon(props);return null}}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service',()=>({Query:vi.fn(),GetSnapshot:()=>Promise.resolve({version:0,busy:false,activeRequestID:'',requests:[],observations:[],writableKinds:['file'],storageError:null})}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/catalog/service',()=>({List:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/discovery/service',()=>({GetSnapshot:vi.fn(),StartScan:vi.fn(),Reparse:vi.fn()}))
vi.mock('../bindings/github.com/sunven/default-apps/internal/manual/service',()=>({GetStatus:()=>Promise.resolve({error:'',associations:0,applications:0})}))
vi.mock('@wailsio/runtime',()=>({Events:{On:vi.fn()}}))

const app={name:'Reader',version:'2.4',path:'/Applications/Reader.app',displayPath:'/Applications/Reader.app',bundleID:'test.reader'}
const entries:Entry[]=Array.from({length:8},(_,index)=>({id:`file:test.${index}`,association:{kind:'file',key:`test.${index}`},name:`Type ${index}`,resolved:true,extensions:[],mimeTypes:[],sources:[],unresolvedReason:'',diagnosticIdentifiers:[]}))
const snapshot={version:2,scanning:false,entries,apps:[{app,associationIDs:entries.map(entry=>entry.id),declarations:[],definitions:[],issues:[]}],issues:[],roots:[],startedAt:'',completedAt:'',durationMS:0}
const observation=(association:Association,version=1):QueryResult=>({association,version,default:{known:true,app,observedAt:'now',stale:false,error:null},candidates:{known:true,apps:[],observedAt:'now',stale:false,error:null}})
const listeners=new Map<string,(event:{data:QueryResult})=>void>()

beforeEach(()=>{
 vi.resetAllMocks();listeners.clear()
 vi.mocked(List).mockResolvedValue(entries)
 vi.mocked(GetSnapshot).mockResolvedValue(snapshot)
 vi.mocked(StartScan).mockResolvedValue(snapshot)
 vi.mocked(Query).mockImplementation(association=>Promise.resolve(observation(association)) as ReturnType<typeof Query>)
 vi.mocked(Events.On).mockImplementation((name,listener)=>{listeners.set(name,listener as never);return()=>{listeners.delete(name)}})
})
afterEach(()=>vi.restoreAllMocks())

test('an observation update renders only its default application cell in the real table',async()=>{
 render(<App/>)
 await screen.findByRole('button',{name:'Type 7 test.7'})
 await act(async()=>{})
 renderIcon.mockClear()
 const changed=entries[3]
 const updated={...observation(changed.association,2),default:{...observation(changed.association).default,app:{...app,name:'Updated Reader'}}}
 await act(async()=>listeners.get('defaultapps:observation')?.({data:updated}))
 const row=screen.getByRole('button',{name:'Type 3 test.3'}).closest('.association-row') as HTMLElement
 expect(within(row).getByText('Updated Reader')).toBeVisible()
 const defaultIcons=renderIcon.mock.calls.filter(([props])=>props.className==='application-icon--compact')
 expect(defaultIcons).toHaveLength(1)
})

test('switching large catalogs mounts a bounded set of rows and keeps keyboard access to the last result',async()=>{
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(600)
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(1000)
 vi.spyOn(HTMLElement.prototype,'offsetHeight','get').mockReturnValue(60)
 const files=Array.from({length:800},(_,index)=>({...entries[0],id:`file:test.${index}`,association:{kind:'file',key:`test.${index}`},name:`Type ${index}`}))
 const schemes=Array.from({length:160},(_,index)=>({...entries[0],id:`scheme:protocol${index}`,association:{kind:'scheme',key:`protocol${index}`},name:`Protocol ${index}`}))
 const catalog=[...files,...schemes]
 const data={...snapshot,entries:catalog,apps:[{...snapshot.apps[0],associationIDs:[files[0].id]}]}
 vi.mocked(List).mockResolvedValue(catalog)
 vi.mocked(GetSnapshot).mockResolvedValue(data)
 vi.mocked(StartScan).mockResolvedValue(data)
 render(<App/>)
 await screen.findByRole('button',{name:'Type 0 test.0'})
 for(const name of ['文件类型','URL 协议','文件类型']){
  fireEvent.click(screen.getByRole('button',{name}))
  const table=screen.getByRole('table',{name:'关联目录'})
  expect(table.querySelectorAll('.association-row').length).toBeLessThan(40)
  expect(table).toHaveAttribute('aria-rowcount',name==='文件类型'?'801':'161')
 }
 const first=screen.getByRole('button',{name:'Type 0 test.0'})
 first.focus()
 fireEvent.keyDown(first,{key:'End'})
 const last=screen.getByRole('button',{name:'Type 799 test.799'})
 expect(last).toHaveFocus()
 expect(last.closest('tr')).toHaveAttribute('aria-rowindex','801')
 fireEvent.click(last)
 expect(screen.getByRole('dialog',{name:'Type 799'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'关闭Type 799'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'全选当前筛选结果'}))
 expect(screen.getByRole('region',{name:'已选文件类型'})).toHaveTextContent('已选 800 个类型')
 fireEvent.change(screen.getByRole('searchbox',{name:'搜索文件类型'}),{target:{value:'test.799'}})
 expect(screen.getByRole('button',{name:'Type 799 test.799'})).toBeVisible()
 expect(screen.getByRole('checkbox',{name:'勾选 Type 799 test.799'})).toBeChecked()
 expect(screen.getByRole('table',{name:'关联目录'}).querySelectorAll('.association-row')).toHaveLength(1)
})
