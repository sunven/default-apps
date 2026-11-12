import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { Query } from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type { Snapshot } from '../bindings/github.com/sunven/default-apps/internal/discovery/models'
import { useAssociationBrowser, type CatalogAdapter, type BrowserDOMAdapter } from './useAssociationBrowser'
import { useAssociationQueries } from './useAssociationQueries'
import {toast,type ToastT} from 'sonner'
const activeToasts=()=>toast.getToasts().filter((item):item is ToastT=>'title' in item)

vi.mock('@wailsio/runtime', () => ({ Events: { On: vi.fn(() => () => {}) } }))
vi.mock('../bindings/github.com/sunven/default-apps/internal/change/service', () => ({ Query: vi.fn() }))

const entry = (key: string, name: string, extensions: string[], common = false): Entry => ({
  id: `file:${key}`, association: { kind: 'file', key }, name, extensions, mimeTypes: [],
  sources: [{ kind: common ? 'common' : 'declaration', inputKind: 'identifier', rawInput: key, normalizedInput: key, label: name }],
  resolved: true, unresolvedReason: '', diagnosticIdentifiers: [],
})
const pdf = entry('com.adobe.pdf', 'PDF 文稿', ['pdf'], true)
const jpeg = entry('public.jpeg', 'JPEG 图像', ['jpg', 'jpeg'])
const otherJPEG = entry('test.independent.jpg', 'JPEG 导出', ['jpg'])
const https: Entry = { ...entry('https', 'https', [], true), id: 'scheme:https', association: { kind: 'scheme', key: 'https' } }
const app = { path: '/Applications/Reader.app', displayPath: '/Applications/Reader.app', name: 'Reader', version: '2.4', bundleID: 'test.reader' }
const archive = { ...app, path: '/Volumes/Archive/Reader.app', displayPath: '/Volumes/Archive/Reader.app', version: '1.2' }
const systemApp = { ...app, path: '/System/Applications/Safari.app', name: 'Safari', system: true }
const snapshot = {
  version: 2, scanning: false, entries: [jpeg, pdf, otherJPEG, https],
  apps: [
    { app, associationIDs: [jpeg.id, pdf.id, otherJPEG.id], declarations: [], definitions: [], issues: [] },
    { app: archive, associationIDs: [], declarations: [], definitions: [], issues: [] },
    { app: systemApp, associationIDs: [pdf.id, https.id], declarations: [], definitions: [], issues: [] },
  ], issues: [], roots: [], startedAt: '', completedAt: '', durationMS: 0,
} satisfies Snapshot
const unresolved: Entry = { ...pdf, id: 'unresolved:extension:pdf', association: { kind: 'file', key: '' }, resolved: false, unresolvedReason: 'temporarily unavailable' }
const unresolvedSnapshot = {
  ...snapshot, entries: [unresolved, jpeg, https],
  apps: [{ ...snapshot.apps[0], associationIDs: [unresolved.id, jpeg.id] }, snapshot.apps[2]],
} satisfies Snapshot
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
function environment(initial = snapshot) {
  const listeners = new Set<(value: Snapshot) => void>()
  const catalog = {
    list: vi.fn<CatalogAdapter['list']>().mockResolvedValue(initial.entries),
    getSnapshot: vi.fn<CatalogAdapter['getSnapshot']>().mockResolvedValue(initial),
    startScan: vi.fn<CatalogAdapter['startScan']>().mockResolvedValue(initial),
    reparse: vi.fn<CatalogAdapter['reparse']>().mockResolvedValue(initial),
    subscribe: vi.fn((accept: (value: Snapshot) => void) => { listeners.add(accept); return () => { listeners.delete(accept) } }),
  }
  let scroll = { apps: 0, associations: 0 }
  const dom = {
    readScroll: vi.fn(() => scroll),
    setScroll: vi.fn<BrowserDOMAdapter['setScroll']>(positions => { scroll = { ...scroll, ...positions } }),
    focus: vi.fn<BrowserDOMAdapter['focus']>(),
    visibleAssociationIDs: vi.fn(() => new Set([jpeg.id])),
  }
  return { catalog, dom, listeners, publish: (value: Snapshot) => { for (const accept of listeners) accept(value) },
    scrollTo: (apps: number, associations: number) => { scroll = { apps, associations } } }
}
async function openBrowser(initial = snapshot) {
  const env = environment(initial)
  const hook = renderHook(() => useAssociationBrowser(env))
  await act(async () => {})
  return { ...hook, ...env }
}
async function openReparse() {
  const browser = await openBrowser(unresolvedSnapshot)
  act(() => browser.result.current.actions.openEntry(unresolved.id))
  return browser
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(Query).mockImplementation(association => Promise.resolve({ association, version: 1,
    default: { known: true, app: null, observedAt: 'now', stale: false, error: null },
    candidates: { known: true, apps: [], observedAt: 'now', stale: false, error: null },
  }) as unknown as ReturnType<typeof Query>)
})

