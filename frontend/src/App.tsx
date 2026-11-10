import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { LifecycleStatus, useRecoveryAction } from './Lifecycle'
import { ChangeStatus, useChanges, requestLabel } from './Changes'
import { ManualActions, ManualApplicationAction } from './ManualActions'
import { NotificationHost } from './Notifications'
import { applicationDeclarationSources, associationSourceOptions, type AssociationSourceFilter } from './associationSources'
import { useAssociationQueries, isTrustworthy } from './useAssociationQueries'
import { useAssociationBrowser, type BrowserView as View, type ApplicationFilter } from './useAssociationBrowser'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry, Source } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'

function ApplicationIcon({ app, className='' }: { app: AppCopy; className?: string }) {
 const [failedData,setFailedData] = useState<string>()
 const fallback = (app.name || app.path.split('/').pop() || '?').trim().slice(0, 1).toLocaleUpperCase()
 const source = app.iconData && app.iconData!==failedData ? app.iconData : undefined
 return <span className={`application-icon ${className}`} data-fallback={!source} aria-hidden="true">
  {source ? <img src={`data:image/png;base64,${source}`} alt="" onError={()=>setFailedData(source)}/> : <span>{fallback}</span>}
 </span>
}

function SystemAppBadge({ app }: { app: AppCopy }) {
 return app.system ? <span className="system-app-badge" aria-label="系统应用" title="受 macOS 系统保护的应用">系统</span> : null
}

