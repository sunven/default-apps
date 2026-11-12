import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Heading } from '@astryxdesign/core/Heading'
import { Item } from '@astryxdesign/core/Item'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Button } from '@astryxdesign/core/Button'
import { Grid } from '@astryxdesign/core/Grid'
import { Table, pixel, proportional, type TableColumn, type TablePlugin } from '@astryxdesign/core/Table'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApplicationIcon } from './ApplicationIcon'
import { BatchBars, BatchCheckbox, BatchDialogs, useBatchSettings } from './Batch'
import { Dialog } from './Dialog'
import { FileDrop } from './FileDrop'
import { Icon } from './Icon'
import { LifecycleStatus, useRecoveryAction } from './Lifecycle'
import { ChangeStatus, useChanges, requestLabel } from './Changes'
import { ManualActions, ManualApplicationAction } from './ManualActions'
import { NotificationHost } from './Notifications'
import { SoftwareUpdate } from './SoftwareUpdate'
import { applicationDeclarationSources, associationSourceOptions, type AssociationSourceFilter } from './associationSources'
import { useAssociationQueries, isTrustworthy } from './useAssociationQueries'
import { useAssociationBrowser, type BrowserView as View, type ApplicationFilter } from './useAssociationBrowser'
import type { AppCopy, QueryResult } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry, Source } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type { Request } from '../bindings/github.com/sunven/default-apps/internal/change/models'

function SystemAppBadge({ app }: { app: AppCopy }) {
 return app.system ? <Tooltip content="受 macOS 系统保护的应用" hasHoverIndication={false}><Text type="supporting" className="system-app-badge" aria-label="系统应用">系统</Text></Tooltip> : null
}

function ApplicationCopy({ app, missing=false, onSubmit, disabled=false }: { app: AppCopy; missing?:boolean; onSubmit?:(app:AppCopy)=>void; disabled?:boolean }) {
 return <VStack gap={0} className="application-copy">
  <HStack gap={3} align="center" justify="between" className="copy-heading">
   <HStack gap={2} align="center" wrap="wrap" className="copy-identity"><ApplicationIcon app={app} className="application-icon--copy"/><strong>{app.name || app.path.split('/').pop()}</strong><SystemAppBadge app={app}/><Text className="version-tag">版本 {app.version || '未知'}</Text></HStack>
   {onSubmit ? <Button label={`设为默认应用 ${app.path}`} variant="primary" size="sm" className="change-copy-action" isDisabled={disabled} onClick={()=>onSubmit(app)}>设为默认应用</Button> : null}
  </HStack>
  <p className="copy-path"><Icon name="folder"/>{app.displayPath || app.path}</p>
  {app.displayPath && app.displayPath !== app.path ? <p className="copy-path">实际位置：{app.path}</p> : null}
  <p className="copy-bundle">{app.bundleID || 'Bundle ID 未提供'}</p>
  {missing ? <p className="query-error">目录中已找不到此副本；以上仍是系统实际查询结果。</p> : null}
  {app.metadataError ? <p className="query-error">应用信息暂不可用：{app.metadataError}</p> : null}
 </VStack>
}

function sourceKind(source:Source, resolved:boolean) {
 const declared=source.kind==='declaration'
 const names:Record<string,string> = {identifier:declared?'直接声明类型':'类型标识',scheme:declared?'直接声明协议':'协议名称',extension:resolved?'由扩展名解析':'扩展名声明',mime:resolved?'由 MIME 解析':'MIME 声明',ostype:'旧式类型声明'}
 return names[source.inputKind] || '原始声明'
}

function DeclarationOrigin({ entry, appPath, isDefault=false }: { entry:Entry; appPath:string; isDefault?:boolean }) {
 const sources=applicationDeclarationSources(entry,appPath)
 if(!sources.length&&isDefault)return <Text>当前默认关联</Text>
 const direct=sources.find(source=>source.inputKind==='identifier'||source.inputKind==='scheme')
 if(direct)return <Text>{sourceKind(direct,entry.resolved)}</Text>
 const labels=[...new Set(sources.map(source=>`${sourceKind(source,entry.resolved)} · ${source.inputKind==='extension'?'.':''}${source.normalizedInput}`))]
 return labels.length ? <Text>{labels.join('；')}</Text> : null
}