test('startup scanning is silent and an explicit scan finishes only on its final snapshot',async()=>{
 const browser=await openBrowser()
 expect(activeToasts()).toHaveLength(0)
 const onIssues=vi.fn()
 browser.catalog.startScan.mockResolvedValue({...snapshot,version:3,scanning:true,startedAt:'new-scan'})
 await act(async()=>browser.result.current.actions.scan(onIssues))
 const pending=activeToasts().find(item=>item.title==='正在扫描应用…')!
 expect(pending).toBeDefined()
 act(()=>browser.publish({...snapshot,version:4,scanning:true,startedAt:'new-scan'}))
 expect(activeToasts().find(item=>item.id===pending.id)?.title).toBe('正在扫描应用…')
 act(()=>{toast.dismiss(pending.id)})
 act(()=>browser.publish({...snapshot,version:5,scanning:true,startedAt:'new-scan'}))
 expect(activeToasts().find(item=>item.id===pending.id)).toBeUndefined()
 const final={...snapshot,version:6,startedAt:'new-scan',completedAt:'done',issues:[{path:'/Broken.app',origin:'metadata',message:'不可读取'}]}
 act(()=>browser.publish(final))
 const result=activeToasts().find(item=>item.title==='扫描完成，发现部分问题')!
 expect(result.title).toBe('扫描完成，发现部分问题')
 expect(result.duration).toBe(Infinity)
 const action=result.action
 if(action&&typeof action==='object'&&'onClick' in action)action.onClick({} as never)
 expect(onIssues).toHaveBeenCalledTimes(1)
 act(()=>{toast.dismiss(result.id);browser.publish(final)})
 expect(activeToasts().find(item=>item.title==='扫描完成，发现部分问题')).toBeUndefined()
})

test('application associations combine declarations and defaults once, support search and remove only obsolete defaults',async()=>{
 const browser=await openBrowser()
 act(()=>browser.result.current.actions.setDefaultPaths({[pdf.id]:app.path,[https.id]:app.path,[jpeg.id]:archive.path}))
 const match=()=>browser.result.current.view.applicationMatches.find(item=>item.item.app.path===app.path)!
 expect(match().associationCount).toBe(4)
 expect(match().entries.filter(item=>item.id===pdf.id)).toHaveLength(1)
 expect(browser.result.current.view.applicationMatches.find(item=>item.item.app.path===archive.path)?.associationCount).toBe(1)
 act(()=>browser.result.current.actions.setAppQuery('https'))
 expect(browser.result.current.view.applicationMatches.map(item=>item.item.app.path)).toEqual([app.path])
 expect(browser.result.current.view.visibleEntries.map(item=>item.id)).toEqual([https.id])
 act(()=>browser.result.current.actions.setAppQuery(''))
 act(()=>browser.result.current.actions.setDefaultPaths({}))
 expect(match().associationCount).toBe(3)
 expect(match().entries.some(item=>item.id===pdf.id)).toBe(true)
 expect(match().entries.some(item=>item.id===https.id)).toBe(false)
 expect(browser.result.current.view.applicationMatches.find(item=>item.item.app.path===archive.path)?.associationCount).toBe(0)
})

