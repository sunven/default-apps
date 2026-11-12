import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type KeyboardEvent, type RefObject } from 'react'
import { Events } from '@wailsio/runtime'
import type {} from '../bindings/github.com/wailsapp/wails/v3/internal/eventdata'
import { List } from '../bindings/github.com/sunven/default-apps/internal/catalog/service'
import { GetSnapshot, Reparse, StartScan } from '../bindings/github.com/sunven/default-apps/internal/discovery/service'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import type { AppCopy, Association } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import { plainKey } from './keyboard'
import { notify, dismissNotification } from './Notifications'
import { matchesAssociationSource, type AssociationSourceFilter } from './associationSources'

export type BrowserView = 'app' | 'file' | 'scheme'
export type ApplicationFilter = 'user' | 'system' | 'all'
type ScrollPositions = { apps?: number; associations?: number }
type FocusTarget =
  | { kind: 'appSearch' | 'associationSearch' }
  | { kind: 'application'; path: string }
  | { kind: 'association'; id: string }

export type CatalogAdapter = {
  list(): Promise<Entry[] | null>
  getSnapshot(): Promise<Snapshot>
  startScan(): Promise<Snapshot>
  reparse(entry: Entry, token: string): Promise<Snapshot>
  subscribe(accept: (snapshot: Snapshot) => void): () => void
}
export type BrowserDOMAdapter = {
  readScroll(): ScrollPositions
  setScroll(positions: ScrollPositions): void
  focus(target: FocusTarget): void
  visibleAssociationIDs(): Set<string>
}
type BrowserRefs = {
  appSearch: RefObject<HTMLInputElement | null>
  associationSearch: RefObject<HTMLInputElement | null>
  appList: RefObject<HTMLDivElement | null>
  associationList: RefObject<HTMLDivElement | null>
}

const wailsCatalog: CatalogAdapter = {
  list: List, getSnapshot: GetSnapshot, startScan: StartScan, reparse: Reparse,
  subscribe: accept => Events.On('defaultapps:catalog', event => accept(event.data)),
}

function browserDOM(refs: BrowserRefs): BrowserDOMAdapter {
  return {
    readScroll: () => ({ apps: refs.appList.current?.scrollTop ?? 0, associations: refs.associationList.current?.scrollTop ?? 0 }),
    setScroll: positions => {
      if (positions.apps !== undefined && refs.appList.current) refs.appList.current.scrollTop = positions.apps
      if (positions.associations !== undefined && refs.associationList.current) refs.associationList.current.scrollTop = positions.associations
    },
    focus: target => {
      let element: HTMLElement | null | undefined
      if (target.kind === 'appSearch') element = refs.appSearch.current
      if (target.kind === 'associationSearch') element = refs.associationSearch.current
      if (target.kind === 'application') element = Array.from(refs.appList.current?.querySelectorAll<HTMLButtonElement>('[data-app-path]') ?? []).find(row => row.dataset.appPath === target.path)
      if (target.kind === 'association') element = Array.from(refs.associationList.current?.querySelectorAll<HTMLButtonElement>('[data-association-id]') ?? []).find(row => row.dataset.associationId === target.id)
      element?.focus({ preventScroll: true })
      element?.scrollIntoView?.({ block: 'nearest' })
    },
    visibleAssociationIDs: () => {
      const bounds = refs.associationList.current?.getBoundingClientRect()
      const ids = new Set<string>()
      if (bounds && bounds.height > 0) for (const row of refs.associationList.current?.querySelectorAll<HTMLButtonElement>('[data-association-id]') ?? []) {
        const rect = row.getBoundingClientRect()
        if (rect.bottom > bounds.top && rect.top < bounds.bottom) ids.add(row.dataset.associationId!)
      }
      return ids
    },
  }
}