function Sources({ entry }: { entry: Entry }) {
 const names: Record<string, string> = {common:'常用项', declaration:'应用声明', manual:'手动添加'}
 return <section aria-labelledby="source-heading" className="sources"><Heading level={2} id="source-heading">关联来源</Heading>
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
 return <HStack as="span" gap={2} align="center" className="declared-app"><ApplicationIcon app={app} className="application-icon--compact"/><strong title={app.name}>{app.name}</strong></HStack>
}

const viewNames:Record<View,string> = {app:'应用',file:'文件类型',scheme:'URL 协议'}
const appFilterNames:Record<ApplicationFilter,string> = {user:'非系统',system:'系统',all:'全部'}
const entryName = (entry:Entry) => entry.name || entry.sources?.[0]?.rawInput || '关联'
export default function App() {
 const changes=useChanges()
 const batch=useBatchSettings(changes)
 const recovery=useRecoveryAction(changes)
 const {view,actions,refs,queryInputs}=useAssociationBrowser()
 const {kind,appFilter,appQuery,filter,manualOnly,sourceFilter,applicationMatches,selectedMatch,selectedApp,visibleEntries,browsedSelected,selected,
  snapshot,entries,catalogLoading,catalogError,missingAppPath,detailOpen,inspectedCopy,requestEntryMissing,missingCopyPaths,emptyHeadline:browserEmptyHeadline}=view
 const {scan,retryCatalog,reparse,selectApp,openEntry,switchView,changeAppFilter,inspectCopy,closeCopy,closeDetails,dismissDetails,clearSearch,searchKey,listKey}=actions
 const {appSearch,associationSearch,appList,associationList}=refs
 const batchApps=useMemo(()=>(snapshot?.apps??[]).filter(item=>!item.unavailable).map(item=>item.app),[snapshot?.apps])
 const selectableEntries=kind==='file'?visibleEntries.filter(entry=>entry.resolved):[]
 const selectedVisible=selectableEntries.filter(entry=>batch.selected.has(entry.id)).length
 const [issuesOpen,setIssuesOpen]=useState(false)
 const {observations,rowErrors,loading,prefetching,refresh}=useAssociationQueries({...queryInputs,snapshotObservations:changes.state?.observations})
 const emptyHeadline=kind==='app'&&selectedApp&&!selectedMatch?.associationCount&&(prefetching||loading)?'正在查询应用关联…':browserEmptyHeadline
 useEffect(()=>{
  actions.setDefaultPaths(Object.fromEntries(Object.entries(observations).flatMap(([id,result])=>
   isTrustworthy(result.default)&&!rowErrors[id]&&result.default.app ? [[id,result.default.app.path]] : [])))
 },[observations,rowErrors,actions.setDefaultPaths])
 const visibleResult=selected ? observations[selected.id] : undefined
 const transportError=selected ? rowErrors[selected.id] : undefined
 const canChange=(entry:Entry|undefined,app:AppCopy|undefined)=>!!entry?.resolved&&!!app&&!app.metadataError&&!changes.blocked&&!batch.pending&&!batch.working&&!!changes.state?.writableKinds?.includes(entry.association.kind)&&isTrustworthy(observations[entry.id]?.default)
 const submitCopy=(entry:Entry,app:AppCopy)=>{const observed=observations[entry.id]?.default;if(!observed||!canChange(entry,app))return;recovery.submit(entry.association,app,observed);dismissDetails()}
 // Stable table callbacks read the actions from the latest committed render.
 const tableActions=useRef({submitCopy,toggle:batch.toggle,toggleVisible:()=>batch.toggleVisible(visibleEntries)})
 useLayoutEffect(()=>{tableActions.current={submitCopy,toggle:batch.toggle,toggleVisible:()=>batch.toggleVisible(visibleEntries)}})
 const submitRow=useCallback((entry:Entry,app:AppCopy)=>tableActions.current.submitCopy(entry,app),[])
 const toggleRow=useCallback((entry:Entry)=>tableActions.current.toggle(entry),[])
 const toggleVisible=useCallback(()=>tableActions.current.toggleVisible(),[])
 const latestRequests=useMemo(()=>{
  const requests=new Map<string,Request>()
  for(const request of changes.state?.requests??[])requests.set(`${request.association.kind}:${request.association.key}`,request)
  return requests
 },[changes.state?.requests])
 const submitBlocked=changes.blocked||!!batch.pending||batch.working
 const tableRows=useMemo(()=>visibleEntries.map(entry=>({
  id:entry.id,entry,
  isSelected:browsedSelected?.id===entry.id,
  isDefault:!!selectedApp&&isTrustworthy(observations[entry.id]?.default)&&!rowErrors[entry.id]&&observations[entry.id]?.default.app?.path===selectedApp.app.path,
  isManual:entry.sources?.some(source=>source.kind==='manual'),
  protocol:entry.association.key || entry.sources?.[0]?.rawInput,
  observation:observations[entry.id],rowError:rowErrors[entry.id],
  checked:batch.selected.has(entry.id),selectionDisabled:batch.selectionBlocked||!entry.resolved,
  targetApp:selectedApp?.app,
  canSubmit:!!entry.resolved&&!!selectedApp&&!selectedApp.app.metadataError&&!selectedApp.unavailable&&!submitBlocked&&!!changes.state?.writableKinds?.includes(entry.association.kind)&&isTrustworthy(observations[entry.id]?.default),
  request:latestRequests.get(`${entry.association.kind}:${entry.association.key}`),
 })),[visibleEntries,selectedApp,browsedSelected?.id,observations,rowErrors,batch.selected,batch.selectionBlocked,submitBlocked,changes.state?.writableKinds,latestRequests])
 type AssociationRow=(typeof tableRows)[number]
 const tableColumns=useMemo<TableColumn<AssociationRow>[]>(()=>[
  ...(kind==='file' ? [{
   key:'selection',width:pixel(48),
   header:<BatchCheckbox checked={!!selectableEntries.length&&selectedVisible===selectableEntries.length} partial={selectedVisible>0&&selectedVisible<selectableEntries.length} disabled={batch.selectionBlocked||!selectableEntries.length} label="全选当前筛选结果" onChange={toggleVisible}/>,
   renderCell:({entry,checked,selectionDisabled}:AssociationRow)=><BatchCheckbox checked={checked} disabled={selectionDisabled} label={`勾选 ${entryName(entry)} ${entry.association.key}`} onChange={()=>toggleRow(entry)}/>,
  }] : []),
  {key:'name',header:kind==='scheme'?'关联项':'名称',width:proportional(1.2,{minWidth:144}),renderCell:({entry,isSelected,isDefault,isManual,protocol,targetApp})=><Button label={`${entryName(entry)} ${entry.association.key || '未解析'}`} variant="ghost" className="association-name" data-association-id={String(entry.id)} tabIndex={isSelected ? 0 : -1} aria-pressed={isSelected} aria-description={isManual ? '手动添加' : undefined} onClick={()=>openEntry(entry.id)}><HStack as="span" gap={2} align="center" className="association-title"><VStack as="span" gap={0} className="association-icon"><Icon name={entry.association.kind==='scheme'?'scheme':'file'}/></VStack><VStack as="span" gap={0} className="association-label"><HStack as="span" gap={2} align="center" className="association-heading"><strong>{entryName(entry)}</strong>{isManual ? <Text className="manual-association-badge">手动添加</Text> : null}</HStack>{kind==='scheme' && protocol && protocol!==entryName(entry) ? <Text>{protocol}</Text> : null}{kind==='app'&&targetApp ? <DeclarationOrigin entry={entry} appPath={targetApp.path} isDefault={isDefault}/> : null}</VStack></HStack></Button>},
  ...(kind!=='scheme' ? [
   {key:'extensions',header:'扩展名',width:proportional(.75,{minWidth:80}),renderCell:({entry}:AssociationRow)=><Text type="supporting" className="association-extensions">{entry.extensions?.map(value=>`.${value}`).join(' · ') || '—'}</Text>},
   {key:'identifier',header:'类型 ID',width:proportional(1.35,{minWidth:160}),renderCell:({entry}:AssociationRow)=><Text type="supporting" className="association-identifier">{entry.association.key || entry.sources?.[0]?.rawInput}</Text>},
  ] : []),
  {key:'default',header:'当前默认应用',width:proportional(1,{minWidth:120}),renderCell:({entry,rowError,observation})=><VStack gap={0} className="declared-default"><DefaultCell entry={entry} rowError={rowError} observation={observation}/></VStack>},
  {key:'actions',header:'操作',align:'end',width:pixel(kind==='app'?184:88),renderCell:({entry,isSelected,isDefault,targetApp,canSubmit,request})=><HStack gap={2} align="center" className="row-actions"><Button label={`查看 ${entryName(entry)} 详情`} variant="ghost" size="sm" className="row-detail" tabIndex={isSelected ? 0 : -1} onClick={()=>openEntry(entry.id)}><Text type="supporting" color="primary">详情…</Text></Button>{kind==='app'&&targetApp?<Button label={`将 ${entryName(entry)} 设为 ${targetApp.path}`} variant="secondary" size="sm" icon={isDefault?<Icon name="check"/>:undefined} className="row-submit" data-current={String(isDefault)} tooltip={targetApp.path} tabIndex={isSelected?0:-1} isDisabled={!canSubmit||isDefault} onClick={()=>submitRow(entry,targetApp)}>{isDefault?'已是默认':'设为默认'}</Button>:null}
      {request?<Text key={request.requestID} className="change-row-state" data-confirmed={String(request.confirmed)}>{requestLabel(request)}</Text>:null}</HStack>},
 ],[kind,selectableEntries.length,selectedVisible,batch.selectionBlocked,openEntry,submitRow,toggleRow,toggleVisible])
 // Keep browser navigation and batch selection independent. The name button owns
 // keyboard focus; clicks on non-interactive cells open the same details.
 const tablePlugin=useMemo<TablePlugin<AssociationRow>>(()=>({
  transformScrollWrapper:props=>({...props,htmlProps:{...props.htmlProps,
   ref:associationList,className:[props.htmlProps.className,'association-list'].filter(Boolean).join(' '),
   role:'region','aria-label':kind==='app'?'应用关联列表':'关联列表',onKeyDown:event=>listKey(event),
  }}),
  transformBodyRow:(props,{entry,isSelected})=>({...props,htmlProps:{...props.htmlProps,
   className:[props.htmlProps.className,'association-row'].filter(Boolean).join(' '),
   'data-selected':String(isSelected),
   'aria-current':isSelected?true:undefined,
   onClick:event=>{
    if(event.target instanceof Element&&event.target.closest('button, input, label, a, select, textarea, [role="checkbox"]'))return
    event.currentTarget.querySelector<HTMLButtonElement>('[data-association-id]')?.focus({preventScroll:true})
    openEntry(entry.id)
   },
  }}),
 }),[associationList,kind,listKey,openEntry])
 return <><NotificationHost/><VStack gap={0} className="app-shell">
  <header className="global-header">
   <HStack gap={2} align="center" className="product"><svg aria-hidden="true" viewBox="0 0 28 28"><path d="M15 3H6v22h16V10L15 3Zm0 0v7h7M9 17h10m-3-3 3 3-3 3"/></svg><Text>Default Apps<small>默认应用管理</small></Text></HStack>
   <nav className="view-navigation" aria-label="浏览入口">{(['app','file','scheme'] as View[]).map(view=><Button label={viewNames[view]} icon={<Icon name={view}/>} variant="ghost" key={view} aria-pressed={kind===view} onClick={()=>switchView(view)}/>)}</nav>
   <HStack gap={2} align="center" className="header-actions"><SoftwareUpdate/><ManualActions/><ManualActions kind="application" showStorageWarning={false}/><Button label={snapshot?.scanning ? '正在扫描…' : '重新扫描应用'} icon={<Icon name="refresh"/>} variant="ghost" isDisabled={snapshot?.scanning} onClick={()=>void scan(()=>setIssuesOpen(true))}/></HStack>
  </header>
  <LifecycleStatus changes={changes} observations={observations}/>{recovery.dialog}
  <ChangeStatus changes={changes} observations={observations} onReturn={actions.returnToRequest}/>
  <BatchBars controller={batch} showSelection={kind==='file'}/>

  <Grid className={`browser-workspace ${kind==='app' ? '' : 'catalog-view'}`}>
   {kind==='app' ? <aside className="sidebar">
    <HStack gap={2} align="center" className="catalog-heading"><Heading level={2}>已安装应用</Heading><Text>{applicationMatches.length} / {snapshot?.apps?.length ?? 0}</Text></HStack>
    <HStack gap={2} align="center" className="application-filter" role="group" aria-label="应用类型筛选">{(['user','system','all'] as ApplicationFilter[]).map(value=><Button label={`${appFilterNames[value]}应用`} variant="ghost" key={value}  aria-pressed={appFilter===value} onClick={()=>changeAppFilter(value)}>{appFilterNames[value]}</Button>)}</HStack>
    <TextInput containerClassName="search-field" label="搜索应用" aria-label="搜索应用名称、版本、路径或声明" ref={appSearch} type="search" autoComplete="off" hasAutoCorrect={false} autoCapitalize="none" hasSpellCheck={false} startIcon={<Icon name="search"/>} placeholder="名称、版本、路径或声明" value={appQuery} onChange={actions.setAppQuery} onKeyDown={event=>searchKey(event,true)}/>
    <VStack gap={0} ref={appList} className="application-list" role="region" aria-label="已安装应用列表" onKeyDown={event=>listKey(event,true)}>{applicationMatches.map(({item,associationCount})=><Item as="button" role="button" key={item.app.path} data-app-path={item.app.path} className="application-row" tabIndex={item.app.path===selectedApp?.app.path || (!selectedApp && item===applicationMatches[0]?.item) ? 0 : -1} aria-pressed={item.app.path===selectedApp?.app.path} aria-label={`${item.app.name} ${item.app.version} ${item.app.path}${item.app.system ? ' 系统应用' : ''}`} isSelected={item.app.path===selectedApp?.app.path} onClick={()=>selectApp(item.app.path)} startContent={<ApplicationIcon app={item.app} className="application-icon--row"/>} label={<HStack as="span" gap={2} align="center" wrap="wrap"><strong>{item.app.name}</strong><SystemAppBadge app={item.app}/></HStack>} description={`版本 ${item.app.version || '未知'} · ${associationCount} 个关联`} endContent={<Icon name="chevron"/>}/>)}</VStack>
   </aside> : null}
   <main className="workspace">
    {kind==='app' ? <header className="app-heading">
     <HStack gap={2} align="center" className="page-identity"><VStack as="span" gap={0} className="page-icon" data-application={String(!!selectedApp)}>{selectedApp ? <ApplicationIcon app={selectedApp.app} className="application-icon--page"/> : <Icon name="app"/>}</VStack><VStack gap={0}><Heading level={1}>{selectedApp?.app.name || '已安装应用'}</Heading>
      {selectedApp ? <><p>版本 {selectedApp.app.version || '未知'} · {selectedApp.app.bundleID || 'Bundle ID 未提供'}</p><p className="heading-path" title={selectedApp.app.path}>{selectedApp.app.displayPath || selectedApp.app.path}</p>{selectedApp.unavailable ? <p className="query-error" role="status">手动应用位置暂不可用 · {selectedApp.app.metadataError || '原副本未找到'}<br/>{selectedApp.app.path}</p> : selectedApp.app.metadataError ? <p className="query-error">应用信息暂不可用：{selectedApp.app.metadataError}</p> : null}</> : <p>这台 Mac 的实际默认与系统候选</p>}
     </VStack></HStack>
    </header> : null}
    {catalogLoading || snapshot?.scanning ? <p className="scan-status" role="status">{snapshot?.scanning ? `正在扫描应用…已发现 ${snapshot.apps?.length ?? 0} 份` : '正在解析常用关联…'}</p> : null}
    {catalogError ? <VStack gap={0} className="query-error" role="alert"><p>目录加载失败{entries.length ? '，保留已解析目录。' : '。'}{catalogError}</p><Button label="重试加载目录" variant="secondary" onClick={()=>void retryCatalog()}/></VStack> : null}
    {kind==='app' && missingAppPath ? <VStack gap={0} role="status" aria-label="原应用副本已不在目录中" className="missing-copy"><strong>原应用副本已不在目录中</strong><p>{missingAppPath}</p><p>可选择其他应用副本继续浏览。</p></VStack> : null}
    <section className="association-toolbar" aria-label="关联筛选">
     <HStack className="association-filters" gap={3} align="end">
      <TextInput containerClassName="search-field" label={kind==='app' ? '筛选关联' : `搜索${viewNames[kind]}`} aria-label={kind==='app' ? '筛选当前关联' : `搜索${viewNames[kind]}`} ref={associationSearch} type="search" autoComplete="off" hasAutoCorrect={false} autoCapitalize="none" hasSpellCheck={false} startIcon={<Icon name="search"/>} value={filter} placeholder={kind==='scheme' ? '名称或协议，如 https' : '名称、扩展名或类型身份'} onChange={actions.setFilter} onKeyDown={event=>searchKey(event)}/>
      {kind==='app' ? <Selector containerClassName="association-source-filter" label="来源" aria-label="筛选关联来源" value={sourceFilter} onChange={value=>actions.setSourceFilter(value as AssociationSourceFilter)} options={[...associationSourceOptions]} presentation="popover"/> : null}
      <CheckboxInput className="manual-only-filter" label="仅手动添加" value={manualOnly} onChange={actions.setManualOnly} size="sm"/>

     </HStack>
    </section>
    <Table className="association-table" aria-label={kind==='app'?'应用关联':'关联目录'} data={tableRows} columns={tableColumns} idKey="id" density="compact" dividers="rows" hasHover verticalAlign="middle" textOverflow="wrap" plugins={{browser:tablePlugin}} emptyState={<VStack gap={0} className="empty-workspace"><VStack as="span" gap={0} className="empty-icon"><Icon name="search"/></VStack><Heading level={2}>{emptyHeadline}</Heading><p>可清除搜索或筛选{kind==='app' && !selectedApp && appFilter!=='all' ? '、切换应用类型' : ''}，或切换浏览入口继续查看这台 Mac 的默认应用。</p><HStack gap={2} align="center" className="empty-actions"><Button label={manualOnly || (kind==='app' && sourceFilter!=='all') ? '清除搜索和筛选' : '清除搜索'} variant="secondary" onClick={clearSearch}/>{kind==='app' && !selectedApp && appFilter!=='all' ? <Button label="显示全部应用" variant="secondary" onClick={()=>changeAppFilter('all')}/> : null}{kind!=='file' ? <Button label="浏览文件类型" variant="secondary" onClick={()=>switchView('file')}/> : null}{kind!=='scheme' ? <Button label="浏览 URL 协议" variant="secondary" onClick={()=>switchView('scheme')}/> : null}</HStack></VStack>}/>
    <footer className="browser-footer"><HStack as="span" gap={2} align="center" className="footer-source"><VStack as="span" gap={0} className="status-dot"/>{kind==='app' ? '同一扩展名可能对应多个类型；当前默认按具体类型查询。' : '默认应用由系统独立查询'}</HStack>{snapshot?.issues?.length ? <Button label={`扫描问题 · ${snapshot.issues.length}`} variant="secondary" onClick={()=>setIssuesOpen(true)}>扫描问题 · {snapshot.issues.length}</Button> : null}</footer>
   </main>
  </Grid>
  <FileDrop controller={batch}/>
  <BatchDialogs controller={batch} apps={batchApps}/>
  {issuesOpen ? <Dialog title="扫描问题" onClose={()=>setIssuesOpen(false)}><ul className="scan-issues">{snapshot?.issues?.map((issue,index)=><li key={index}><p>{issue.path}</p><p>{issue.origin} · {issue.message}</p></li>)}</ul></Dialog> : null}
  {inspectedCopy ? <Dialog title="所选应用副本" onClose={closeCopy}><section aria-label="所选应用副本"><ApplicationCopy app={inspectedCopy} onSubmit={detailOpen&&selected?app=>submitCopy(selected,app):undefined} disabled={!canChange(selected,inspectedCopy)}/></section></Dialog> : null}
  {selected && detailOpen ? <Dialog title={entryName(selected)} subtitle={selected.association.key || '尚未解析'} onClose={closeDetails}>
    {requestEntryMissing ? <p role="status" className="query-error">此关联已不在当前目录中；仍按原修改请求查询。</p> : null}
    <HStack gap={2} align="center" className="page-heading"><VStack gap={0}><Heading level={3}>关联查询</Heading><p>{selected.extensions?.map(value => `.${value}`).join(' · ')}{selected.extensions?.length ? ' · ' : ''}{selected.association.key || '尚未解析'}</p></VStack><Button label={loading ? '正在查询…' : selected.resolved ? '重新查询' : '重新解析'} icon={<Icon name="refresh"/>} variant="secondary" onClick={() => void (selected.resolved ? refresh(true) : reparse())} isDisabled={loading || catalogLoading || (!selected.resolved && !!snapshot?.scanning)}/></HStack>
    <VStack gap={0} className="query-content" role="region" aria-label={`${selected.name || '关联'} 查询结果`} tabIndex={0} aria-busy={loading}>
     {!selected.resolved ? <VStack gap={0} className="query-error" role="status"><p>关联尚未解析，不能查询或修改默认应用。</p><p>{selected.unresolvedReason}</p>{selected.diagnosticIdentifiers?.length ? <p>系统诊断：{selected.diagnosticIdentifiers.join('、')}</p> : null}<ManualActions label="选择文件识别类型…" showStorageWarning={false}/></VStack> : <>
      {transportError ? <p role="alert" className="query-error">查询连接失败{visibleResult ? '，显示最后有效观察，待更新。' : '。'}{transportError}</p> : null}
      <section aria-labelledby="current-heading"><Heading level={2} id="current-heading">当前默认应用</Heading>
       {visibleResult?.default.error ? <VStack gap={0} className="query-error" role="status"><p>{visibleResult.default.known ? '默认应用待更新 · 保留最后有效观察' : '默认应用查询失败'}</p><p>{visibleResult.default.error.message}</p></VStack> : null}
       {visibleResult?.default.app ? <ApplicationCopy app={visibleResult.default.app} missing={missingCopyPaths.has(visibleResult.default.app.path)} /> : <p>{visibleResult?.default.known ? '系统未返回默认应用' : loading ? '正在读取系统默认…' : '尚无有效默认观察'}</p>}
       {visibleResult?.default.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.default.observedAt).toLocaleString()}</p> : null}
      </section>
      <section aria-labelledby="candidates-heading"><HStack gap={2} align="center" className="section-heading"><Heading level={2} id="candidates-heading">系统候选应用</Heading>{visibleResult?.candidates.known ? <Text>{visibleResult.candidates.apps?.length ?? 0} 个应用副本</Text> : null}</HStack>
       {visibleResult?.candidates.error ? <VStack gap={0} className="query-error" role="status"><p>{visibleResult.candidates.known ? '候选应用待更新 · 保留最后有效观察' : '候选应用查询失败'}</p><p>{visibleResult.candidates.error.message}</p></VStack> : null}
       {!visibleResult?.candidates.known ? <p>{loading ? '正在读取系统候选…' : '尚无有效候选观察'}</p> : null}
       {visibleResult?.candidates.known && !visibleResult.candidates.apps?.length ? <p>系统未返回候选应用</p> : null}
       {visibleResult?.candidates.known ? <p className="freshness">最后有效查询：{new Date(visibleResult.candidates.observedAt).toLocaleString()}</p> : null}
       <ManualApplicationAction association={selected.association} onSelected={inspectCopy}/>
       <ul className="candidate-list">{visibleResult?.candidates.apps?.map(app => <li key={app.path}><ApplicationCopy app={app} onSubmit={app=>submitCopy(selected,app)} disabled={!canChange(selected,app)}/></li>)}</ul>
      </section>
     </>}
     <Sources entry={selected} />
    </VStack>
  </Dialog> : null}
 </VStack></>
}