test('source filters follow the selected copy and visible declaration precedence, and combine with manual and text filters',async()=>{
 const source=(inputKind:string,rawInput:string,appPath=app.path)=>({kind:'declaration',inputKind,rawInput,normalizedInput:rawInput,label:rawInput,appPath})
 const direct={...pdf,sources:[source('identifier',pdf.association.key),source('extension','pdf')]}
 const extension={...jpeg,sources:[source('extension','jpg'),source('identifier',jpeg.association.key,archive.path)]}
 const mixed={...otherJPEG,sources:[source('extension','jpg'),source('mime','image/jpeg'),{...source('identifier',otherJPEG.association.key),kind:'manual'}]}
 const legacy={...pdf,id:'file:test.legacy',association:{kind:'file',key:'test.legacy'},sources:[source('ostype','TEXT')]}
 const other={...pdf,id:'file:test.other',association:{kind:'file',key:'test.other'},sources:[source('unknown','other')]}
 const currentDefault={...https,sources:[source('scheme','https',archive.path)]}
 const entries=[direct,extension,mixed,legacy,other,currentDefault]
 const browser=await openBrowser({...snapshot,entries,apps:[{...snapshot.apps[0],associationIDs:entries.filter(item=>item!==currentDefault).map(item=>item.id)}]})
 act(()=>browser.result.current.actions.setDefaultPaths({[direct.id]:app.path,[currentDefault.id]:app.path}))
 const ids=()=>browser.result.current.view.visibleEntries.map(item=>item.id)
 const choose=(value:Parameters<typeof browser.result.current.actions.setSourceFilter>[0])=>act(()=>browser.result.current.actions.setSourceFilter(value))
 choose('default');expect(ids()).toEqual([currentDefault.id])
 choose('direct');expect(ids()).toEqual([direct.id])
 choose('extension');expect(ids()).toEqual([extension.id,mixed.id])
 choose('mime');expect(ids()).toEqual([mixed.id])
 choose('ostype');expect(ids()).toEqual([legacy.id])
 choose('other');expect(ids()).toEqual([other.id])
 choose('extension')
 browser.scrollTo(0,100)
 act(()=>browser.result.current.actions.setManualOnly(true))
 expect(ids()).toEqual([mixed.id])
 act(()=>browser.result.current.actions.setFilter('missing'))
 expect(ids()).toEqual([])
 act(()=>browser.result.current.actions.clearSearch())
 expect(browser.result.current.view.sourceFilter).toBe('all')
 expect(browser.result.current.view.manualOnly).toBe(false)
 expect(ids()).toHaveLength(entries.length)
})

test('subscribes before reading and keeps an event newer than both initial replies and the common catalog', async () => {
  const env = environment(), read = deferred<Snapshot>(), scan = deferred<Snapshot>(), list = deferred<Entry[]>()
  env.catalog.getSnapshot.mockReturnValue(read.promise)
  env.catalog.startScan.mockReturnValue(scan.promise)
  env.catalog.list.mockReturnValue(list.promise)
  const { result } = renderHook(() => useAssociationBrowser(env))
  expect(env.catalog.subscribe.mock.invocationCallOrder[0]).toBeLessThan(env.catalog.getSnapshot.mock.invocationCallOrder[0])
  act(() => env.publish({ ...snapshot, version: 4 }))
  await act(async () => { read.resolve({ ...snapshot, version: 1, apps: [], entries: [] }); scan.resolve({ ...snapshot, version: 3, apps: [], entries: [] }); list.resolve([https]) })
  expect(result.current.view.selectedApp?.app.path).toBe(app.path)
  expect(result.current.view.entries).toEqual(snapshot.entries)
  expect(result.current.view.catalogLoading).toBe(false)
})