type Session = { query: string; manualOnly: boolean; selectedID: string | null; scroll: number }
type State = {
  entries: Entry[]; snapshot: Snapshot | null; scanVersion: number
  defaultPaths: Record<string, string>
  kind: BrowserView; appFilter: ApplicationFilter; appQuery: string; filter: string; manualOnly: boolean; sourceFilter: AssociationSourceFilter
  selectedAppPath: string | null; selectedID: string | null
  detailOpen: boolean; requestEntry: Entry | null; inspectedCopy: AppCopy | null
  catalogLoading: boolean; catalogError: string | null; catalogRequest: number
  reparseNotice: string | null; reparseAnchor: { token: string; version: number } | null
  sessions: Record<BrowserView, Session>; appScroll: number; discoveredPaths: ReadonlySet<string>
  layout: { scroll?: ScrollPositions; focus?: FocusTarget } | null
}
function initialState(): State {
  return {
    entries: [], snapshot: null, scanVersion: 0, defaultPaths: {}, kind: 'app', appFilter: 'user', appQuery: '', filter: '', manualOnly: false, sourceFilter:'all',
    selectedAppPath: null, selectedID: null, detailOpen: false, requestEntry: null, inspectedCopy: null,
    catalogLoading: true, catalogError: null, catalogRequest: 0, reparseNotice: null, reparseAnchor: null,
    sessions: { app: { query: '', manualOnly: false, selectedID: null, scroll: 0 }, file: { query: '', manualOnly: false, selectedID: null, scroll: 0 }, scheme: { query: '', manualOnly: false, selectedID: null, scroll: 0 } },
    appScroll: 0, discoveredPaths: new Set(), layout: null,
  }
}

const entryText = (entry: Entry) => [entry.name, entry.association.key, ...(entry.extensions ?? []).map(value => '.' + value), ...(entry.mimeTypes ?? []), ...(entry.sources ?? []).flatMap(source => [source.rawInput, source.label])].join(' ').toLocaleLowerCase()
function mergeScanningEntries(previous:Entry[], incoming:Entry[]) {
  const entries=new Map(previous.map(entry=>[entry.id,entry]))
  for(const entry of incoming){
    const existing=entries.get(entry.id)
    // A partial scan has not restored manual entries or visited every declaring
    // application yet. Keep those sources until the completed snapshot replaces them.
    const sources=existing ? [...new Map([...(existing.sources??[]),...(entry.sources??[])].map(source=>[JSON.stringify(source),source])).values()] : entry.sources
    entries.set(entry.id,existing ? {...entry,sources} : entry)
  }
  return [...entries.values()]
}
function matchApplications(state: State) {
  const term = state.appQuery.trim().toLocaleLowerCase()
  const index = new Map(state.entries.map(entry => [entry.id, entry]))
  const defaultsByPath = new Map<string,Entry[]>()
  for(const [id,path] of Object.entries(state.defaultPaths)){
    const entry=index.get(id)
    if(!entry)continue
    const entries=defaultsByPath.get(path)
    if(entries)entries.push(entry)
    else defaultsByPath.set(path,[entry])
  }
  return (state.snapshot?.apps ?? [])
    .filter(item => !item.unavailable && (state.appFilter === 'all' || !!item.app.system === (state.appFilter === 'system')))
    .map(item => {
      const metadataMatch = !term || [item.app.name, item.app.version, item.app.path, item.app.displayPath, item.app.bundleID].join(' ').toLocaleLowerCase().includes(term)
      const declarations = (item.associationIDs ?? []).flatMap(id => index.get(id) ?? [])
      const associations=[...new Map([...declarations,...(defaultsByPath.get(item.app.path)??[])].map(entry=>[entry.id,entry])).values()]
      return { item, metadataMatch, associationCount:associations.length, entries: metadataMatch ? associations : associations.filter(entry => entryText(entry).includes(term)) }
    }).filter(match => match.metadataMatch || match.entries.length)
}

function selectApplication(state: State, applicationMatches: ReturnType<typeof matchApplications>, availablePaths: Set<string>) {
  const settled = !!state.snapshot && !state.snapshot.scanning
  const missingAppPath = state.selectedAppPath && settled && !availablePaths.has(state.selectedAppPath) ? state.selectedAppPath : null
  const selectedMatch = missingAppPath ? undefined : state.selectedAppPath ? applicationMatches.find(match => match.item.app.path === state.selectedAppPath) : applicationMatches[0]
  return { selectedMatch, selectedApp: selectedMatch?.item, missingAppPath }
}

