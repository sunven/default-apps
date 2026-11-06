import { ManualActions, ManualApplicationAction } from './ManualActions'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import { GetSnapshot, StartScan } from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/association/service'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'

function ApplicationCopy({ app, onSelect }: { app: AppCopy; onSelect?: (app:AppCopy) => void }) {
 return <div className="application-copy">
  <div className="copy-heading"><strong>{app.name || app.path.split('/').pop()}</strong><span>版本 {app.version || '未知'}</span></div>
  <p className="copy-path">{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
  {app.metadataError ? <p className="query-error">应用信息暂不可用：{app.metadataError}</p> : null}
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

export default function App() {
 const [entries, setEntries] = useState<Entry[]>([])
 const [kind, setKind] = useState('app')
 const [snapshot,setSnapshot] = useState<Snapshot | null>(null)
 const [selectedAppPath,setSelectedAppPath] = useState<string | null>(null)
 const [inspectedCopy,setInspectedCopy] = useState<AppCopy | null>(null)
 const scanVersion = useRef(0)
 const selectedApp = snapshot?.apps?.find(item => item.app.path===selectedAppPath) ?? snapshot?.apps?.[0]
 const [selectedID, setSelectedID] = useState<string | null>(null)
 const [catalogLoading, setCatalogLoading] = useState(true)
 const [catalogError, setCatalogError] = useState<string | null>(null)
 const [rowErrors,setRowErrors] = useState<Record<string,string>>({})
 const [observations, setObservations] = useState<Record<string, QueryResult>>({})
 const [loading, setLoading] = useState(false)
 const [transportError, setTransportError] = useState<string | null>(null)
 const requestVersion = useRef(0)
 const catalogVersion = useRef(0)
 const visibleEntries = kind==='app' ? entries.filter(entry => selectedApp?.associationIDs?.includes(entry.id)) : entries.filter(entry => entry.association.kind === kind)
 const selected = visibleEntries.find(entry => entry.id === selectedID) ?? visibleEntries[0]
 const visibleResult = selected ? observations[selected.id] : undefined

 const refreshCatalog = useCallback(async () => {
  const version = ++catalogVersion.current
  setCatalogLoading(true); setCatalogError(null)
  try {
   const values = await List()
   if (version === catalogVersion.current) setEntries(previous => scanVersion.current>0 && previous.length ? previous : values ?? [])
  } catch (error) {
   if (version === catalogVersion.current) setCatalogError(error instanceof Error ? error.message : String(error))
  } finally {
   if (version === catalogVersion.current) setCatalogLoading(false)
  }
 }, [])
 const refresh = useCallback(async () => {
  const version = ++requestVersion.current
  setTransportError(null)
  if(selected)setRowErrors(previous=>{const next={...previous};delete next[selected.id];return next})
  if (!selected?.resolved) { setLoading(false); return }
  setLoading(true)
  try {
   const value = await Query(selected.association)
   if (version === requestVersion.current) setObservations(previous => ({...previous, [selected.id]:value}))
  } catch (error) {
   if (version === requestVersion.current) {const message=error instanceof Error ? error.message : String(error);setTransportError(message);setRowErrors(previous=>({...previous,[selected.id]:message}))}
  } finally {
   if (version === requestVersion.current) setLoading(false)
  }
 }, [selected])
 const acceptSnapshot = useCallback((value:Snapshot) => {
  if (value.version < scanVersion.current) return
  scanVersion.current=value.version;setSnapshot(value)
  if (value.entries?.length) setEntries(value.entries)
 },[])
 const scan = useCallback(async () => {
  try {acceptSnapshot(await StartScan())}catch(error){setCatalogError(error instanceof Error ? error.message : String(error))}
 },[acceptSnapshot])
 useEffect(() => {
  let active=true
  const off=Events.On('defaultapps:catalog',event=>{if(active)acceptSnapshot(event.data)})
  void GetSnapshot().then(value=>{if(active)acceptSnapshot(value)}).catch(error=>{if(active)setCatalogError(error instanceof Error ? error.message : String(error))})
  void scan()
  return ()=>{active=false;off()}
 },[acceptSnapshot,scan])
 useEffect(() => { void refreshCatalog(); return () => { ++catalogVersion.current } }, [refreshCatalog])
 useEffect(() => { void refresh(); return () => { ++requestVersion.current } }, [refresh])

 useEffect(() => {
  if(kind!=='app'||!selectedApp)return
  let active=true
  const pending=entries.filter(entry=>selectedApp.associationIDs?.includes(entry.id)&&entry.resolved&&entry.id!==selected?.id&&!observations[entry.id])
  let cursor=0
  const worker=async()=>{while(active&&cursor<pending.length){const entry=pending[cursor++];try{const value=await Query(entry.association);if(active)setObservations(previous=>({...previous,[entry.id]:value}))}catch(error){if(active)setRowErrors(previous=>({...previous,[entry.id]:error instanceof Error ? error.message : String(error)}))}}}
  void Promise.all(Array.from({length:Math.min(4,pending.length)},worker))
  return()=>{active=false}
 },[kind,selectedApp?.app.path,entries])

 return <div className="app-shell">
  <aside className="sidebar">
   <div className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3" /></svg><span>Default Apps</span></div>
   <nav className="view-navigation" aria-label="浏览入口"><button aria-pressed={kind === 'app'} onClick={() => setKind('app')}>应用</button><button aria-pressed={kind === 'file'} onClick={() => setKind('file')}>文件类型</button><button aria-pressed={kind === 'scheme'} onClick={() => setKind('scheme')}>URL 协议</button></nav>
   <div className="header-actions"><ManualActions /></div>
   <div className="catalog-heading"><h2>{kind==='app' ? '已安装应用' : kind==='file' ? '文件类型' : 'URL 协议'}</h2><span>{kind==='app' ? snapshot?.apps?.length ?? 0 : visibleEntries.length}</span></div>
   {catalogLoading || snapshot?.scanning ? <p className="scan-status" role="status">{snapshot?.scanning ? `正在扫描应用…已发现 ${snapshot.apps?.length ?? 0} 份` : '正在解析常用关联…'}</p> : null}
   {catalogError ? <div className="query-error" role="alert"><p>目录加载失败{entries.length ? '，保留已解析目录。' : '。'}{catalogError}</p><button onClick={() => void refreshCatalog()}>重试加载目录</button></div> : null}
   <div className="association-list" role="region" aria-label={kind==='app' ? '已安装应用列表' : '常用关联列表'} tabIndex={0}>
    {kind==='app' ? snapshot?.apps?.map(item=><button key={item.app.path} data-app-path={item.app.path} className="association-row" aria-pressed={item.app.path===selectedApp?.app.path} aria-label={`${item.app.name} ${item.app.version} ${item.app.path}`} onClick={()=>{setSelectedAppPath(item.app.path);setSelectedID(null);setInspectedCopy(null)}}><strong>{item.app.name}</strong><span>版本 {item.app.version || '未知'} · {item.associationIDs?.length ?? 0} 个声明关联</span><span className="app-list-path">{item.app.displayPath || item.app.path}</span></button>) : visibleEntries.map(entry => <button key={entry.id} data-association-id={entry.id} className="association-row" aria-pressed={entry.id === selected?.id} aria-label={`${entry.name || entry.sources?.[0]?.rawInput} ${entry.association.key || '未解析'}`} onClick={() => setSelectedID(entry.id)}>
     <strong>{entry.name || entry.sources?.[0]?.rawInput}</strong>
     <span className="association-identity">{entry.resolved ? entry.association.key : '未解析'}</span>
     {entry.extensions?.length ? <span>{entry.extensions.map(value => `.${value}`).join(' · ')}</span> : null}
    </button>)}
   </div>
   {snapshot?.issues?.length ? <details className="scan-issues"><summary>扫描问题 · {snapshot.issues.length}</summary><ul>{snapshot.issues.map((issue,index)=><li key={index}><p>{issue.path}</p><p>{issue.origin} · {issue.message}</p></li>)}</ul></details> : null}
   {kind==='app' ? <button className="rescan" disabled={snapshot?.scanning} onClick={()=>void scan()}>{snapshot?.scanning ? '正在扫描…' : '重新扫描应用'}</button> : null}
   <p className="sidebar-note">这台 Mac 的实际默认与系统候选</p>
  </aside>
  <main className="workspace">
   {kind==='app' && selectedApp ? <>
    <header className="app-heading"><h1>{selectedApp.app.name}</h1>{selectedApp.unavailable ? <p className="query-error">应用位置不可用：{selectedApp.app.metadataError}。可通过手动补充重新选择。</p> : null}<p>版本 {selectedApp.app.version || '未知'} · {selectedApp.app.bundleID || 'Bundle ID 未提供'}</p><p className="copy-path">{selectedApp.app.displayPath || selectedApp.app.path}</p>{selectedApp.app.displayPath!==selectedApp.app.path ? <p className="copy-path">实际位置：{selectedApp.app.path}</p> : null}</header>
    <div className="declaration-heading"><h2>声明支持</h2><span>{visibleEntries.length} 个关联 · 默认应用由系统独立查询</span></div>
    <div className="declaration-list" role="region" aria-label="声明关联列表" tabIndex={0}>{visibleEntries.map(entry=><button className="declaration-row" key={entry.id} data-association-id={entry.id} aria-pressed={selected?.id===entry.id} onClick={()=>setSelectedID(entry.id)}><span><strong>{entry.name || entry.sources?.[0]?.rawInput}</strong><span>{entry.association.key || entry.sources?.[0]?.rawInput} {entry.extensions?.map(value=>`.${value}`).join(' · ')}</span></span><span className="declared-default">{!entry.resolved ? '未解析' : rowErrors[entry.id] ? '查询连接失败' : observations[entry.id]?.default.error ? '默认查询失败' : observations[entry.id]?.default.known ? observations[entry.id].default.app?.name || '无默认应用' : '尚未查询'}</span></button>)}</div>
   </> : null}
   {inspectedCopy ? <section className="inspected-copy" aria-labelledby="inspected-heading"><div className="section-heading"><h2 id="inspected-heading">所选应用副本</h2><button onClick={()=>setInspectedCopy(null)}>关闭副本详情</button></div><ApplicationCopy app={inspectedCopy}/></section> : null}
   {selected ? <>
    <header className="page-heading"><div>{kind==='app' ? <h2>{selected.name || selected.sources?.[0]?.rawInput}</h2> : <h1>{selected.name || selected.sources?.[0]?.rawInput}</h1>}<p>{selected.extensions?.map(value => `.${value}`).join(' · ')}{selected.extensions?.length ? ' · ' : ''}{selected.association.key || '尚未解析'}</p></div><button onClick={() => void (selected.resolved ? refresh() : refreshCatalog())} disabled={loading || catalogLoading}>{loading ? '正在查询…' : selected.resolved ? '重新查询' : '重新解析'}</button></header>
    <div className="query-content" role="region" aria-label={`${selected.name || '关联'} 查询结果`} tabIndex={0} aria-busy={loading}>
     {!selected.resolved ? <div className="query-error" role="status"><p>关联尚未解析，不能查询或修改默认应用。</p><p>{selected.unresolvedReason}</p>{selected.diagnosticIdentifiers?.length ? <p>系统诊断：{selected.diagnosticIdentifiers.join('、')}</p> : null}<ManualActions label="选择文件识别类型…" showStorageWarning={false}/></div> : <>
      {transportError ? <p role="alert" className="query-error">查询连接失败{visibleResult ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
      <section aria-labelledby="current-heading"><h2 id="current-heading">当前默认应用</h2>
       {visibleResult?.default.error ? <div className="query-error" role="status"><p>{visibleResult.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{visibleResult.default.error.message}</p></div> : null}
       {visibleResult?.default.app ? <ApplicationCopy app={visibleResult.default.app} onSelect={setInspectedCopy} /> : <p>{visibleResult?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
       {visibleResult?.default.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.default.observedAt).toLocaleString()}</p> : null}
      </section>
      <section aria-labelledby="candidates-heading"><div className="section-heading"><h2 id="candidates-heading">系统候选应用</h2>{visibleResult?.candidates.known ? <span>{visibleResult.candidates.apps?.length ?? 0} 个应用副本</span> : null}</div>
       {visibleResult?.candidates.error ? <div className="query-error" role="status"><p>{visibleResult.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{visibleResult.candidates.error.message}</p></div> : null}
       {!visibleResult?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
       {visibleResult?.candidates.known && !visibleResult.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
       {visibleResult?.candidates.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.candidates.observedAt).toLocaleString()}</p> : null}
       <ul className="candidate-list">{visibleResult?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} onSelect={setInspectedCopy} /></li>)}</ul>
       <ManualApplicationAction association={selected.association}/>
      </section>
     </>}
     <Sources entry={selected} />
    </div>
   </> : <div className="empty-workspace"><h1>{kind==='app' ? selectedApp ? '此应用未声明可处理的文件类型或 URL 协议' : snapshot?.scanning ? '正在发现应用' : '未发现应用' : catalogLoading ? '正在加载关联目录' : catalogError ? '关联目录暂时不可用' : '此入口暂无关联'}</h1><p>{kind==='app' ? '可切换到文件类型或 URL 协议，继续查看这台 Mac 的默认应用。' : catalogLoading ? '正在通过系统解析常用文件类型与协议。' : catalogError ? '请从左侧重试加载目录。' : '选择其他入口浏览已有的关联。'}</p></div>}
  </main>
 </div>
}