test('startup selects an available copy when the scan immediately replaces the saved directory', async () => {
  const env = environment()
  env.catalog.getSnapshot.mockResolvedValue({ ...snapshot, version: 1, apps: [snapshot.apps[1]] })
  env.catalog.startScan.mockResolvedValue({ ...snapshot, apps: [snapshot.apps[0]] })
  const { result } = renderHook(() => useAssociationBrowser(env))
  await act(async () => {})
  expect(result.current.view.selectedApp?.app.path).toBe(app.path)
  expect(result.current.view.missingAppPath).toBeNull()
})

test('only the latest catalog retry can change loading or errors while retaining the scanned directory', async () => {
  const browser = await openBrowser(), old = deferred<Entry[]>(), recent = deferred<Entry[]>()
  browser.catalog.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise)
  act(() => { void browser.result.current.actions.retryCatalog(); void browser.result.current.actions.retryCatalog() })
  await act(async () => old.reject(new Error('obsolete failure')))
  expect(browser.result.current.view.catalogLoading).toBe(true)
  expect(browser.result.current.view.catalogError).toBeNull()
  await act(async () => recent.reject(new Error('current failure')))
  expect(browser.result.current.view.catalogLoading).toBe(false)
  expect(browser.result.current.view.catalogError).toContain('current failure')
  expect(browser.result.current.view.entries).toEqual(snapshot.entries)
  browser.catalog.list.mockResolvedValue([https])
  await act(async () => browser.result.current.actions.retryCatalog())
  expect(browser.result.current.view.catalogError).toBeNull()
  expect(browser.result.current.view.entries).toEqual(snapshot.entries)
})

test('scan progress preserves the selected copy and declarations until completion confirms its absence', async () => {
  const browser = await openBrowser()
  act(() => browser.result.current.actions.openEntry(jpeg.id))
  browser.scrollTo(180, 94)
  act(() => browser.publish({ ...snapshot, version: 3, scanning: true, apps: [snapshot.apps[1]], entries: [https] }))
  expect(browser.result.current.view.selectedApp?.app.path).toBe(app.path)
  expect(browser.result.current.view.selected?.id).toBe(jpeg.id)
  expect(browser.result.current.view.detailOpen).toBe(true)
  expect(browser.dom.readScroll()).toEqual({ apps: 180, associations: 94 })
  act(() => browser.publish({ ...snapshot, version: 4, apps: [snapshot.apps[1]], entries: [https] }))
  expect(browser.result.current.view.missingAppPath).toBe(app.path)
  expect(browser.result.current.view.selectedApp).toBeUndefined()
  expect(browser.result.current.view.detailOpen).toBe(false)
  expect(browser.result.current.view.missingCopyPaths.has(app.path)).toBe(true)
})

test('metadata and declaration searches combine with both filters and classification clears details and scroll', async () => {
  const browser = await openBrowser()
  act(() => browser.result.current.actions.setAppQuery('Reader'))
  expect(browser.result.current.view.visibleEntries.map(entry => entry.id)).toEqual([pdf.id, jpeg.id, otherJPEG.id])
  act(() => browser.result.current.actions.setAppQuery('.jpg'))
  expect(browser.result.current.view.selectedMatch?.metadataMatch).toBe(false)
  expect(browser.result.current.view.visibleEntries.map(entry => entry.id)).toEqual([jpeg.id, otherJPEG.id])
  act(() => browser.result.current.actions.setFilter('independent'))
  expect(browser.result.current.view.visibleEntries.map(entry => entry.id)).toEqual([otherJPEG.id])
  act(() => { browser.result.current.actions.openEntry(otherJPEG.id); browser.result.current.actions.inspectCopy(app) })
  browser.scrollTo(120, 80)
  act(() => browser.result.current.actions.changeAppFilter('system'))
  expect(browser.result.current.view.appQuery).toBe('.jpg')
  expect(browser.result.current.view.filter).toBe('independent')
  expect(browser.result.current.view.detailOpen).toBe(false)
  expect(browser.result.current.view.inspectedCopy).toBeNull()
  expect(browser.dom.readScroll()).toEqual({ apps: 0, associations: 0 })
  act(() => browser.result.current.actions.switchView('file'))
  act(() => browser.result.current.actions.switchView('app'))
  expect(browser.result.current.view.appFilter).toBe('system')
  expect(browser.result.current.view.filter).toBe('independent')
})