function filterEntries(state: State, selectedMatch: ReturnType<typeof selectApplication>['selectedMatch']) {
  const term = state.filter.trim().toLocaleLowerCase()
  return (state.kind === 'app' ? selectedMatch?.entries ?? [] : state.entries.filter(entry => entry.association.kind === state.kind))
    .filter(entry => (!state.manualOnly || entry.sources?.some(source => source.kind === 'manual')) && entryText(entry).includes(term))
    .filter(entry => state.kind!=='app'||matchesAssociationSource(entry,selectedMatch?.item.app.path??'',state.defaultPaths[entry.id]===selectedMatch?.item.app.path,state.sourceFilter))
    .sort((a, b) => (state.kind === 'app' ? Number(state.defaultPaths[b.id] === selectedMatch?.item.app.path) - Number(state.defaultPaths[a.id] === selectedMatch?.item.app.path) : 0)
      || Number(b.sources?.some(source => source.kind === 'common')) - Number(a.sources?.some(source => source.kind === 'common')))
}

function browse(state: State) {
  const applicationMatches = matchApplications(state)
  const availablePaths = new Set((state.snapshot?.apps ?? []).filter(item => !item.unavailable).map(item => item.app.path))
  const application = selectApplication(state, applicationMatches, availablePaths)
  const visibleEntries = filterEntries(state, application.selectedMatch)
  const browsedSelected = visibleEntries.find(entry => entry.id === state.selectedID) ?? visibleEntries[0]
  return {
    applicationMatches, ...application, visibleEntries, browsedSelected,
    selected: state.requestEntry ?? browsedSelected,
  }
}

type Action =
  | { type: 'snapshot'; value: Snapshot }
  | { type: 'defaults'; paths: Record<string, string> }
  | { type: 'catalogStarted'; request: number }
  | { type: 'catalogResult'; request: number; entries: Entry[] }
  | { type: 'catalogFailed'; request: number; error: string }
  | { type: 'catalogError'; error: string | null }
  | { type: 'reparseStarted'; token: string }
  | { type: 'reparseFailed'; token: string; error: string }
  | { type: 'appQuery' | 'filter'; value: string }
  | { type: 'clearSearch'; apps?: boolean; all?: boolean }
  | { type: 'appFilter'; value: ApplicationFilter }
  | { type: 'manualOnly'; value: boolean }
  | { type: 'sourceFilter'; value: AssociationSourceFilter }
  | { type: 'rememberAppSelection'; path: string }
  | { type: 'selectApp'; path: string; focus?: boolean }
  | { type: 'selectEntry'; id: string; focus?: boolean; open?: boolean }
  | { type: 'switchView'; view: BrowserView; scroll: ScrollPositions }
  | { type: 'move'; apps: boolean; key: string }
  | { type: 'searchDown'; apps: boolean }
  | { type: 'enterAssociations' }
  | { type: 'returnToRequest'; association: Association }
  | { type: 'inspectCopy'; app: AppCopy | null }
  | { type: 'closeDetails'; all?: boolean }

function selectApp(state: State, path: string, focus = false): State {
  return { ...state, reparseAnchor: null, selectedAppPath: path, selectedID: null, detailOpen: false, requestEntry: null, inspectedCopy: null,
    layout: { scroll: { associations: 0 }, focus: focus ? { kind: 'application', path } : undefined } }
}
function selectEntry(state: State, id: string, focus = false, open = false): State {
  return { ...state, reparseAnchor: null, reparseNotice: null, selectedID: id, detailOpen: open || state.detailOpen,
    layout: focus ? { focus: { kind: 'association', id } } : state.layout }
}

