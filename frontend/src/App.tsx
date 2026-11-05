import { useCallback, useEffect, useRef, useState } from 'react'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/association/service'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'

const pdf = { kind: 'file', key: 'com.adobe.pdf' }

function ApplicationCopy({ app }: { app: AppCopy }) {
 return <div className="application-copy">
  <div className="copy-heading"><strong>{app.name || app.path.split('/').pop()}</strong><span>版本 {app.version || '未知'}</span></div>
  <p className="copy-path">{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
 </div>
}

export default function App() {
 const [result, setResult] = useState<QueryResult | null>(null)
 const [loading, setLoading] = useState(true)
 const [transportError, setTransportError] = useState<string | null>(null)
 const requestVersion = useRef(0)
 const refresh = useCallback(async () => {
  const version = ++requestVersion.current
  setLoading(true)
  setTransportError(null)
  try {
   const value = await Query(pdf)
   if (version === requestVersion.current) setResult(value)
  } catch (error) {
   if (version === requestVersion.current) setTransportError(error instanceof Error ? error.message : String(error))
  } finally {
   if (version === requestVersion.current) setLoading(false)
  }
 }, [])
 useEffect(() => {
  void refresh()
  return () => { ++requestVersion.current }
 }, [refresh])
 return <div className="app-shell">
  <aside className="sidebar">
   <div className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3" /></svg><span>Default Apps</span></div>
   <p className="nav-label">文件类型</p>
   <div className="selected-association"><strong>PDF 文稿</strong><span>.pdf</span></div>
   <p className="sidebar-note">查看这台 Mac 的默认应用与系统候选。</p>
  </aside>
  <main className="workspace">
   <header className="page-heading"><div><h1>PDF 文稿</h1><p>.pdf <span aria-hidden="true">·</span> com.adobe.pdf</p></div><button onClick={() => void refresh()} disabled={loading}>{loading ? '正在查询…' : '重新查询'}</button></header>
   <div className="query-content" role="region" aria-label="PDF 查询结果" tabIndex={0} aria-busy={loading}>
    {transportError ? <p role="alert" className="query-error">查询连接失败{result ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
    <section aria-labelledby="current-heading"><h2 id="current-heading">当前默认应用</h2>
     {result?.default.error ? <div className="query-error" role="status"><p>{result.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{result.default.error.message}</p></div> : null}
     {result?.default.app ? <ApplicationCopy app={result.default.app} /> : <p>{result?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
     {result?.default.known ? <p className="freshness">最后有效查询：{new Date(result.default.observedAt).toLocaleString()}</p> : null}
    </section>
    <section aria-labelledby="candidates-heading"><div className="section-heading"><h2 id="candidates-heading">系统候选应用</h2>{result?.candidates.known ? <span>{result.candidates.apps?.length ?? 0} 个应用副本</span> : null}</div>
     {result?.candidates.error ? <div className="query-error" role="status"><p>{result.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{result.candidates.error.message}</p></div> : null}
     {!result?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
     {result?.candidates.known && !result.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
     {result?.candidates.known ? <p className="freshness">最后有效查询：{new Date(result.candidates.observedAt).toLocaleString()}</p> : null}
     <ul className="candidate-list">{result?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} /></li>)}</ul>
    </section>
   </div>
  </main>
 </div>
}