test('each entrance restores browsing independently of temporary request details and nested copy inspection', async () => {
  const browser = await openBrowser()
  act(() => browser.result.current.actions.setAppQuery('Reader'))
  act(() => browser.result.current.actions.selectEntry(jpeg.id))
  browser.scrollTo(180, 96)
  act(() => browser.result.current.actions.switchView('file'))
  act(() => browser.result.current.actions.setFilter('.jpg'))
  act(() => browser.result.current.actions.moveSelection(false, 'End'))
  browser.scrollTo(180, 83)
  const original = { kind: 'scheme', key: 'missing-request-scheme' }
  act(() => browser.result.current.actions.returnToRequest(original))
  expect(browser.result.current.view.selected?.association).toEqual(original)
  expect(browser.result.current.view.browsedSelected?.id).toBe(otherJPEG.id)
  expect(browser.result.current.view.requestEntryMissing).toBe(true)
  act(() => browser.result.current.actions.inspectCopy(archive))
  act(() => browser.result.current.actions.closeCopy())
  expect(browser.result.current.view.detailOpen).toBe(true)
  act(() => browser.result.current.actions.closeDetails())
  expect(browser.result.current.view.selected?.id).toBe(otherJPEG.id)
  expect(browser.result.current.view.filter).toBe('.jpg')
  expect(browser.dom.readScroll().associations).toBe(83)
  act(() => browser.result.current.actions.switchView('scheme'))
  act(() => browser.result.current.actions.setFilter('https'))
  browser.scrollTo(180, 42)
  act(() => browser.result.current.actions.switchView('file'))
  expect(browser.result.current.view.filter).toBe('.jpg')
  expect(browser.result.current.view.selected?.id).toBe(otherJPEG.id)
  expect(browser.dom.readScroll().associations).toBe(83)
  act(() => browser.result.current.actions.switchView('app'))
  expect(browser.result.current.view.appQuery).toBe('Reader')
  expect(browser.result.current.view.selected?.id).toBe(jpeg.id)
  expect(browser.dom.readScroll()).toEqual({ apps: 180, associations: 96 })
})

test('reparse consumes the complete event before its reply and follows the authoritative entry identity', async () => {
  const browser = await openReparse(), reply = deferred<Snapshot>()
  browser.catalog.reparse.mockReturnValue(reply.promise)
  act(() => { void browser.result.current.actions.reparse() })
  const [original, token] = browser.catalog.reparse.mock.calls[0]
  expect(original).toEqual(unresolved)
  act(() => browser.publish({ ...unresolvedSnapshot, version: 3, scanning: true, entries: [pdf, jpeg, https] }))
  expect(browser.result.current.view.selected?.resolved).toBe(false)
  const resolved = { ...unresolvedSnapshot, version: 4, apps: [{ ...snapshot.apps[0], associationIDs: [pdf.id, jpeg.id] }],
    entries: [pdf, jpeg, https], reparses: [{ token, status: 'matched', entryID: pdf.id }] }
  act(() => browser.publish(resolved))
  expect(browser.result.current.view.selected?.id).toBe(pdf.id)
  expect(browser.result.current.view.detailOpen).toBe(true)
  await act(async () => reply.resolve({ ...unresolvedSnapshot, version: 3, scanning: true }))
  act(() => browser.publish({ ...resolved, version: 3, reparses: [{ token, status: 'missing' }] }))
  expect(browser.result.current.view.selected?.id).toBe(pdf.id)
})