function ApplicationCopy({ app, missing=false, onSubmit, disabled=false }: { app: AppCopy; missing?:boolean; onSubmit?:(app:AppCopy)=>void; disabled?:boolean }) {
 return <div className="application-copy">
  <div className="copy-heading"><div className="copy-identity"><ApplicationIcon app={app} className="application-icon--copy"/><strong>{app.name || app.path.split('/').pop()}</strong><SystemAppBadge app={app}/></div><span className="version-tag">版本 {app.version || '未知'}</span></div>
  <p className="copy-path"><Icon name="folder"/>{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
  {missing ? <p className="query-error">目录中已找不到此副本；以上仍是系统实际查询结果。</p> : null}
  {app.metadataError ? <p className="query-error">应用信息暂不可用：{app.metadataError}</p> : null}
  {onSubmit ? <button className="btn btn--primary change-copy-action" aria-label={`设为默认应用 ${app.path}`} disabled={disabled} onClick={()=>onSubmit(app)}>设为默认应用</button> : null}
 </div>
}

function sourceKind(source:Source, resolved:boolean) {
 const declared=source.kind==='declaration'
 const names:Record<string,string> = {identifier:declared?'直接声明类型':'类型标识',scheme:declared?'直接声明协议':'协议名称',extension:resolved?'由扩展名解析':'扩展名声明',mime:resolved?'由 MIME 解析':'MIME 声明',ostype:'旧式类型声明'}
 return names[source.inputKind] || '原始声明'
}

function DeclarationOrigin({ entry, appPath, isDefault=false }: { entry:Entry; appPath:string; isDefault?:boolean }) {
 const sources=applicationDeclarationSources(entry,appPath)
 if(!sources.length&&isDefault)return <span>当前默认关联</span>
 const direct=sources.find(source=>source.inputKind==='identifier'||source.inputKind==='scheme')
 if(direct)return <span>{sourceKind(direct,entry.resolved)}</span>
 const labels=[...new Set(sources.map(source=>`${sourceKind(source,entry.resolved)} · ${source.inputKind==='extension'?'.':''}${source.normalizedInput}`))]
 return labels.length ? <span>{labels.join('；')}</span> : null
}

function Sources({ entry }: { entry: Entry }) {
 const names: Record<string, string> = {common:'常用项', declaration:'应用声明', manual:'手动添加'}
 return <section aria-labelledby="source-heading" className="sources"><h2 id="source-heading">关联来源</h2>
  <ul>{entry.sources?.map((source, index) => <li key={index}>{names[source.kind] ?? source.kind} · {sourceKind(source,entry.resolved)} · {source.rawInput} · {source.label}{source.appPath ? ` · ${source.appPath}` : ''}{source.role ? ` · ${source.role}` : ''}{source.rank ? ` / ${source.rank}` : ''}</li>)}</ul>
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
 return <span className="declared-app"><ApplicationIcon app={app} className="application-icon--compact"/><strong title={app.name}>{app.name}</strong></span>
}

const viewNames:Record<View,string> = {app:'应用',file:'文件类型',scheme:'URL 协议'}
const appFilterNames:Record<ApplicationFilter,string> = {user:'非系统',system:'系统',all:'全部'}
const entryName = (entry:Entry) => entry.name || entry.sources?.[0]?.rawInput || '关联'
export default function App() {
 const changes=useChanges()
 const recovery=useRecoveryAction(changes)
 const {view,actions,refs,queryInputs}=useAssociationBrowser()
 const {kind,appFilter,appQuery,filter,manualOnly,sourceFilter,applicationMatches,selectedMatch,selectedApp,visibleEntries,browsedSelected,selected,
  snapshot,entries,catalogLoading,catalogError,missingAppPath,detailOpen,inspectedCopy,requestEntryMissing,missingCopyPaths,emptyHeadline:browserEmptyHeadline}=view
 const {scan,retryCatalog,reparse,selectApp,openEntry,switchView,changeAppFilter,inspectCopy,closeCopy,closeDetails,dismissDetails,clearSearch,searchKey,listKey}=actions
 const {appSearch,associationSearch,appList,associationList,navigation}=refs
 const [issuesOpen,setIssuesOpen]=useState(false)
 const {observations,rowErrors,loading,prefetching,refresh}=useAssociationQueries({...queryInputs,snapshotObservations:changes.state?.observations})
 const emptyHeadline=kind==='app'&&selectedApp&&!selectedMatch?.associationCount&&(prefetching||loading)?'正在查询应用关联…':browserEmptyHeadline
 useEffect(()=>{
  actions.setDefaultPaths(Object.fromEntries(Object.entries(observations).flatMap(([id,result])=>
   isTrustworthy(result.default)&&!rowErrors[id]&&result.default.app ? [[id,result.default.app.path]] : [])))
 },[observations,rowErrors,actions.setDefaultPaths])
 const visibleResult=selected ? observations[selected.id] : undefined
 const transportError=selected ? rowErrors[selected.id] : undefined
 const canChange=(entry:Entry|undefined,app:AppCopy|undefined)=>!!entry?.resolved&&!!app&&!app.metadataError&&!changes.blocked&&!!changes.state?.writableKinds?.includes(entry.association.kind)&&isTrustworthy(observations[entry.id]?.default)
 const submitCopy=(entry:Entry,app:AppCopy)=>{const observed=observations[entry.id]?.default;if(!observed||!canChange(entry,app))return;recovery.submit(entry.association,app,observed);dismissDetails()}
 return <><NotificationHost/><div className="app-shell">
  <header className="global-header">
   <div className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3"/></svg><span>Default Apps<small>默认应用管理</small></span></div>
   <nav ref={navigation} className="view-navigation" aria-label="浏览入口">{(['app','file','scheme'] as View[]).map(view=><button className="btn" key={view} data-view={view} aria-pressed={kind===view} onClick={()=>switchView(view)}><Icon name={view}/>{viewNames[view]}</button>)}</nav>
   <div className="header-actions"><ManualActions/><ManualActions kind="application" showStorageWarning={false}/><button className="btn" disabled={snapshot?.scanning} onClick={()=>void scan(()=>setIssuesOpen(true))}><Icon name="refresh"/>{snapshot?.scanning ? '正在扫描…' : '重新扫描应用'}</button></div>
  </header>
  <LifecycleStatus changes={changes}/>{recovery.dialog}
  <ChangeStatus changes={changes} onReturn={actions.returnToRequest}/>

  <div className={`browser-workspace ${kind==='app' ? '' : 'catalog-view'}`}>
   {kind==='app' ? <aside className="sidebar">
    <div className="catalog-heading"><h2>已安装应用</h2><span>{applicationMatches.length} / {snapshot?.apps?.length ?? 0}</span></div>
    <div className="application-filter" role="group" aria-label="应用类型筛选">{(['user','system','all'] as ApplicationFilter[]).map(value=><button key={value} aria-label={`${appFilterNames[value]}应用`} aria-pressed={appFilter===value} onClick={()=>changeAppFilter(value)}>{appFilterNames[value]}</button>)}</div>
    <label className="search-field">搜索应用<span className="search-input"><Icon name="search"/><input ref={appSearch} type="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label="搜索应用名称、版本、路径或声明" placeholder="名称、版本、路径或声明" value={appQuery} onChange={event=>actions.setAppQuery(event.target.value)} onKeyDown={event=>searchKey(event,true)}/><kbd aria-hidden="true">⌘ F</kbd></span></label>
    <p className="search-hint">匹配应用信息时显示全部关联；仅关联命中时显示匹配项。</p>
    <div ref={appList} className="application-list" role="region" aria-label="已安装应用列表" onKeyDown={event=>listKey(event,true)}>{applicationMatches.map(({item,associationCount})=><button key={item.app.path} data-app-path={item.app.path} className="application-row" tabIndex={item.app.path===selectedApp?.app.path || (!selectedApp && item===applicationMatches[0]?.item) ? 0 : -1} aria-pressed={item.app.path===selectedApp?.app.path} aria-label={`${item.app.name} ${item.app.version} ${item.app.path}${item.app.system ? ' 系统应用' : ''}`} onClick={()=>selectApp(item.app.path)}><ApplicationIcon app={item.app} className="application-icon--row"/><span className="application-row-content"><span className="application-row-heading"><strong>{item.app.name}</strong><SystemAppBadge app={item.app}/></span><span>版本 {item.app.version || '未知'} · {associationCount} 个关联</span></span><Icon name="chevron"/></button>)}</div>
    <p className="sidebar-note">⌘F 搜索 · ↑ ↓ 选中 · Enter 进入关联</p>
   </aside> : null}
   <main className={`workspace${kind!=='scheme' ? ' file-columns' : ''}`}>
    {kind!=='file' ? <header className="app-heading">
     <div className="page-identity"><span className="page-icon" data-application={kind==='app' && !!selectedApp}>{kind==='app' && selectedApp ? <ApplicationIcon app={selectedApp.app} className="application-icon--page"/> : <Icon name={kind}/>}</span><div><h1>{kind==='app' ? selectedApp?.app.name || '已安装应用' : viewNames[kind]}</h1>
      {kind==='app' && selectedApp ? <><p>版本 {selectedApp.app.version || '未知'} · {selectedApp.app.bundleID || 'Bundle ID 未提供'}</p><p className="heading-path" title={selectedApp.app.path}>{selectedApp.app.displayPath || selectedApp.app.path}</p>{selectedApp.unavailable ? <p className="query-error" role="status">手动应用位置暂不可用 · {selectedApp.app.metadataError || '原副本未找到'}<br/>{selectedApp.app.path}</p> : selectedApp.app.metadataError ? <p className="query-error">应用信息暂不可用：{selectedApp.app.metadataError}</p> : null}</> : <p>{kind==='scheme' ? '查看 URL 协议，选择接收链接的默认应用。' : '这台 Mac 的实际默认与系统候选'}</p>}
     </div></div>
    </header> : null}
    {catalogLoading || snapshot?.scanning ? <p className="scan-status" role="status">{snapshot?.scanning ? `正在扫描应用…已发现 ${snapshot.apps?.length ?? 0} 份` : '正在解析常用关联…'}</p> : null}
    {catalogError ? <div className="query-error" role="alert"><p>目录加载失败{entries.length ? '，保留已解析目录。' : '。'}{catalogError}</p><button className="btn" onClick={()=>void retryCatalog()}>重试加载目录</button></div> : null}
    {kind==='app' && missingAppPath ? <div role="status" className="missing-copy"><strong>原应用副本已不在目录中</strong><p>{missingAppPath}</p><p>可选择其他应用副本继续浏览。</p></div> : null}
    <div className="association-toolbar"><div><h2>{kind==='app' ? '应用关联' : '关联目录'}</h2><p>{visibleEntries.length} 个关联 · {kind==='app' && selectedMatch && !selectedMatch.metadataMatch ? '仅显示匹配关联 · 已是默认优先' : kind==='app' ? '已是默认优先' : '常用关联优先'}</p>{kind==='app' ? <p>同一扩展名可能对应多个类型；当前默认按具体类型查询。</p> : null}</div><div className="association-filters">{kind==='app' ? <label className="association-source-filter">来源<select aria-label="筛选关联来源" value={sourceFilter} onChange={event=>actions.setSourceFilter(event.target.value as AssociationSourceFilter)}>{associationSourceOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}<label className="manual-only-filter"><input type="checkbox" checked={manualOnly} onChange={event=>actions.setManualOnly(event.target.checked)}/>仅手动添加</label><label className="search-field">{kind==='app' ? '筛选关联' : `搜索${viewNames[kind]}`}<span className="search-input"><Icon name="search"/><input ref={associationSearch} type="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-label={kind==='app' ? '筛选当前关联' : `搜索${viewNames[kind]}`} value={filter} placeholder={kind==='scheme' ? '名称或协议，如 https' : '名称、扩展名或类型身份'} onChange={event=>actions.setFilter(event.target.value)} onKeyDown={event=>searchKey(event)}/></span></label></div></div>
    <div className="column-labels"><span>{kind!=='scheme' ? '名称' : '关联项'}</span>{kind!=='scheme' ? <><span>扩展名</span><span>类型 ID</span></> : null}<span>当前默认应用</span><span>操作</span></div>
    <div ref={associationList} className="association-list" role="region" aria-label={kind==='app' ? '应用关联列表' : '关联列表'} onKeyDown={event=>listKey(event)}>
     {visibleEntries.map(entry=>{
      const isDefault=!!selectedApp&&isTrustworthy(observations[entry.id]?.default)&&!rowErrors[entry.id]&&observations[entry.id]?.default.app?.path===selectedApp.app.path
      const isManual=entry.sources?.some(source=>source.kind==='manual')
      const protocol=entry.association.key || entry.sources?.[0]?.rawInput
      return <div className="association-row" data-selected={browsedSelected?.id===entry.id} key={entry.id}>
      <button className="association-name" data-association-id={entry.id} tabIndex={browsedSelected?.id===entry.id ? 0 : -1} aria-pressed={browsedSelected?.id===entry.id} aria-label={`${entryName(entry)} ${entry.association.key || '未解析'}`} aria-description={isManual ? '手动添加' : undefined} onClick={()=>openEntry(entry.id)}><span className="association-title"><span className="association-icon"><Icon name={entry.association.kind==='scheme'?'scheme':'file'}/></span><span className="association-label"><span className="association-heading"><strong>{entryName(entry)}</strong>{isManual ? <span className="manual-association-badge">手动添加</span> : null}</span>{kind==='scheme' && protocol && protocol!==entryName(entry) ? <span>{protocol}</span> : null}{kind==='app'&&selectedApp ? <DeclarationOrigin entry={entry} appPath={selectedApp.app.path} isDefault={isDefault}/> : null}</span></span>{kind!=='scheme' ? <><span className="association-extensions">{entry.extensions?.map(value=>`.${value}`).join(' · ') || '—'}</span><span className="association-identifier">{entry.association.key || entry.sources?.[0]?.rawInput}</span></> : null}</button>
      <div className="declared-default"><DefaultCell entry={entry} rowError={rowErrors[entry.id]} observation={observations[entry.id]}/></div>
      <div className="row-actions"><button className="btn row-detail" aria-label={`查看 ${entryName(entry)} 详情`} tabIndex={browsedSelected?.id===entry.id ? 0 : -1} onClick={()=>openEntry(entry.id)}>详情…</button>{kind==='app'&&selectedApp?<button className="btn row-submit" data-current={isDefault} aria-label={`将 ${entryName(entry)} 设为 ${selectedApp.app.path}`} title={selectedApp.app.path} tabIndex={browsedSelected?.id===entry.id?0:-1} disabled={!canChange(entry,selectedApp.app)||selectedApp.unavailable||isDefault} onClick={()=>submitCopy(entry,selectedApp.app)}>{isDefault?<Icon name="check"/>:null}{isDefault?'已是默认':'设为默认'}</button>:null}
      {changes.state?.requests?.filter(r=>r.association.kind===entry.association.kind&&r.association.key===entry.association.key).slice(-1).map(r=><span key={r.requestID} className="change-row-state" data-confirmed={r.confirmed}>{requestLabel(r)}</span>)}</div>
     </div>})}
     {!visibleEntries.length ? <div className="empty-workspace"><span className="empty-icon"><Icon name="search"/></span><h2>{emptyHeadline}</h2><p>可清除搜索或筛选{kind==='app' && !selectedApp && appFilter!=='all' ? '、切换应用类型' : ''}，或切换浏览入口继续查看这台 Mac 的默认应用。</p><div className="empty-actions"><button className="btn" onClick={clearSearch}>{manualOnly || (kind==='app' && sourceFilter!=='all') ? '清除搜索和筛选' : '清除搜索'}</button>{kind==='app' && !selectedApp && appFilter!=='all' ? <button className="btn" onClick={()=>changeAppFilter('all')}>显示全部应用</button> : null}{kind!=='file' ? <button className="btn" onClick={()=>switchView('file')}>浏览文件类型</button> : null}{kind!=='scheme' ? <button className="btn" onClick={()=>switchView('scheme')}>浏览 URL 协议</button> : null}</div></div> : null}
    </div>
    <footer className="browser-footer"><span className="footer-source"><span className="status-dot"/>默认应用由系统独立查询</span>{snapshot?.issues?.length ? <button className="btn" onClick={()=>setIssuesOpen(true)}>扫描问题 · {snapshot.issues.length}</button> : null}<span className="keyboard-hint"><kbd>⌘ 1</kbd><kbd>2</kbd><kbd>3</kbd> 切换入口</span></footer>
   </main>
  </div>
  {issuesOpen ? <Dialog title="扫描问题" onClose={()=>setIssuesOpen(false)}><ul className="scan-issues">{snapshot?.issues?.map((issue,index)=><li key={index}><p>{issue.path}</p><p>{issue.origin} · {issue.message}</p></li>)}</ul></Dialog> : null}
  {inspectedCopy ? <Dialog title="所选应用副本" onClose={closeCopy}><section aria-label="所选应用副本"><ApplicationCopy app={inspectedCopy} onSubmit={detailOpen&&selected?app=>submitCopy(selected,app):undefined} disabled={!canChange(selected,inspectedCopy)}/></section></Dialog> : null}
  {selected && detailOpen ? <Dialog title={entryName(selected)} subtitle={selected.association.key || '尚未解析'} onClose={closeDetails}>
    {requestEntryMissing ? <p role="status" className="query-error">此关联已不在当前目录中；仍按原修改请求查询。</p> : null}
    <div className="page-heading"><div><h3>关联查询</h3><p>{selected.extensions?.map(value => `.${value}`).join(' · ')}{selected.extensions?.length ? ' · ' : ''}{selected.association.key || '尚未解析'}</p></div><button className="btn" onClick={() => void (selected.resolved ? refresh(true) : reparse())} disabled={loading || catalogLoading || (!selected.resolved && !!snapshot?.scanning)}><Icon name="refresh"/>{loading ? '正在查询…' : selected.resolved ? '重新查询' : '重新解析'}</button></div>
    <div className="query-content" role="region" aria-label={`${selected.name || '关联'} 查询结果`} tabIndex={0} aria-busy={loading}>
     {!selected.resolved ? <div className="query-error" role="status"><p>关联尚未解析，不能查询或修改默认应用。</p><p>{selected.unresolvedReason}</p>{selected.diagnosticIdentifiers?.length ? <p>系统诊断：{selected.diagnosticIdentifiers.join('、')}</p> : null}<ManualActions label="选择文件识别类型…" showStorageWarning={false}/></div> : <>
      {transportError ? <p role="alert" className="query-error">查询连接失败{visibleResult ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
      <section aria-labelledby="current-heading"><h2 id="current-heading">当前默认应用</h2>
       {visibleResult?.default.error ? <div className="query-error" role="status"><p>{visibleResult.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{visibleResult.default.error.message}</p></div> : null}
       {visibleResult?.default.app ? <ApplicationCopy app={visibleResult.default.app} missing={missingCopyPaths.has(visibleResult.default.app.path)} /> : <p>{visibleResult?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
       {visibleResult?.default.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.default.observedAt).toLocaleString()}</p> : null}
      </section>
      <section aria-labelledby="candidates-heading"><div className="section-heading"><h2 id="candidates-heading">系统候选应用</h2>{visibleResult?.candidates.known ? <span>{visibleResult.candidates.apps?.length ?? 0} 个应用副本</span> : null}</div>
       {visibleResult?.candidates.error ? <div className="query-error" role="status"><p>{visibleResult.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{visibleResult.candidates.error.message}</p></div> : null}
       {!visibleResult?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
       {visibleResult?.candidates.known && !visibleResult.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
       {visibleResult?.candidates.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.candidates.observedAt).toLocaleString()}</p> : null}
       <ManualApplicationAction association={selected.association} onSelected={inspectCopy}/>
       <ul className="candidate-list">{visibleResult?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} onSubmit={app=>submitCopy(selected,app)} disabled={!canChange(selected,app)}/></li>)}</ul>
      </section>
     </>}
     <Sources entry={selected} />
    </div>
  </Dialog> : null}
 </div></>
}
