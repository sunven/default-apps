import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Dialog } from './Dialog'
import { LifecycleStatus, useRecoveryAction } from './Lifecycle'
import { ChangeStatus, useChanges, requestLabel } from './Changes'
import { ManualActions, ManualApplicationAction } from './ManualActions'
import { Events } from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import { GetSnapshot, StartScan } from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import { useAssociationQueries, isTrustworthy } from './useAssociationQueries'
import { isComposing, plainKey } from './keyboard'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'

function ApplicationCopy({ app, onSelect, missing=false, onSubmit, disabled=false }: { app: AppCopy; onSelect?: (app:AppCopy) => void; missing?:boolean; onSubmit?:(app:AppCopy)=>void; disabled?:boolean }) {
 return <div className="application-copy">
  <div className="copy-heading"><strong>{app.name || app.path.split('/').pop()}</strong><span>版本 {app.version || '未知'}</span></div>
  <p className="copy-path">{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
  {missing ? <p className="query-error">目录中已找不到此副本；以上仍是系统实际查询结果。</p> : null}
  {app.metadataError ? <p className="query-error">应用信息暂不可用：{app.metadataError}</p> : null}
  {onSubmit ? <button className="change-copy-action" aria-label={`设为默认应用 ${app.path}`} disabled={disabled} onClick={()=>onSubmit(app)}>设为默认应用</button> : null}
  {onSelect ? <button className="copy-select" aria-label={`查看此副本 ${app.path}`} onClick={() => onSelect(app)}>查看此副本</button> : null}
 </div>
}

function Sources({ entry }: { entry: Entry }) {
 const names: Record<string, string> = {common:'常用项', declaration:'应用声明', manual:'手动添加'}
 return <section aria-labelledby="source-heading" className="sources"><h2 id="source-heading">关联来源</h2>
  <ul>{entry.sources?.map((source, index) => <li key={index}>{names[source.kind] ?? source.kind} · {source.label} · {source.rawInput}{source.appPath ? ` · ${source.appPath}` : ''}{source.role ? ` · ${source.role}` : ''}{source.rank ? ` / ${source.rank}` : ''}</li>)}</ul>
  {entry.mimeTypes?.length ? <p>MIME 标签：{entry.mimeTypes.join('、')}</p> : null}
 </section>
}

function DefaultCell({ entry, rowError, observation }: { entry: Entry; rowError?: string; observation?: QueryResult }) {
 if (!entry.resolved) return <>未解析</>
 if (rowError) return <>查询连接失败</>
 const value = observation?.default
 if (value?.error) return <>默认查询失败</>
 if (!value?.known) return <>尚未查询</>
 const app = value.app
 if (!app) return <>无默认应用</>
 return <><strong>{app.name}</strong><span>版本 {app.version || '未知'}</span><span className="row-path" title={app.path}>{app.path}</span></>
}

type View = 'app' | 'file' | 'scheme'
const viewNames:Record<View,string> = {app:'应用',file:'文件类型',scheme:'URL 协议'}
const entryName = (entry:Entry) => entry.name || entry.sources?.[0]?.rawInput || '关联'
const entryText = (entry:Entry) => [entry.name,entry.association.key,...(entry.extensions ?? []).map(value=>'.'+value),...(entry.mimeTypes ?? []),...(entry.sources ?? []).flatMap(source=>[source.rawInput,source.label])].join(' ').toLocaleLowerCase()
function focusElement(element:HTMLElement|null|undefined) { element?.focus({preventScroll:true});element?.scrollIntoView?.({block:'nearest'}) }

export default function App() {
 const changes=useChanges()
 const recovery=useRecoveryAction(changes)
 const [entries,setEntries] = useState<Entry[]>([])
 const [kind,setKind] = useState<View>('app')
 const [appQuery,setAppQuery] = useState('')
 const [filter,setFilter] = useState('')
 const [selectedAppPath,setSelectedAppPath] = useState<string|null>(null)
 const [selectedID,setSelectedID] = useState<string|null>(null)
 const [snapshot,setSnapshot] = useState<Snapshot|null>(null)
 const [issuesOpen,setIssuesOpen] = useState(false)
 const [detailOpen,setDetailOpen] = useState(false)
 const [requestEntry,setRequestEntry] = useState<Entry|null>(null)
 const [inspectedCopy,setInspectedCopy] = useState<AppCopy|null>(null)
 const [catalogLoading,setCatalogLoading] = useState(true)
 const [catalogError,setCatalogError] = useState<string|null>(null)
 const [reparseNotice,setReparseNotice] = useState<string|null>(null)
 const reparseAnchor=useRef<{entry:Entry;version:number}|null>(null)
 const {observations,rowErrors,query,acceptObservation}=useAssociationQueries()
 const [loading,setLoading] = useState(false)
 const scanVersion=useRef(0),catalogVersion=useRef(0),requestVersion=useRef(0)
 const appSearch=useRef<HTMLInputElement>(null),associationSearch=useRef<HTMLInputElement>(null)
 const appList=useRef<HTMLDivElement>(null),associationList=useRef<HTMLDivElement>(null)
 const sessions=useRef<Record<View,{query:string;selectedID:string|null;scroll:number}>>({app:{query:'',selectedID:null,scroll:0},file:{query:'',selectedID:null,scroll:0},scheme:{query:'',selectedID:null,scroll:0}})
 const appScroll=useRef(0)
 const discoveredPaths=useRef(new Set<string>())
 const applicationMatches=useMemo(()=>{
  const term=appQuery.trim().toLocaleLowerCase()
  const index=new Map(entries.map(entry=>[entry.id,entry]))
  return (snapshot?.apps ?? []).filter(item=>!item.unavailable).map(item=>{
   const metadataMatch=!term || [item.app.name,item.app.version,item.app.path,item.app.displayPath,item.app.bundleID].join(' ').toLocaleLowerCase().includes(term)
   const declarations=(item.associationIDs ?? []).flatMap(id=>index.get(id) ?? [])
   return {item,metadataMatch,entries:metadataMatch ? declarations : declarations.filter(entry=>entryText(entry).includes(term))}
  }).filter(match=>match.metadataMatch || match.entries.length)
 },[snapshot,entries,appQuery])
 const catalogSettled=!!snapshot&&!snapshot.scanning
 const inCatalog=(path:string)=>!!snapshot?.apps?.some(item=>!item.unavailable&&item.app.path===path)
 const missingAppPath=selectedAppPath&&catalogSettled&&!inCatalog(selectedAppPath)?selectedAppPath:null
 const selectedMatch=missingAppPath ? undefined : (selectedAppPath?applicationMatches.find(match=>match.item.app.path===selectedAppPath):applicationMatches[0])
 const selectedApp=selectedMatch?.item
 const emptyHeadline=()=>{if(kind!=='app')return catalogLoading?'正在加载关联目录':catalogError?'关联目录暂时不可用':filter?'没有匹配的关联项':'此入口暂无关联';if(missingAppPath)return '此副本的关联详情已清空';if(selectedApp)return selectedApp.associationIDs?.length?'没有匹配的关联项':'此应用未声明可处理的文件类型或 URL 协议';if(appQuery)return '没有匹配的应用';return snapshot?.scanning?'正在发现应用':'未发现应用'}
 useLayoutEffect(()=>{if(kind==='app' && selectedApp && selectedAppPath!==selectedApp.app.path)setSelectedAppPath(selectedApp.app.path)},[kind,selectedApp,selectedAppPath])
 const visibleEntries=useMemo(()=> (kind==='app' ? selectedMatch?.entries ?? [] : entries.filter(entry=>entry.association.kind===kind)).filter(entry=>entryText(entry).includes(filter.trim().toLocaleLowerCase())).sort((a,b)=>Number(b.sources?.some(s=>s.kind==='common'))-Number(a.sources?.some(s=>s.kind==='common'))),[kind,selectedMatch,entries,filter])
 const browsedSelected=visibleEntries.find(entry=>entry.id===selectedID) ?? visibleEntries[0]
 const selected=requestEntry ?? browsedSelected
 useEffect(()=>{if(!selected){setDetailOpen(false);setRequestEntry(null);setInspectedCopy(null)}},[selected])
 const visibleResult=selected ? observations[selected.id] : undefined
 const transportError=selected ? rowErrors[selected.id] : undefined
 const canChange=(entry:Entry|undefined,app:AppCopy|undefined)=>!!entry?.resolved&&!!app&&!app.metadataError&&!changes.blocked&&!!changes.state?.writableKinds?.includes(entry.association.kind)&&isTrustworthy(observations[entry.id]?.default)
 const submitCopy=(entry:Entry,app:AppCopy)=>{const observed=observations[entry.id]?.default;if(!observed||!canChange(entry,app))return;recovery.submit(entry.association,app,observed);setDetailOpen(false);setRequestEntry(null);setInspectedCopy(null)}
 useEffect(()=>{for(const value of changes.state?.observations??[])acceptObservation(value)},[changes.state,acceptObservation])

 const refreshCatalog=useCallback(async()=>{
  const version=++catalogVersion.current
  setCatalogLoading(true);setCatalogError(null)
  try{const values=await List();if(version===catalogVersion.current)setEntries(previous=>scanVersion.current>0 && previous.length ? previous : values ?? [])}
  catch(error){if(version===catalogVersion.current)setCatalogError(String(error))}
  finally{if(version===catalogVersion.current)setCatalogLoading(false)}
 },[])
 const acceptSnapshot=useCallback((value:Snapshot)=>{
  if(value.version<scanVersion.current)return
  scanVersion.current=value.version
  for(const item of value.apps ?? [])discoveredPaths.current.add(item.app.path)
  setSnapshot(previous=>value.scanning && previous?.apps?.length ? {...value,apps:[...new Map([...(previous.apps ?? []),...(value.apps ?? [])].map(item=>[item.app.path,item])).values()]} : value)
  setEntries(previous=>value.scanning? [...new Map([...previous,...(value.entries??[])].map(entry=>[entry.id,entry])).values()]:value.entries??[])
  const anchor=reparseAnchor.current
  if(anchor && !value.scanning && value.version>anchor.version){
   reparseAnchor.current=null
   const savedIdentity=anchor.entry.id.startsWith('unavailable:') ? anchor.entry.diagnosticIdentifiers?.find(id=>id.startsWith('file:')||id.startsWith('scheme:')) ?? anchor.entry.id.slice('unavailable:'.length) : undefined
   const matches=(value.entries??[]).filter(entry=>entry.id===anchor.entry.id || (savedIdentity ? entry.id===savedIdentity : entry.sources?.some(source=>anchor.entry.sources?.some(original=>source.kind===original.kind && source.inputKind===original.inputKind && source.rawInput===original.rawInput && source.appPath===original.appPath && source.origin===original.origin))))
   if(matches.length===1)setSelectedID(matches[0].id)
   else {setDetailOpen(false);setSelectedID(null);setReparseNotice(matches.length?'此输入解析为多个文件类型，请在列表中选择具体类型。':'此关联来源已不在当前目录中，请重新选择关联。')}
  }
 },[])
 const scan=useCallback(async()=>{setCatalogError(null);try{acceptSnapshot(await StartScan())}catch(error){reparseAnchor.current=null;setCatalogError(String(error))}},[acceptSnapshot])
 const reparse=()=>{if(!selected)return;reparseAnchor.current={entry:selected,version:scanVersion.current};setReparseNotice(null);void scan()}
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current
  if(!selected?.resolved){setLoading(false);return}
  setLoading(true)
  try{await query(selected.association,()=>version===requestVersion.current)}
  finally{if(version===requestVersion.current)setLoading(false)}
 },[selected,query])
 useEffect(()=>{
  let active=true
  const off=Events.On('defaultapps:catalog',event=>{if(active)acceptSnapshot(event.data)})
  void GetSnapshot().then(value=>{if(active)acceptSnapshot(value)}).catch(error=>{if(active)setCatalogError(String(error))})
  void scan()
  return()=>{active=false;off()}
 },[acceptSnapshot,scan])
 useEffect(()=>{void refreshCatalog();return()=>{++catalogVersion.current}},[refreshCatalog])
 useEffect(()=>{void refresh();return()=>{++requestVersion.current}},[refresh])
 useEffect(()=>{
  let active=true,cursor=0
  const pending=visibleEntries.filter(entry=>entry.resolved && entry.id!==selected?.id && !observations[entry.id])
  const worker=async()=>{while(active && cursor<pending.length){const entry=pending[cursor++];await query(entry.association,()=>active)}}
  void Promise.all(Array.from({length:Math.min(4,pending.length)},worker))
  return()=>{active=false}
 },[visibleEntries,query])
 const visibleRefresh=useRef(()=>{})
 visibleRefresh.current=()=>{
  const bounds=associationList.current?.getBoundingClientRect()
  const ids=new Set<string>(selected?[selected.id]:[])
  if(bounds&&bounds.height>0)for(const row of associationList.current?.querySelectorAll<HTMLButtonElement>('[data-association-id]')??[]){const rect=row.getBoundingClientRect();if(rect.bottom>bounds.top&&rect.top<bounds.bottom)ids.add(row.dataset.associationId!)}
  void refresh()
  for(const entry of visibleEntries)if(entry.resolved&&ids.has(entry.id)&&entry.id!==selected?.id)void query(entry.association)
 }
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined
  const off=Events.On('defaultapps:activated',()=>{if(timer!==undefined)return;timer=setTimeout(()=>{timer=undefined;visibleRefresh.current()},100)})
  return()=>{off();if(timer!==undefined)clearTimeout(timer)}
 },[])
 const selectApp=(path:string,focus=false)=>{
  reparseAnchor.current=null
  setSelectedAppPath(path);setSelectedID(null);setDetailOpen(false);setRequestEntry(null);setInspectedCopy(null)
  if(associationList.current)associationList.current.scrollTop=0
  if(focus)focusElement(Array.from(appList.current?.querySelectorAll<HTMLButtonElement>('[data-app-path]') ?? []).find(el=>el.dataset.appPath===path))
 }
 const selectEntry=(id:string,focus=false)=>{
  reparseAnchor.current=null;setReparseNotice(null)
  setSelectedID(id)
  if(focus)focusElement(Array.from(associationList.current?.querySelectorAll<HTMLButtonElement>('[data-association-id]') ?? []).find(el=>el.dataset.associationId===id))
 }
 const enterAssociations=()=>selected ? selectEntry(selected.id,true) : associationSearch.current?.focus()
 const switchView=(view:View,focus=false)=>{
  reparseAnchor.current=null
  if(view!==kind){sessions.current[kind]={query:filter,selectedID:browsedSelected?.id ?? null,scroll:associationList.current?.scrollTop ?? 0};if(kind==='app')appScroll.current=appList.current?.scrollTop ?? 0;setFilter(sessions.current[view].query);setSelectedID(sessions.current[view].selectedID)}
  setKind(view);setDetailOpen(false);setRequestEntry(null);setInspectedCopy(null)
  if(focus)document.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)?.focus()
 }
 useLayoutEffect(()=>{if(associationList.current)associationList.current.scrollTop=sessions.current[kind].scroll;if(kind==='app' && appList.current)appList.current.scrollTop=appScroll.current},[kind])
 useEffect(()=>{
  const keydown=(event:globalThis.KeyboardEvent)=>{
   if(isComposing(event) || document.querySelector('dialog[open]') || !event.metaKey || event.altKey || event.ctrlKey)return
   if(event.key.toLowerCase()==='f'){event.preventDefault();(kind==='app' ? appSearch : associationSearch).current?.focus()}
   if(['1','2','3'].includes(event.key)){event.preventDefault();switchView((['app','file','scheme'] as View[])[Number(event.key)-1],true)}
  }
  document.addEventListener('keydown',keydown)
  return()=>document.removeEventListener('keydown',keydown)
 },[kind,filter,selected?.id])
 const searchKey=(event:KeyboardEvent<HTMLInputElement>,apps=false)=>{
  if(!plainKey(event))return
  if(event.key==='ArrowDown'){event.preventDefault();if(apps && applicationMatches.length)selectApp(selectedApp?.app.path ?? applicationMatches[0].item.app.path,true);else if(!apps)enterAssociations()}
  if(event.key==='Escape'){event.preventDefault();if(apps){setAppQuery('');setSelectedAppPath(null);setSelectedID(null)}else setFilter('')}
 }
 const listKey=(event:KeyboardEvent<HTMLDivElement>,apps=false)=>{
  if(!plainKey(event) || !(event.target instanceof HTMLButtonElement)||(!apps&&!event.target.dataset.associationId))return
  const ids=apps ? applicationMatches.map(match=>match.item.app.path) : visibleEntries.map(entry=>entry.id)
  const index=Math.max(0,ids.indexOf(apps ? selectedApp?.app.path ?? '' : selected?.id ?? ''))
  const destination=event.key==='Home' ? 0 : event.key==='End' ? ids.length-1 : event.key==='ArrowDown' ? Math.min(ids.length-1,index+1) : event.key==='ArrowUp' ? Math.max(0,index-1) : -1
  if(destination>=0 && ids[destination]){event.preventDefault();if(apps)selectApp(ids[destination],true);else selectEntry(ids[destination],true)}
  if(event.key==='Enter' && apps){event.preventDefault();enterAssociations()}
 }
 const clearSearch=()=>{setAppQuery('');setFilter('');setSelectedAppPath(null);setSelectedID(null);(kind==='app' ? appSearch : associationSearch).current?.focus()}
 return <div className="app-shell">
  <header className="global-header">
   <div className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3"/></svg><span>Default Apps</span></div>
   <nav className="view-navigation" aria-label="浏览入口">{(['app','file','scheme'] as View[]).map(view=><button key={view} data-view={view} aria-pressed={kind===view} onClick={()=>switchView(view)}>{viewNames[view]}</button>)}</nav>
   <div className="header-actions"><ManualActions/><button disabled={snapshot?.scanning} onClick={()=>void scan()}>{snapshot?.scanning ? '正在扫描…' : '重新扫描应用'}</button></div>
  </header>
  <LifecycleStatus changes={changes}/>{recovery.dialog}
  <ChangeStatus changes={changes} onReturn={association=>{
   reparseAnchor.current=null
   const id=`${association.kind}:${association.key}`
   setRequestEntry(entries.find(entry=>entry.id===id) ?? {id,association,name:association.key,resolved:true,extensions:[],mimeTypes:[],sources:[],unresolvedReason:'',diagnosticIdentifiers:[]})
   setDetailOpen(true);setInspectedCopy(null)
  }}/>

  <div className={`browser-workspace ${kind==='app' ? '' : 'catalog-view'}`}>
   {kind==='app' ? <aside className="sidebar">
    <div className="catalog-heading"><h2>已安装应用</h2><span>{applicationMatches.length} / {snapshot?.apps?.length ?? 0}</span></div>
    <label className="search-field">搜索应用<input ref={appSearch} type="search" aria-label="搜索应用名称、版本、路径或声明" placeholder="名称、版本、路径或声明" value={appQuery} onChange={event=>{setAppQuery(event.target.value);setSelectedAppPath(null);setSelectedID(null);if(appList.current)appList.current.scrollTop=0;if(associationList.current)associationList.current.scrollTop=0}} onKeyDown={event=>searchKey(event,true)}/></label>
    <p className="search-hint">匹配应用信息时显示全部声明；仅声明命中时显示匹配项。</p>
    <div ref={appList} className="application-list" role="region" aria-label="已安装应用列表" onKeyDown={event=>listKey(event,true)}>{applicationMatches.map(({item})=><button key={item.app.path} data-app-path={item.app.path} className="application-row" tabIndex={item.app.path===selectedApp?.app.path || (!selectedApp && item===applicationMatches[0]?.item) ? 0 : -1} aria-pressed={item.app.path===selectedApp?.app.path} aria-label={`${item.app.name} ${item.app.version} ${item.app.path}`} onClick={()=>selectApp(item.app.path)}><strong>{item.app.name}</strong><span>版本 {item.app.version || '未知'} · {item.associationIDs?.length ?? 0} 个声明关联</span><span className="app-list-path" title={item.app.path}>{item.app.displayPath || item.app.path}</span></button>)}</div>
    <p className="sidebar-note">⌘F 搜索 · ↑ ↓ 选中 · Enter 进入关联</p>
   </aside> : null}
   <main className="workspace">
    <header className="app-heading">
     <div><h1>{kind==='app' ? selectedApp?.app.name || '已安装应用' : viewNames[kind]}</h1>
      {kind==='app' && selectedApp ? <><p>版本 {selectedApp.app.version || '未知'} · {selectedApp.app.bundleID || 'Bundle ID 未提供'}</p><p className="heading-path" title={selectedApp.app.path}>{selectedApp.app.displayPath || selectedApp.app.path}</p>{selectedApp.unavailable ? <p className="query-error" role="status">手动应用位置暂不可用 · {selectedApp.app.metadataError || '原副本未找到'}<br/>{selectedApp.app.path}</p> : selectedApp.app.metadataError ? <p className="query-error">应用信息暂不可用：{selectedApp.app.metadataError}</p> : null}</> : <p>这台 Mac 的实际默认与系统候选</p>}
     </div>{kind==='app' && selectedApp ? <button onClick={()=>setInspectedCopy(selectedApp.app)}>应用详情…</button> : null}
    </header>
    {catalogLoading || snapshot?.scanning ? <p className="scan-status" role="status">{snapshot?.scanning ? `正在扫描应用…已发现 ${snapshot.apps?.length ?? 0} 份` : '正在解析常用关联…'}</p> : null}
    {reparseNotice ? <p role="status">{reparseNotice}</p> : null}
    {catalogError ? <div className="query-error" role="alert"><p>目录加载失败{entries.length ? '，保留已解析目录。' : '。'}{catalogError}</p><button onClick={()=>void refreshCatalog()}>重试加载目录</button></div> : null}
    {kind==='app' && missingAppPath ? <div role="status" className="missing-copy"><strong>原应用副本已不在目录中</strong><p>{missingAppPath}</p><p>可选择其他应用副本继续浏览。</p></div> : null}
    <div className="association-toolbar"><div><h2>{kind==='app' ? '声明支持' : '关联目录'}</h2><p>{visibleEntries.length} 个关联 · {kind==='app' && selectedMatch && !selectedMatch.metadataMatch ? '仅显示匹配声明' : '常用关联优先'}</p></div><label className="search-field">{kind==='app' ? '筛选关联' : `搜索${viewNames[kind]}`}<input ref={associationSearch} type="search" aria-label={kind==='app' ? '筛选当前关联' : `搜索${viewNames[kind]}`} value={filter} placeholder="名称、扩展名或类型身份" onChange={event=>{setFilter(event.target.value);if(associationList.current)associationList.current.scrollTop=0}} onKeyDown={event=>searchKey(event)}/></label></div>
    <div className="column-labels"><span>关联项</span><span>当前默认应用</span><span>操作</span></div>
    <div ref={associationList} className="association-list" role="region" aria-label={kind==='app' ? '声明关联列表' : '关联列表'} onKeyDown={event=>listKey(event)}>
     {visibleEntries.map(entry=>{
      const isDefault=observations[entry.id]?.default.app?.path===selectedApp?.app.path
      return <div className="association-row" data-selected={browsedSelected?.id===entry.id} key={entry.id}>
      <button className="association-name" data-association-id={entry.id} tabIndex={browsedSelected?.id===entry.id ? 0 : -1} aria-pressed={browsedSelected?.id===entry.id} aria-label={`${entryName(entry)} ${entry.association.key || '未解析'}`} onClick={()=>{selectEntry(entry.id);setDetailOpen(true)}}><strong>{entryName(entry)}</strong><span>{entry.extensions?.map(value=>`.${value}`).join(' · ')}</span><span>{entry.association.key || entry.sources?.[0]?.rawInput}</span></button>
      <div className="declared-default"><DefaultCell entry={entry} rowError={rowErrors[entry.id]} observation={observations[entry.id]}/></div>
      <div className="row-actions"><button className="row-detail" aria-label={`查看 ${entryName(entry)} 详情`} tabIndex={browsedSelected?.id===entry.id ? 0 : -1} onClick={()=>{selectEntry(entry.id);setDetailOpen(true)}}>详情…</button>{kind==='app'&&selectedApp?<button className="row-submit" aria-label={`将 ${entryName(entry)} 设为 ${selectedApp.app.path}`} title={selectedApp.app.path} tabIndex={browsedSelected?.id===entry.id?0:-1} disabled={!canChange(entry,selectedApp.app)||selectedApp.unavailable||isDefault} onClick={()=>submitCopy(entry,selectedApp.app)}>{isDefault?'已是默认':'设为默认'}</button>:null}
      {changes.state?.requests?.filter(r=>r.association.kind===entry.association.kind&&r.association.key===entry.association.key).slice(-1).map(r=><span key={r.requestID} className="change-row-state">{requestLabel(r)}</span>)}</div>
     </div>})}
     {!visibleEntries.length ? <div className="empty-workspace"><h2>{emptyHeadline()}</h2><p>可清除搜索，或切换浏览入口继续查看这台 Mac 的默认应用。</p><div className="empty-actions"><button onClick={clearSearch}>清除搜索</button>{kind!=='file' ? <button onClick={()=>switchView('file')}>浏览文件类型</button> : null}{kind!=='scheme' ? <button onClick={()=>switchView('scheme')}>浏览 URL 协议</button> : null}</div></div> : null}
    </div>
    <footer className="browser-footer"><span>默认应用由系统独立查询</span>{snapshot?.issues?.length ? <button onClick={()=>setIssuesOpen(true)}>扫描问题 · {snapshot.issues.length}</button> : null}<span>⌘1 / 2 / 3 切换入口</span></footer>
   </main>
  </div>
  {issuesOpen ? <Dialog title="扫描问题" onClose={()=>setIssuesOpen(false)}><ul className="scan-issues">{snapshot?.issues?.map((issue,index)=><li key={index}><p>{issue.path}</p><p>{issue.origin} · {issue.message}</p></li>)}</ul></Dialog> : null}
  {inspectedCopy ? <Dialog title="所选应用副本" onClose={()=>setInspectedCopy(null)}><section aria-label="所选应用副本"><ApplicationCopy app={inspectedCopy} onSubmit={detailOpen&&selected?app=>submitCopy(selected,app):undefined} disabled={!canChange(selected,inspectedCopy)}/></section></Dialog> : null}
  {selected && detailOpen ? <Dialog title={entryName(selected)} subtitle={selected.association.key || '尚未解析'} onClose={()=>{reparseAnchor.current=null;setDetailOpen(false);setRequestEntry(null)}}>
    {requestEntry && !entries.some(entry=>entry.id===requestEntry.id) ? <p role="status" className="query-error">此关联已不在当前目录中；仍按原修改请求查询。</p> : null}
    <div className="page-heading"><div><h3>关联查询</h3><p>{selected.extensions?.map(value => `.${value}`).join(' · ')}{selected.extensions?.length ? ' · ' : ''}{selected.association.key || '尚未解析'}</p></div><button onClick={() => void (selected.resolved ? refresh() : reparse())} disabled={loading || catalogLoading || (!selected.resolved && !!snapshot?.scanning)}>{loading ? '正在查询…' : selected.resolved ? '重新查询' : '重新解析'}</button></div>
    <div className="query-content" role="region" aria-label={`${selected.name || '关联'} 查询结果`} tabIndex={0} aria-busy={loading}>
     {!selected.resolved ? <div className="query-error" role="status"><p>关联尚未解析，不能查询或修改默认应用。</p><p>{selected.unresolvedReason}</p>{selected.diagnosticIdentifiers?.length ? <p>系统诊断：{selected.diagnosticIdentifiers.join('、')}</p> : null}<ManualActions label="选择文件识别类型…" showStorageWarning={false}/></div> : <>
      {transportError ? <p role="alert" className="query-error">查询连接失败{visibleResult ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
      <section aria-labelledby="current-heading"><h2 id="current-heading">当前默认应用</h2>
       {visibleResult?.default.error ? <div className="query-error" role="status"><p>{visibleResult.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{visibleResult.default.error.message}</p></div> : null}
       {visibleResult?.default.app ? <ApplicationCopy app={visibleResult.default.app} missing={discoveredPaths.current.has(visibleResult.default.app.path) && catalogSettled && !inCatalog(visibleResult.default.app.path)} onSelect={setInspectedCopy} /> : <p>{visibleResult?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
       {visibleResult?.default.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.default.observedAt).toLocaleString()}</p> : null}
      </section>
      <section aria-labelledby="candidates-heading"><div className="section-heading"><h2 id="candidates-heading">系统候选应用</h2>{visibleResult?.candidates.known ? <span>{visibleResult.candidates.apps?.length ?? 0} 个应用副本</span> : null}</div>
       {visibleResult?.candidates.error ? <div className="query-error" role="status"><p>{visibleResult.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{visibleResult.candidates.error.message}</p></div> : null}
       {!visibleResult?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
       {visibleResult?.candidates.known && !visibleResult.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
       {visibleResult?.candidates.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.candidates.observedAt).toLocaleString()}</p> : null}
       <ManualApplicationAction association={selected.association} onSelected={setInspectedCopy}/>
       <ul className="candidate-list">{visibleResult?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} onSelect={setInspectedCopy} onSubmit={app=>submitCopy(selected,app)} disabled={!canChange(selected,app)}/></li>)}</ul>
      </section>
     </>}
     <Sources entry={selected} />
    </div>
  </Dialog> : null}
 </div>
}