test.each(['ambiguous', 'missing'])('a current %s reparse closes details with a selection notice', async status => {
  const browser = await openReparse()
  browser.catalog.reparse.mockImplementation((_entry, token) => Promise.resolve({ ...unresolvedSnapshot, version: 3, reparses: [{ token, status }] }))
  await act(async () => browser.result.current.actions.reparse())
  expect(browser.result.current.view.detailOpen).toBe(false)
  expect(browser.result.current.view.reparseNotice).toContain(status === 'ambiguous' ? '多个文件类型' : '已不在当前目录')
})

test('a matched but still unresolved entry remains unavailable for association queries', async () => {
  const browser = await openReparse()
  browser.catalog.reparse.mockImplementation((_entry, token) => Promise.resolve({ ...unresolvedSnapshot, version: 3, reparses: [{ token, status: 'matched', entryID: unresolved.id }] }))
  await act(async () => browser.result.current.actions.reparse())
  expect(browser.result.current.view.detailOpen).toBe(true)
  expect(browser.result.current.queryInputs.selected?.resolved).toBe(false)
})

test('reparse follows the chosen identity even when sibling types and its unavailable placeholder remain', async () => {
  const saved = { ...pdf, id: 'file:fixture.second', association: { kind: 'file', key: 'fixture.second' } }
  const sibling = { ...saved, id: 'file:fixture.first', association: { kind: 'file', key: 'fixture.first' } }
  const placeholder = { ...saved, id: 'unavailable:file:fixture.second', association: { kind: 'file', key: '' }, resolved: false }
  const browser = await openBrowser({ ...snapshot, apps: [], entries: [placeholder, https] })
  act(() => browser.result.current.actions.switchView('file'))
  act(() => browser.result.current.actions.openEntry(placeholder.id))
  browser.catalog.reparse.mockImplementation((_entry, token) => Promise.resolve({ ...snapshot, version: 3, apps: [],
    entries: [sibling, saved, placeholder, https], reparses: [{ token, status: 'matched', entryID: saved.id }] }))
  await act(async () => browser.result.current.actions.reparse())
  expect(browser.result.current.view.selected?.id).toBe(saved.id)
  expect(browser.result.current.queryInputs.selected?.association).toEqual(saved.association)
})

test.each(['selectApp', 'selectEntry', 'switchView', 'changeAppFilter', 'returnToRequest', 'closeDetails', 'dismissDetails'] as const)
  ('%s invalidates pending reparse results and errors', async navigation => {
    const browser = await openReparse(), reply = deferred<Snapshot>()
    browser.catalog.reparse.mockReturnValue(reply.promise)
    act(() => { void browser.result.current.actions.reparse() })
    const token = browser.catalog.reparse.mock.calls[0][1]
    act(() => {
      const actions = browser.result.current.actions
      if (navigation === 'selectApp') actions.selectApp(app.path)
      if (navigation === 'selectEntry') actions.openEntry(jpeg.id)
      if (navigation === 'switchView') actions.switchView('scheme')
      if (navigation === 'changeAppFilter') actions.changeAppFilter('all')
      if (navigation === 'returnToRequest') actions.returnToRequest(https.association)
      if (navigation === 'closeDetails') actions.closeDetails()
      if (navigation === 'dismissDetails') actions.dismissDetails()
    })
    const { selected, detailOpen } = browser.result.current.view
    act(() => browser.publish({ ...unresolvedSnapshot, version: 3, reparses: [{ token, status: 'missing' }] }))
    await act(async () => reply.reject(new Error('obsolete reparse failure')))
    expect(browser.result.current.view.selected?.id).toBe(selected?.id)
    expect(browser.result.current.view.detailOpen).toBe(detailOpen)
    expect(browser.result.current.view.reparseNotice).toBeNull()
    expect(browser.result.current.view.catalogError).toBeNull()
  })