function transition(state: State, action: Action): State {
  switch (action.type) {
    case 'defaults': {
      if (Object.keys(state.defaultPaths).length === Object.keys(action.paths).length && Object.keys(action.paths).every(id => state.defaultPaths[id] === action.paths[id])) return state
      return { ...state, defaultPaths: action.paths, selectedID: state.selectedID ?? browse(state).browsedSelected?.id ?? null }
    }
    case 'snapshot': {
      const value = action.value
      if (value.version < state.scanVersion) return state
      const apps = value.scanning && state.snapshot?.apps?.length
        ? [...new Map([...(state.snapshot.apps ?? []), ...(value.apps ?? [])].map(item => [item.app.path, item])).values()] : value.apps
      const entries = value.scanning ? mergeScanningEntries(state.entries,value.entries??[]) : value.entries ?? []
      const next = { ...state, scanVersion: value.version, snapshot: { ...value, apps }, entries,
        discoveredPaths: new Set([...state.discoveredPaths, ...(value.apps ?? []).map(item => item.app.path)]) }
      const anchor = state.reparseAnchor
      const result = anchor && !value.scanning && value.version > anchor.version ? value.reparses?.find(result => result.token === anchor.token) : undefined
      if (!result) return next
      if (result.status === 'matched') return { ...next, reparseAnchor: null, selectedID: result.entryID! }
      return { ...next, reparseAnchor: null, selectedID: null, detailOpen: false,
        reparseNotice: result.status === 'ambiguous' ? '此输入解析为多个文件类型，请在列表中选择具体类型。' : '此关联来源已不在当前目录中，请重新选择关联。' }
    }
    case 'catalogStarted': return { ...state, catalogRequest: action.request, catalogLoading: true, catalogError: null }
    case 'catalogResult': return action.request === state.catalogRequest
      ? { ...state, catalogLoading: false, entries: state.scanVersion > 0 && state.entries.length ? state.entries : action.entries } : state
    case 'catalogFailed': return action.request === state.catalogRequest ? { ...state, catalogLoading: false, catalogError: action.error } : state
    case 'catalogError': return { ...state, catalogError: action.error }
    case 'reparseStarted': return { ...state, reparseAnchor: { token: action.token, version: state.scanVersion }, reparseNotice: null, catalogError: null }
    case 'reparseFailed': return state.reparseAnchor?.token === action.token ? { ...state, reparseAnchor: null, catalogError: action.error } : state
    case 'appQuery': return { ...state, appQuery: action.value, selectedAppPath: null, selectedID: null, layout: { scroll: { apps: 0, associations: 0 } } }
    case 'filter': return { ...state, filter: action.value, layout: { scroll: { associations: 0 } } }
    case 'manualOnly': return { ...state, manualOnly: action.value, selectedID: null, reparseAnchor: null, reparseNotice: null,
      detailOpen: false, requestEntry: null, inspectedCopy: null, layout: { scroll: { associations: 0 } } }
    case 'sourceFilter': return { ...state, sourceFilter: action.value, selectedID: null, reparseAnchor: null, reparseNotice: null,
      detailOpen: false, requestEntry: null, inspectedCopy: null, layout: { scroll: { associations: 0 } } }
    case 'clearSearch': {
      const next = action.apps || action.all ? { ...state, appQuery: '', selectedAppPath: null, selectedID: null } : state
      return { ...next, filter: !action.apps || action.all ? '' : state.filter, manualOnly: action.all ? false : state.manualOnly,
        sourceFilter: action.all ? 'all' : state.sourceFilter,
        layout: action.all ? { focus: { kind: state.kind === 'app' ? 'appSearch' : 'associationSearch' } } : state.layout }
    }
    case 'appFilter': return action.value === state.appFilter ? state : { ...state, appFilter: action.value, reparseAnchor: null, reparseNotice: null,
      selectedAppPath: null, selectedID: null, detailOpen: false, requestEntry: null, inspectedCopy: null, appScroll: 0, layout: { scroll: { apps: 0, associations: 0 } } }
    case 'rememberAppSelection': return { ...state, selectedAppPath: action.path }
    case 'selectApp': return selectApp(state, action.path, action.focus)
    case 'selectEntry': return selectEntry(state, action.id, action.focus, action.open)
    case 'switchView': {
      const changed = action.view !== state.kind
      const session = state.sessions[action.view]
      const sessions = changed ? { ...state.sessions, [state.kind]: { query: state.filter, manualOnly: state.manualOnly, selectedID: browse(state).browsedSelected?.id ?? null, scroll: action.scroll.associations ?? 0 } } : state.sessions
      const appScroll = changed && state.kind === 'app' ? action.scroll.apps ?? 0 : state.appScroll
      return { ...state, kind: action.view, sessions, appScroll, filter: changed ? session.query : state.filter, manualOnly: changed ? session.manualOnly : state.manualOnly, selectedID: changed ? session.selectedID : state.selectedID,
        reparseAnchor: null, detailOpen: false, requestEntry: null, inspectedCopy: null,
        layout: { scroll: changed ? { associations: session.scroll, apps: action.view === 'app' ? appScroll : undefined } : undefined } }
    }
    case 'move': {
      const current = browse(state)
      const ids = action.apps ? current.applicationMatches.map(match => match.item.app.path) : current.visibleEntries.map(entry => entry.id)
      const index = Math.max(0, ids.indexOf(action.apps ? current.selectedApp?.app.path ?? '' : current.selected?.id ?? ''))
      const destination = action.key === 'Home' ? 0 : action.key === 'End' ? ids.length - 1 : action.key === 'ArrowDown' ? Math.min(ids.length - 1, index + 1) : action.key === 'ArrowUp' ? Math.max(0, index - 1) : -1
      return destination >= 0 && ids[destination] ? action.apps ? selectApp(state, ids[destination], true) : selectEntry(state, ids[destination], true) : state
    }
    case 'enterAssociations': {
      const selected = browse(state).selected
      return selected ? selectEntry(state, selected.id, true) : { ...state, layout: { focus: { kind: 'associationSearch' } } }
    }
    case 'searchDown': {
      if (!action.apps) return transition(state, { type: 'enterAssociations' })
      const current = browse(state), path = current.selectedApp?.app.path ?? current.applicationMatches[0]?.item.app.path
      return path ? selectApp(state, path, true) : state
    }
    case 'returnToRequest': {
      const association = action.association, id = `${association.kind}:${association.key}`
      const entry = state.entries.find(entry => entry.id === id) ?? { id, association, name: association.key, resolved: true, extensions: [], mimeTypes: [], sources: [], unresolvedReason: '', diagnosticIdentifiers: [] }
      return { ...state, reparseAnchor: null, requestEntry: entry, detailOpen: true, inspectedCopy: null }
    }
    case 'inspectCopy': return { ...state, inspectedCopy: action.app }
    case 'closeDetails': return { ...state, reparseAnchor: null, detailOpen: false, requestEntry: null, inspectedCopy: action.all ? null : state.inspectedCopy }
  }
}

