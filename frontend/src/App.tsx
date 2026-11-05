import { useCallback, useEffect, useRef, useState } from 'react'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/association/service'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'

function ApplicationCopy({ app }: { app: AppCopy }) {
 return <div className="application-copy">
  <div className="copy-heading"><strong>{app.name || app.path.split('/').pop()}</strong><span>版本 {app.version || '未知'}</span></div>
  <p className="copy-path">{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
 </div>
}

function Sources({ entry }: { entry: Entry }) {
 const names: Record<string, string> = {common:'常用项', declaration:'应用声明', manual:'手动添加'}
 return <section aria-labelledby="source-heading" className="sources"><h2 id="source-heading">关联来源</h2>
  <ul>{entry.sources?.map((source, index) => <li key={index}>{names[source.kind] ?? source.kind} · {source.label} · {source.rawInput}</li>)}</ul>
  {entry.mimeTypes?.length ? <p>MIME 标签：{entry.mimeTypes.join('、')}</p> : null}
 </section>
}

export default function App() {
 const [entries, setEntries] = useState<Entry[]>([])
 const [kind, setKind] = useState('file')
 const [selectedID, setSelectedID] = useState<string | null>(null)
 const [catalogLoading, setCatalogLoading] = useState(true)
 const [catalogError, setCatalogError] = useState<string | null>(null)
 const [observations, setObservations] = useState<Record<string, QueryResult>>({})
 const [loading, setLoading] = useState(false)
 const [transportError, setTransportError] = useState<string | null>(null)
 const requestVersion = useRef(0)
 const catalogVersion = useRef(0)
 const visibleEntries = entries.filter(entry => entry.association.kind === kind)
 const selected = visibleEntries.find(entry => entry.id === selectedID) ?? visibleEntries[0]
 const visibleResult = selected ? observations[selected.id] : undefined

 const refreshCatalog = useCallback(async () => {
  const version = ++catalogVersion.current
  setCatalogLoading(true); setCatalogError(null)
  try {
   const values = await List()
   if (version === catalogVersion.current) setEntries(values ?? [])
  } catch (error) {
   if (version === catalogVersion.current) setCatalogError(error instanceof Error ? error.message : String(error))
  } finally {
   if (version === catalogVersion.current) setCatalogLoading(false)
  }
 }, [])
 const refresh = useCallback(async () => {
  const version = ++requestVersion.current
  setTransportError(null)
  if (!selected?.resolved) { setLoading(false); return }
  setLoading(true)
  try {
   const value = await Query(selected.association)
   if (version === requestVersion.current) setObservations(previous => ({...previous, [selected.id]:value}))
  } catch (error) {
   if (version === requestVersion.current) setTransportError(error instanceof Error ? error.message : String(error))
  } finally {
   if (version === requestVersion.current) setLoading(false)
  }
 }, [selected])
 useEffect(() => { void refreshCatalog(); return () => { ++catalogVersion.current } }, [refreshCatalog])
 useEffect(() => { void refresh(); return () => { ++requestVersion.current } }, [refresh])

 return <div className="app-shell">
  <aside className="sidebar">
   <div className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3" /></svg><span>Default Apps</span></div>
   <nav className="view-navigation" aria-label="浏览入口"><button aria-pressed={kind === 'file'} onClick={() => setKind('file')}>文件类型</button><button aria-pressed={kind === 'scheme'} onClick={() => setKind('scheme')}>URL 协议</button></nav>
   <div className="catalog-heading"><h2>常用{kind === 'file' ? '文件类型' : '协议'}</h2><span>{visibleEntries.length}</span></div>
   {catalogLoading ? <p role="status">正在解析常用关联…</p> : null}
   {catalogError ? <div className="query-error" role="alert"><p>目录加载失败{entries.length ? '，保留已解析目录。' : '。'}{catalogError}</p><button onClick={() => void refreshCatalog()}>重试加载目录</button></div> : null}
   <div className="association-list" role="region" aria-label="常用关联列表" tabIndex={0}>
    {visibleEntries.map(entry => <button key={entry.id} data-association-id={entry.id} className="association-row" aria-pressed={entry.id === selected?.id} aria-label={`${entry.name || entry.sources?.[0]?.rawInput} ${entry.association.key || '未解析'}`} onClick={() => setSelectedID(entry.id)}>
     <strong>{entry.name || entry.sources?.[0]?.rawInput}</strong>
     <span className="association-identity">{entry.resolved ? entry.association.key : '未解析'}</span>
     {entry.extensions?.length ? <span>{entry.extensions.map(value => `.${value}`).join(' · ')}</span> : null}
    </button>)}
   </div>
   <p className="sidebar-note">这台 Mac 的实际默认与系统候选</p>
  </aside>
  <main className="workspace">
   {selected ? <>
    <header className="page-heading"><div><h1>{selected.name || selected.sources?.[0]?.rawInput}</h1><p>{selected.extensions?.map(value => `.${value}`).join(' · ')}{selected.extensions?.length ? ' · ' : ''}{selected.association.key || '尚未解析'}</p></div><button onClick={() => void (selected.resolved ? refresh() : refreshCatalog())} disabled={loading || catalogLoading}>{loading ? '正在查询…' : selected.resolved ? '重新查询' : '重新解析'}</button></header>
    <div className="query-content" role="region" aria-label={`${selected.name || '关联'} 查询结果`} tabIndex={0} aria-busy={loading}>
     {!selected.resolved ? <div className="query-error" role="status"><p>关联尚未解析，不能查询或修改默认应用。</p><p>{selected.unresolvedReason}</p>{selected.diagnosticIdentifiers?.length ? <p>系统诊断：{selected.diagnosticIdentifiers.join('、')}</p> : null}<p>后续可从「选择文件识别类型…」入口选择真实文件；当前版本尚未接入此选择器。</p></div> : <>
      {transportError ? <p role="alert" className="query-error">查询连接失败{visibleResult ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
      <section aria-labelledby="current-heading"><h2 id="current-heading">当前默认应用</h2>
       {visibleResult?.default.error ? <div className="query-error" role="status"><p>{visibleResult.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{visibleResult.default.error.message}</p></div> : null}
       {visibleResult?.default.app ? <ApplicationCopy app={visibleResult.default.app} /> : <p>{visibleResult?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
       {visibleResult?.default.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.default.observedAt).toLocaleString()}</p> : null}
      </section>
      <section aria-labelledby="candidates-heading"><div className="section-heading"><h2 id="candidates-heading">系统候选应用</h2>{visibleResult?.candidates.known ? <span>{visibleResult.candidates.apps?.length ?? 0} 个应用副本</span> : null}</div>
       {visibleResult?.candidates.error ? <div className="query-error" role="status"><p>{visibleResult.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{visibleResult.candidates.error.message}</p></div> : null}
       {!visibleResult?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
       {visibleResult?.candidates.known && !visibleResult.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
       {visibleResult?.candidates.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.candidates.observedAt).toLocaleString()}</p> : null}
       <ul className="candidate-list">{visibleResult?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} /></li>)}</ul>
      </section>
     </>}
     <Sources entry={selected} />
    </div>
   </> : <div className="empty-workspace"><h1>{catalogLoading ? '正在加载关联目录' : catalogError ? '关联目录暂时不可用' : '此入口暂无关联'}</h1><p>{catalogLoading ? '正在通过系统解析常用文件类型与协议。' : catalogError ? '请从左侧重试加载目录。' : '选择其他入口浏览已有的关联。'}</p></div>}
  </main>
 </div>
}