test('an older reparse cannot replace a newer operation through either its result or its error', async () => {
  const browser = await openReparse(), first = deferred<Snapshot>(), second = deferred<Snapshot>()
  browser.catalog.reparse.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  act(() => { void browser.result.current.actions.reparse(); void browser.result.current.actions.reparse() })
  const [old, current] = browser.catalog.reparse.mock.calls.map(call => call[1])
  expect(old).not.toBe(current)
  act(() => browser.publish({ ...unresolvedSnapshot, version: 3, reparses: [{ token: old, status: 'missing' }] }))
  await act(async () => first.reject(new Error('old error')))
  expect(browser.result.current.view.catalogError).toBeNull()
  expect(browser.result.current.view.detailOpen).toBe(true)
  await act(async () => second.resolve({ ...unresolvedSnapshot, version: 4, reparses: [{ token: current, status: 'matched', entryID: jpeg.id }] }))
  expect(browser.result.current.view.selected?.id).toBe(jpeg.id)
})

test('a current reparse error keeps details available for retry', async () => {
  const browser = await openReparse()
  browser.catalog.reparse.mockRejectedValueOnce(new Error('bridge unavailable'))
  await act(async () => browser.result.current.actions.reparse())
  expect(browser.result.current.view.catalogError).toContain('bridge unavailable')
  expect(browser.result.current.view.detailOpen).toBe(true)
  browser.catalog.reparse.mockImplementation((_entry, token) => Promise.resolve({ ...unresolvedSnapshot, version: 3, reparses: [{ token, status: 'matched', entryID: jpeg.id }] }))
  await act(async () => browser.result.current.actions.reparse())
  expect(browser.result.current.view.catalogError).toBeNull()
  expect(browser.result.current.view.selected?.id).toBe(jpeg.id)
})

test('copy inspection and refreshed metadata do not restart queries, while a new selection does', async () => {
  const env = environment()
  const { result } = renderHook(() => {
    const browser = useAssociationBrowser(env)
    useAssociationQueries(browser.queryInputs)
    return browser
  })
  await act(async () => {})
  vi.mocked(Query).mockClear()
  act(() => result.current.actions.inspectCopy(app))
  act(() => result.current.actions.closeCopy())
  act(() => env.publish({ ...snapshot, version: 3,
    apps: snapshot.apps.map(item => ({ ...item, app: { ...item.app, version: 'new metadata' } })),
    entries: snapshot.entries.map(entry => ({ ...entry, name: entry.name + ' updated' })),
  }))
  expect(result.current.view.selectedApp?.app.version).toBe('new metadata')
  expect(Query).not.toHaveBeenCalled()
  act(() => result.current.actions.openEntry(jpeg.id))
  await act(async () => {})
  expect(Query).toHaveBeenCalledWith(jpeg.association)
})

test('StrictMode disconnects old subscriptions and ignores old replies even with higher snapshot versions', async () => {
  const env = environment(), reads = [deferred<Snapshot>(), deferred<Snapshot>()]
  env.catalog.getSnapshot.mockReturnValueOnce(reads[0].promise).mockReturnValueOnce(reads[1].promise)
  const { result, unmount } = renderHook(() => useAssociationBrowser(env), { wrapper: StrictMode })
  await act(async () => reads[1].resolve(snapshot))
  expect(env.listeners.size).toBe(1)
  act(() => env.catalog.subscribe.mock.calls[0][0]({ ...snapshot, version: 99, apps: [], entries: [] }))
  await act(async () => reads[0].resolve({ ...snapshot, version: 100, apps: [], entries: [] }))
  expect(result.current.view.selectedApp?.app.path).toBe(app.path)
  const pending = deferred<Snapshot>()
  env.catalog.startScan.mockReturnValue(pending.promise)
  act(() => { void result.current.actions.scan() })
  const last = result.current.view
  unmount()
  expect(env.listeners.size).toBe(0)
  await act(async () => pending.resolve({ ...snapshot, version: 101, apps: [], entries: [] }))
  expect(result.current.view).toBe(last)
})