function reduce(state: State, action: Action): State {
  let next = transition(state, action)
  if (next === state) return state
  // Dialogs, row focus and loading flags cannot remove the browsable entries.
  if (next.entries === state.entries && next.snapshot === state.snapshot && next.defaultPaths === state.defaultPaths &&
    next.kind === state.kind && next.appFilter === state.appFilter && next.appQuery === state.appQuery &&
    next.filter === state.filter && next.manualOnly === state.manualOnly && next.sourceFilter === state.sourceFilter && next.selectedAppPath === state.selectedAppPath) return next
  const current = browse(next)
  if (!current.selected && browse(state).selected) next = { ...next, detailOpen: false, requestEntry: null, inspectedCopy: null }
  return next
}

function emptyHeadline(state: State, current: ReturnType<typeof browse>) {
  if (state.kind !== 'app') return state.catalogLoading ? '正在加载关联目录' : state.catalogError ? '关联目录暂时不可用' : state.filter ? '没有匹配的关联项' : state.manualOnly ? '没有手动添加的关联项' : '此入口暂无关联'
  if (current.missingAppPath) return '此副本的关联详情已清空'
  if (current.selectedApp) return current.selectedMatch?.associationCount ? '没有匹配的关联项' : '未找到此应用的声明或当前默认关联'
  if (state.appQuery) return '没有匹配的应用'
  return state.snapshot?.scanning ? '正在发现应用' : state.appFilter === 'all' ? '未发现应用' : `未发现${state.appFilter === 'system' ? '系统' : '非系统'}应用`
}

// Callers express browsing actions; this module owns their ordering and cleanup.
// Stable adapters also let tests cross the same interface without rendering App.
export function useAssociationBrowser(environment?: { catalog?: CatalogAdapter; dom?: BrowserDOMAdapter }) {
  const [state, dispatch] = useReducer(reduce, undefined, initialState)
  const appSearch = useRef<HTMLInputElement>(null), associationSearch = useRef<HTMLInputElement>(null)
  const appList = useRef<HTMLDivElement>(null), associationList = useRef<HTMLDivElement>(null)
  const refs = useMemo(() => ({ appSearch, associationSearch, appList, associationList }), [])
  const catalog = environment?.catalog ?? wailsCatalog
  const dom = useMemo(() => environment?.dom ?? browserDOM(refs), [environment?.dom, refs])
  const lifecycle = useRef(0), catalogSequence = useRef(0)
  const latestSnapshot = useRef<Snapshot | null>(null)
  const scanNotification = useRef<{id:string;version:number;onIssues?:()=>void} | null>(null)
  const reparseNotification = useRef<{id:string;token:string} | null>(null)
  useLayoutEffect(()=>{
    const operation=reparseNotification.current
    if(operation&&operation.token!==state.reparseAnchor?.token){dismissNotification(operation.id);reparseNotification.current=null}
  },[state.reparseAnchor])
  const acceptSnapshot = useCallback((value:Snapshot) => {
    if(value.version < (latestSnapshot.current?.version ?? 0))return
    latestSnapshot.current=value
    const scan=scanNotification.current
    if(scan&&!value.scanning&&value.version>scan.version){
      scanNotification.current=null
      const issues=value.issues?.length??0
      notify(issues?'warning':'success',issues?'扫描完成，发现部分问题':'应用扫描完成',{
        id:scan.id,description:`已发现 ${value.apps?.length??0} 份应用${issues?` · ${issues} 个扫描问题`:''}`,
        action:issues&&scan.onIssues?{label:'查看扫描问题',onClick:scan.onIssues}:undefined,
      })
    }
    const reparse=reparseNotification.current
    const result=!value.scanning&&reparse?value.reparses?.find(item=>item.token===reparse.token):undefined
    if(reparse&&result){
      reparseNotification.current=null
      const entry=value.entries?.find(item=>item.id===result.entryID)
      const matched=result.status==='matched'&&entry?.resolved
      notify(matched?'success':'warning',matched?'关联已重新解析':result.status==='ambiguous'?'此输入解析为多个文件类型，请在列表中选择具体类型。':result.status==='missing'?'此关联来源已不在当前目录中，请重新选择关联。':'关联仍未解析',{
        id:reparse.id,description:matched?entry.name:entry?.unresolvedReason,
      })
    }
    dispatch({type:'snapshot',value})
  },[])
  const applicationMatches = useMemo(() => matchApplications(state), [state.entries, state.snapshot?.apps, state.defaultPaths, state.appFilter, state.appQuery])
  const availablePaths = useMemo(() => new Set((state.snapshot?.apps ?? []).filter(item => !item.unavailable).map(item => item.app.path)), [state.snapshot?.apps])
  const application = useMemo(() => selectApplication(state, applicationMatches, availablePaths), [applicationMatches, availablePaths, !!state.snapshot, state.snapshot?.scanning, state.selectedAppPath])
  const visibleEntries = useMemo(() => filterEntries(state, application.selectedMatch), [state.entries, state.kind, application.selectedMatch, state.filter, state.manualOnly, state.sourceFilter, state.defaultPaths])
  const browsedSelected = visibleEntries.find(entry => entry.id === state.selectedID) ?? visibleEntries[0]
  const settled = !!state.snapshot && !state.snapshot.scanning
  const missingCopyPaths = useMemo(() => new Set(settled ? [...state.discoveredPaths].filter(path => !availablePaths.has(path)) : []), [settled, state.discoveredPaths, availablePaths])
  const current = { applicationMatches, ...application, visibleEntries, browsedSelected, selected: state.requestEntry ?? browsedSelected, missingCopyPaths }
  const selected = useRef(current.selected)
  useLayoutEffect(() => { selected.current = current.selected }, [current.selected])
  // Remember the rendered copy; batched startup snapshots may replace unseen copies.
  useLayoutEffect(() => {
    if (state.kind === 'app' && current.selectedApp && state.selectedAppPath !== current.selectedApp.app.path) {
      dispatch({ type: 'rememberAppSelection', path: current.selectedApp.app.path })
    }
  }, [state.kind, state.selectedAppPath, current.selectedApp])
  useLayoutEffect(() => {
    if (state.layout?.scroll) dom.setScroll(state.layout.scroll)
    if (state.layout?.focus) dom.focus(state.layout.focus)
  }, [state.layout, dom])

  const scan = useCallback(async (onIssues?:()=>void, silent=false) => {
    const generation = lifecycle.current
    if(!silent){
      if(scanNotification.current)dismissNotification(scanNotification.current.id)
      const id=`scan:${crypto.randomUUID()}`
      scanNotification.current={id,version:latestSnapshot.current?.version??0,onIssues}
      notify('pending','正在扫描应用…',{id})
    }
    dispatch({ type: 'catalogError', error: null })
    try { const value = await catalog.startScan(); if (generation === lifecycle.current) acceptSnapshot(value) }
    catch (error) { if (generation === lifecycle.current) {
      if(scanNotification.current){dismissNotification(scanNotification.current.id);scanNotification.current=null}
      dispatch({ type: 'catalogError', error: String(error) })
    } }
  }, [catalog,acceptSnapshot])
  const retryCatalog = useCallback(async (silent=false) => {
    const generation = lifecycle.current, request = ++catalogSequence.current
    if(!silent)notify('pending','正在重新加载关联目录…',{id:'catalog:reload'})
    dispatch({ type: 'catalogStarted', request })
    try { const entries = await catalog.list(); if (generation === lifecycle.current) {
      dispatch({ type: 'catalogResult', request, entries: entries ?? [] })
      if(!silent&&request===catalogSequence.current)notify('success','关联目录已重新加载',{id:'catalog:reload'})
    } }
    catch (error) { if (generation === lifecycle.current) {
      if(!silent&&request===catalogSequence.current)dismissNotification('catalog:reload')
      dispatch({ type: 'catalogFailed', request, error: String(error) })
    } }
  }, [catalog])
  const reparse = useCallback(async () => {
    const entry = selected.current
    if (!entry) return
    const generation = lifecycle.current, token = crypto.randomUUID()
    if(reparseNotification.current)dismissNotification(reparseNotification.current.id)
    const id=`reparse:${token}`
    reparseNotification.current={id,token}
    notify('pending','正在重新解析关联…',{id})
    dispatch({ type: 'reparseStarted', token })
    try { const value = await catalog.reparse(entry, token); if (generation === lifecycle.current) acceptSnapshot(value) }
    catch (error) { if (generation === lifecycle.current) {
      dismissNotification(id)
      if(reparseNotification.current?.token===token)reparseNotification.current=null
      dispatch({ type: 'reparseFailed', token, error: String(error) })
    } }
  }, [catalog,acceptSnapshot])
  useEffect(() => {
    const generation = ++lifecycle.current
    const off = catalog.subscribe(value => { if (generation === lifecycle.current) acceptSnapshot(value) })
    void catalog.getSnapshot().then(value => { if (generation === lifecycle.current) acceptSnapshot(value) }).catch(error => { if (generation === lifecycle.current) dispatch({ type: 'catalogError', error: String(error) }) })
    void scan(undefined,true)
    void retryCatalog(true)
    return () => {
      ++lifecycle.current; off()
      if(scanNotification.current){dismissNotification(scanNotification.current.id);scanNotification.current=null}
      if(reparseNotification.current){dismissNotification(reparseNotification.current.id);reparseNotification.current=null}
      dismissNotification('catalog:reload')
    }
  }, [catalog, scan, retryCatalog,acceptSnapshot])

  const actions = useMemo(() => ({
    scan, retryCatalog, reparse,
    setDefaultPaths: (paths: Record<string, string>) => dispatch({ type: 'defaults', paths }),
    setAppQuery: (value: string) => dispatch({ type: 'appQuery', value }),
    setFilter: (value: string) => dispatch({ type: 'filter', value }),
    setManualOnly: (value: boolean) => dispatch({ type: 'manualOnly', value }),
    setSourceFilter: (value: AssociationSourceFilter) => dispatch({ type: 'sourceFilter', value }),
    changeAppFilter: (value: ApplicationFilter) => dispatch({ type: 'appFilter', value }),
    selectApp: (path: string, focus = false) => dispatch({ type: 'selectApp', path, focus }),
    selectEntry: (id: string, focus = false) => dispatch({ type: 'selectEntry', id, focus }),
    openEntry: (id: string) => dispatch({ type: 'selectEntry', id, open: true }),
    switchView: (view: BrowserView) => dispatch({ type: 'switchView', view, scroll: dom.readScroll() }),
    moveSelection: (apps: boolean, key: string) => dispatch({ type: 'move', apps, key }),
    enterAssociations: () => dispatch({ type: 'enterAssociations' }),
    returnToRequest: (association: Association) => dispatch({ type: 'returnToRequest', association }),
    inspectCopy: (app: AppCopy) => dispatch({ type: 'inspectCopy', app }),
    closeCopy: () => dispatch({ type: 'inspectCopy', app: null }),
    closeDetails: () => dispatch({ type: 'closeDetails' }),
    dismissDetails: () => dispatch({ type: 'closeDetails', all: true }),
    clearSearch: () => dispatch({ type: 'clearSearch', all: true }),
    searchKey: (event: KeyboardEvent<HTMLInputElement>, apps = false) => {
      if (!plainKey(event)) return
      if (event.key === 'ArrowDown') { event.preventDefault(); dispatch({ type: 'searchDown', apps }) }
      if (event.key === 'Escape') { event.preventDefault(); dispatch({ type: 'clearSearch', apps }) }
    },
    listKey: (event: KeyboardEvent<HTMLElement>, apps = false) => {
      if (!plainKey(event) || !(event.target instanceof HTMLButtonElement) || (!apps && !event.target.dataset.associationId)) return
      if (['Home', 'End', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); dispatch({ type: 'move', apps, key: event.key }) }
      if (event.key === 'Enter' && apps) { event.preventDefault(); dispatch({ type: 'enterAssociations' }) }
    },
  }), [scan, retryCatalog, reparse, dom])
  // Metadata, dialogs and sorting must not restart association query rounds.
  // Reverse default associations can only be discovered by querying the catalog,
  // including entries the selected application has never declared.
  const queryCatalog = state.kind==='app'&&state.snapshot?.apps?.some(item=>!item.unavailable) ? state.entries : current.visibleEntries
  const queryEntryKey = useMemo(() => JSON.stringify([...queryCatalog].sort((a, b) => a.id.localeCompare(b.id)).map(entry => [entry.id, entry.association.kind, entry.association.key, entry.resolved])), [queryCatalog])
  const queryEntries = useMemo(() => queryCatalog.map(({ id, association, resolved }) => ({ id, association, resolved })), [queryEntryKey])
  const querySelected = useMemo(() => current.selected ? { id: current.selected.id, association: current.selected.association, resolved: current.selected.resolved } : undefined,
    [current.selected?.id, current.selected?.association.kind, current.selected?.association.key, current.selected?.resolved])
  const getVisibleAssociationIDs = useCallback(() => dom.visibleAssociationIDs(), [dom])
  const queryInputs = useMemo(() => ({ selected: querySelected, entries: queryEntries, getVisibleAssociationIDs }), [querySelected, queryEntries, getVisibleAssociationIDs])
  const view = { ...current, kind: state.kind, appFilter: state.appFilter, appQuery: state.appQuery, filter: state.filter, manualOnly: state.manualOnly, sourceFilter:state.sourceFilter,
    entries: state.entries, snapshot: state.snapshot, detailOpen: state.detailOpen, inspectedCopy: state.inspectedCopy,
    catalogLoading: state.catalogLoading, catalogError: state.catalogError, reparseNotice: state.reparseNotice,
    requestEntryMissing: !!state.requestEntry && !state.entries.some(entry => entry.id === state.requestEntry!.id), emptyHeadline: emptyHeadline(state, current) }
  return { view, actions, refs, queryInputs }
}
