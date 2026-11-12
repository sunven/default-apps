/* THROWAWAY: three layouts on /?prototype=default-apps&variant=A|B|C.
 * Question: should users start with an app, an association, or a search?
 * All mutations are in-memory fixtures. No Wails/runtime imports here.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { apps, appById, initialAssociations, initialDefaults, matches, tagsFor, type Association, type DemoApp } from './data'
import './prototype.css'

type Variant = 'A' | 'B' | 'C'
type View = 'apps' | 'files' | 'urls' | 'all'
const variantNames = { A: '应用优先', B: '关联项优先', C: '搜索优先' }
const variantDescriptions = { A: '从应用的支持能力出发', B: '从当前默认关联出发', C: '从要查找的内容出发' }
const readVariant = (): Variant => {
  const value = new URLSearchParams(location.search).get('variant')
  return value === 'B' || value === 'C' ? value : 'A'
}

function Glyph({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    app: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" /><path d="M13 3v7h7M8 15h8M8 18h5" /></>,
    link: <><path d="m9 15 6-6M7.5 16.5l-1 1a4 4 0 0 1-5.5-5.5l4-4a4 4 0 0 1 5.5 0M16.5 7.5l1-1A4 4 0 0 1 23 12l-4 4a4 4 0 0 1-5.5 0" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    left: <path d="m15 5-7 7 7 7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: <><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" /></>,
    mark: <><path d="M4 6h9a6 6 0 0 1 6 6v5M15 13l4 4 4-4" /><path d="M4 11h6M4 16h5" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.file}</svg>
}

function AppIcon({ app, size = 28 }: { app?: DemoApp; size?: number }) {
  return app ? <img className="p-app-icon" src={app.icon} alt="" width={size} height={size} /> : <Glyph name="app" size={size} />
}

function usePrototypeModel() {
  const [variant, setVariant] = useState<Variant>(readVariant)
  const [view, setView] = useState<View>(() => readVariant() === 'A' ? 'apps' : readVariant() === 'B' ? 'files' : 'all')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState(initialAssociations)
  const [defaults, setDefaults] = useState<Record<string, string>>(initialDefaults)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [selectedAppId, setSelectedAppId] = useState('preview')
  const [selectedId, setSelectedId] = useState('pdf')
  const [modal, setModal] = useState<'picker' | 'app' | 'add' | 'identify' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const selected = items.find(item => item.id === selectedId) || items[0]
  const selectedApp = appById[selectedAppId]
  const appMatches = (app: DemoApp, value: string) => !value.trim() || `${app.name} ${app.path} ${app.version}`.toLowerCase().includes(value.toLowerCase()) || items.some(item => item.declared.includes(app.id) && matches(item, value))
  const visibleApps = apps.filter(app => appMatches(app, query))
  const visibleItems = items.filter(item => (view === 'urls' ? item.kind === 'url' : view === 'files' ? item.kind === 'file' : true) && matches(item, query))
  const supported = items.filter(item => item.declared.includes(selectedAppId))
  const pending = Object.keys(drafts).length

  function changeVariant(next: Variant) {
    const url = new URL(location.href)
    url.searchParams.set('variant', next)
    history.replaceState(null, '', url)
    setVariant(next)
    setView(next === 'A' ? 'apps' : next === 'B' ? 'files' : 'all')
    setQuery('')
    setModal(null)
  }
  function changeView(next: View) {
    setView(next); setQuery('')
    if (next === 'files' || next === 'urls') {
      const kind = next === 'files' ? 'file' : 'url'
      if (selected.kind !== kind) setSelectedId(items.find(item => item.kind === kind)?.id || 'pdf')
    }
  }
  function search(value: string) {
    setQuery(value)
    const first = items.find(item => matches(item, value) && (view === 'urls' ? item.kind === 'url' : view === 'files' ? item.kind === 'file' : true))
    if (!selected || !matches(selected, value) || (view === 'urls' && selected.kind !== 'url') || (view === 'files' && selected.kind !== 'file')) setSelectedId(first?.id || 'pdf')
    if (!appMatches(selectedApp, value)) setSelectedAppId(apps.find(app => appMatches(app, value))?.id || 'preview')
  }
  function pick(item: Association, appId: string) {
    if (!item.resolved || busy) return
    setDrafts(previous => {
      const next = { ...previous }
      if (defaults[item.id] === appId) delete next[item.id]
      else next[item.id] = appId
      return next
    })
    setNotice('')
    setModal(null)
  }
  function openPicker(item: Association) { setSelectedId(item.id); setModal(item.resolved ? 'picker' : 'identify') }
  function apply() {
    if (!pending || busy) return
    const changes = { ...drafts }
    setBusy(true)
    timer.current = setTimeout(() => {
      setDefaults(previous => ({ ...previous, ...changes }))
      setDrafts({})
      setBusy(false)
      setNotice(`已在原型中更新 ${Object.keys(changes).length} 项关联`)
    }, 350)
  }
  function reset() {
    clearTimeout(timer.current)
    setItems(initialAssociations); setDefaults(initialDefaults); setDrafts({}); setQuery('')
    setSelectedAppId('preview'); setSelectedId('pdf'); setBusy(false); setNotice(''); setModal(null)
  }
  function add(value: string, kind: 'file' | 'url') {
    const clean = value.trim().toLowerCase().replace(/^\./, '').replace(/:$/, '')
    if (!clean) return
    const existing = items.filter(item => item.kind === kind && item.tags.includes(clean))
    if (existing.length) setSelectedId(existing[0].id)
    else {
      const id = `manual-${kind}-${clean}`
      setItems(previous => [...previous, { id, name: kind === 'file' ? `.${clean} 文件` : `${clean} 链接`, kind, category: '手动添加', tags: [clean], type: kind === 'url' ? clean : '', declared: [], candidates: [], resolved: kind === 'url', source: '手动添加' }])
      setSelectedId(id)
    }
    setView(kind === 'file' ? 'files' : 'urls'); setQuery(clean); setModal(null)
  }
  function identify(target: string | null) {
    if (!target) { setNotice('示例文件仍无法识别类型'); return }
    setItems(previous => previous.filter(item => item.id !== selectedId || item.resolved))
    setSelectedId(target); setView('files'); setQuery(''); setModal(null)
    setNotice('已通过示例文件定位文件类型')
  }

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (modal || target.closest('input, textarea, select, [contenteditable="true"]') || event.altKey || event.metaKey || event.ctrlKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const variants: Variant[] = ['A', 'B', 'C']
        changeVariant(variants[(variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant, modal])
  useEffect(() => {
    const onPop = () => changeVariant(readVariant())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { variant, view, query, items, defaults, drafts, selected, selectedApp, selectedAppId, modal, busy, notice, supported, pending, visibleApps, visibleItems, changeVariant, changeView, search, pick, openPicker, apply, reset, add, identify, setSelectedId, setSelectedAppId, setModal, setDrafts }
}
type Model = ReturnType<typeof usePrototypeModel>

function SearchField({ model, label = '搜索应用、扩展名或协议' }: { model: Model; label?: string }) {
  return <label className="p-search"><Glyph name="search" size={16} /><input aria-label={label} placeholder={label} value={model.query} onChange={event => model.search(event.target.value)} />{model.query ? <button className="p-icon-button" aria-label="清除搜索" onClick={() => model.search('')}><Glyph name="close" size={14} /></button> : null}</label>
}

function ViewButtons({ model, all = false }: { model: Model; all?: boolean }) {
  const views: { id: View; name: string; icon: string }[] = [
    ...(all ? [{ id: 'all' as View, name: '全部', icon: 'search' }] : []),
    { id: 'apps', name: '应用', icon: 'app' }, { id: 'files', name: '文件类型', icon: 'file' }, { id: 'urls', name: 'URL 协议', icon: 'link' },
  ]
  return <nav className="p-view-buttons" aria-label="浏览方式">{views.map(view => <button key={view.id} aria-pressed={model.view === view.id} className={model.view === view.id ? 'is-active' : ''} onClick={() => model.changeView(view.id)}><Glyph name={view.icon} size={16} /><span>{view.name}</span></button>)}</nav>
}

function Brand() {
  return <div className="p-product"><span className="p-mark"><Glyph name="mark" size={23} /></span><strong>Default Apps</strong><span className="p-scope">这台 Mac</span></div>
}

function CurrentApp({ model, item }: { model: Model; item: Association }) {
  const current = appById[model.defaults[item.id]]
  return <span className="p-current-app"><AppIcon app={current} size={23} /><span>{current?.name || '未设置'}</span></span>
}

function AppSummary({ model, heading = true }: { model: Model; heading?: boolean }) {
  const active = model.supported.filter(item => model.defaults[item.id] === model.selectedAppId).length
  return <header className="p-app-summary"><AppIcon app={model.selectedApp} size={64} /><div>{heading ? <h1>{model.selectedApp.name}</h1> : <h2>{model.selectedApp.name}</h2>}<p>{model.selectedApp.version}</p><p className="p-app-path" title={model.selectedApp.path}>{model.selectedApp.path}</p><p>{model.supported.length} 项声明支持 · {active} 项当前默认</p></div></header>
}

function AppList({ model }: { model: Model }) {
  return <div className="p-app-list">{model.visibleApps.length ? model.visibleApps.map(app => <button key={app.id} className={`p-app-row ${model.selectedAppId === app.id ? 'is-selected' : ''}`} onClick={() => model.setSelectedAppId(app.id)} aria-pressed={model.selectedAppId === app.id}><AppIcon app={app} size={34} /><span className="p-app-row-text"><strong>{app.name}</strong><small>{app.copy ? app.path : app.version}</small></span>{app.copy ? <span className="p-tiny-tag">副本</span> : null}</button>) : <Empty query={model.query} />}</div>
}

function Empty({ query }: { query: string }) {
  return <div className="p-empty"><strong>没有找到{query ? `“${query}”` : '关联项'}</strong><p>试试扩展名、应用名，或添加一个关联项。</p></div>
}

function SupportRows({ model }: { model: Model }) {
  return <div className="p-support-rows">{model.supported.length ? model.supported.map(item => {
    const isDefault = model.defaults[item.id] === model.selectedAppId
    const draft = model.drafts[item.id]
    return <div className="p-support-row" key={item.id}>
      <button className="p-association-name" onClick={() => model.openPicker(item)}><Glyph name={item.kind === 'file' ? 'file' : 'link'} size={20} /><span><strong>{item.name}</strong><small>{tagsFor(item)}</small></span></button>
      <div className="p-row-current"><CurrentApp model={model} item={item} />{draft ? <small className="p-pending-label">待改为 {appById[draft].name}</small> : isDefault ? <small className="p-default-label"><Glyph name="check" size={12} />当前默认</small> : <small>当前由其他应用打开</small>}</div>
      <button className="p-secondary p-set-app" disabled={model.busy || isDefault || draft === model.selectedAppId} onClick={() => model.pick(item, model.selectedAppId)}>{isDefault ? '已是默认' : draft === model.selectedAppId ? '已选择' : `设为${model.selectedApp.name}`}</button>
    </div>
  }) : <div className="p-empty"><strong>没有发现声明的关联项</strong><p>仍可从文件类型或协议视角选择这个应用。</p></div>}</div>
}

function AssociationInspector({ model }: { model: Model }) {
  const item = model.selected
  return <section className="p-inspector" aria-label={`${item.name}详情`}>
    <div className="p-inspector-title"><Glyph name={item.kind === 'file' ? 'file' : 'link'} size={27} /><h2>{item.name}</h2></div>
    <p className="p-tags">{tagsFor(item)}</p>
    <div className="p-inspector-current"><span className="p-label">当前默认应用</span><CurrentApp model={model} item={item} />{model.drafts[item.id] ? <p className="p-pending-label">待改为 {appById[model.drafts[item.id]].name}</p> : null}</div>
    {item.resolved ? <><h3>系统候选应用</h3><div className="p-inline-candidates">{item.candidates.map(id => <button key={id} onClick={() => model.pick(item, id)} disabled={model.busy} className={model.drafts[item.id] === id ? 'is-chosen' : ''}><AppIcon app={appById[id]} size={27} /><span>{appById[id].name}</span>{model.defaults[item.id] === id ? <Glyph name="check" size={15} /> : null}</button>)}</div><button className="p-text-button" onClick={() => model.openPicker(item)}>选择其他应用…</button></> : <><p>系统未能解析这个扩展名。</p><button className="p-secondary" onClick={() => model.setModal('identify')}>从文件识别…</button></>}
    {item.type ? <details className="p-type-details"><summary>类型信息</summary><code>{item.type}</code></details> : null}
  </section>
}

function VariantA({ model }: { model: Model }) {
  return <div className="p-variant-a">
    <header className="p-toolbar"><Brand /><ViewButtons model={model} /></header>
    <div className="p-a-body">
      <aside className="p-a-sidebar" aria-label="应用与关联目录"><SearchField model={model} label={model.view === 'apps' ? '搜索应用或支持的类型' : '搜索扩展名或协议'} /><div className="p-sidebar-caption">{model.view === 'apps' ? '已发现应用' : '关联项'}</div>{model.view === 'apps' ? <AppList model={model} /> : <div className="p-association-nav">{model.visibleItems.map(item => <button key={item.id} onClick={() => model.setSelectedId(item.id)} className={model.selected.id === item.id ? 'is-selected' : ''}><Glyph name={item.kind === 'file' ? 'file' : 'link'} /><span><strong>{item.name}</strong><small>{tagsFor(item)}</small></span></button>)}</div>}<button className="p-text-button p-add-link" onClick={() => model.setModal('add')}><Glyph name="plus" size={14} />添加关联项</button></aside>
      <main className="p-sheet p-a-detail">{model.view === 'apps' ? model.visibleApps.length ? <><AppSummary model={model} /><div className="p-section-heading"><h2>声明支持的关联</h2><span>默认状态单独读取</span></div><SupportRows model={model} /><div className="p-app-note"><p>选择应用支持的文件类型或协议，为它设置默认打开方式。</p><button className="p-text-button" onClick={() => { model.changeView('files'); model.setSelectedId('pdf') }}>查看文件类型<Glyph name="chevron" size={14} /></button></div></> : <><h1>应用</h1><Empty query={model.query} /></> : <><h1>默认打开方式</h1>{model.visibleItems.length ? <AssociationInspector model={model} /> : <Empty query={model.query} />}</>}</main>
    </div>
  </div>
}

function AssociationTable({ model }: { model: Model }) {
  return <div className="p-table-wrap"><table className="p-association-table"><thead><tr><th>文件类型或协议</th><th>当前默认应用</th><th><span className="p-sr-only">选择关联项</span></th></tr></thead><tbody>{model.visibleItems.map(item => <tr key={item.id} className={`${model.selected.id === item.id ? 'is-selected' : ''} ${model.drafts[item.id] ? 'has-draft' : ''}`}>
    <td><button className="p-table-identity" onClick={() => model.setSelectedId(item.id)}><Glyph name={item.kind === 'file' ? 'file' : 'link'} size={19} /><span><strong>{item.name}</strong><small>{tagsFor(item)}</small></span></button></td>
    <td><CurrentApp model={model} item={item} />{model.drafts[item.id] ? <small className="p-pending-label">待改为 {appById[model.drafts[item.id]].name}</small> : !item.resolved ? <small>类型未识别</small> : null}</td>
    <td><button className="p-icon-button" aria-label={`更改${item.name}的默认应用`} onClick={() => model.openPicker(item)}><Glyph name="chevron" size={15} /></button></td>
  </tr>)}</tbody></table>{!model.visibleItems.length ? <Empty query={model.query} /> : null}</div>
}

function VariantB({ model }: { model: Model }) {
  return <div className="p-variant-b"><header className="p-toolbar"><Brand /><button className="p-secondary" onClick={() => model.setModal('add')}><Glyph name="plus" size={15} />添加关联项</button></header><div className="p-b-body">
    <aside className="p-b-nav" aria-label="关联分类"><ViewButtons model={model} /><p>按当前默认应用<br />查看打开方式</p></aside>
    <main className="p-sheet p-b-main"><header className="p-title-row"><div><h1>{model.view === 'apps' ? '已发现应用' : model.view === 'urls' ? 'URL 协议' : '文件类型'}</h1><p>{model.view === 'apps' ? `${model.visibleApps.length} 个应用` : `${model.visibleItems.length} 个关联项`}</p></div><SearchField model={model} /></header>
      {model.view === 'apps' ? <div className="p-b-apps">{model.visibleApps.map(app => <button key={app.id} className="p-b-app-row" onClick={() => { model.setSelectedAppId(app.id); model.setModal('app') }}><AppIcon app={app} size={35} /><span><strong>{app.name}</strong><small>{app.path}</small></span><span className="p-b-app-version">{app.version}</span><Glyph name="chevron" size={15} /></button>)}{!model.visibleApps.length ? <Empty query={model.query} /> : null}</div> : <div className="p-b-workspace"><AssociationTable model={model} />{model.visibleItems.length ? <AssociationInspector model={model} /> : null}</div>}
    </main>
  </div></div>
}

function VariantC({ model }: { model: Model }) {
  const [expanded, setExpanded] = useState(false)
  const overview = model.view === 'all' && !model.query && !expanded
  const common = ['pdf', 'jpeg', 'text', 'http', 'mailto']
  const shownItems = model.view === 'apps' ? [] : overview ? model.visibleItems.filter(item => common.includes(item.id)) : model.visibleItems
  const shownApps = model.view === 'files' || model.view === 'urls' ? [] : overview ? model.visibleApps.slice(0, 3) : model.visibleApps
  return <div className="p-variant-c"><header className="p-toolbar"><Brand /><button className="p-text-button" onClick={() => model.setModal('add')}><Glyph name="plus" size={15} />添加关联</button></header><main className="p-c-main"><div className="p-c-search-block"><h1>默认打开方式</h1><SearchField model={model} /><ViewButtons model={model} all /></div><div className="p-c-results">
    {shownItems.length ? <section className="p-search-group"><h2>{model.query ? '匹配的关联' : overview ? '常用关联' : '关联项'}<span>{shownItems.length} 项{overview ? <button className="p-text-button" onClick={() => setExpanded(true)}>查看全部 {model.items.length} 项</button> : null}</span></h2>{shownItems.map(item => <button className="p-search-result" key={item.id} onClick={() => model.openPicker(item)}><Glyph name={item.kind === 'file' ? 'file' : 'link'} size={20} /><span className="p-search-result-name"><strong>{item.name}</strong><small>{tagsFor(item)}{item.id === 'jpeg-ppt' ? ' · 不同文件类型' : ''}</small></span><span className="p-search-result-default"><CurrentApp model={model} item={item} />{model.drafts[item.id] ? <small className="p-pending-label">待改为 {appById[model.drafts[item.id]].name}</small> : null}</span><Glyph name="chevron" size={16} /></button>)}</section> : null}
    {shownApps.length ? <section className="p-search-group"><h2>应用<span>{shownApps.length} 个{overview ? <button className="p-text-button" onClick={() => model.changeView('apps')}>查看全部 {apps.length} 个</button> : null}</span></h2>{shownApps.map(app => <button className="p-search-result" key={app.id} onClick={() => { model.setSelectedAppId(app.id); model.setModal('app') }}><AppIcon app={app} size={34} /><span className="p-search-result-name"><strong>{app.name}</strong><small>{app.path}</small></span><span className="p-search-app-version">{app.version}</span><Glyph name="chevron" size={16} /></button>)}</section> : null}
    {!shownItems.length && !shownApps.length ? <><Empty query={model.query} /><button className="p-secondary" onClick={() => model.setModal('add')}>添加这个关联项</button></> : null}
  </div></main></div>
}

function Modal({ title, children, onDismiss, wide = false }: { title: string; children: ReactNode; onDismiss: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className={`p-modal ${wide ? 'p-modal-wide' : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); onDismiss() }}><div className="p-modal-heading"><h2>{title}</h2><button className="p-icon-button" aria-label="关闭对话框" onClick={onDismiss}><Glyph name="close" /></button></div>{children}</dialog>
}

function Picker({ model }: { model: Model }) {
  const [manual, setManual] = useState(false)
  const [query, setQuery] = useState('')
  const item = model.selected
  const choices = (manual ? apps : item.candidates.map(id => appById[id])).filter(app => `${app.name} ${app.path}`.toLowerCase().includes(query.toLowerCase()))
  return <Modal title={`选择${item.name}的默认应用`} onDismiss={() => model.setModal(null)}>
    <p className="p-modal-subtitle">{tagsFor(item)}</p><div className="p-picker-current"><span>当前默认</span><CurrentApp model={model} item={item} /></div>
    {manual ? <label className="p-search"><Glyph name="search" size={16} /><input aria-label="搜索其他应用" placeholder="搜索其他应用" value={query} onChange={event => setQuery(event.target.value)} /></label> : <p className="p-label">系统候选应用</p>}
    <div className="p-picker-list">{choices.map(app => <button key={app.id} className="p-picker-row" onClick={() => model.pick(item, app.id)}><AppIcon app={app} size={34} /><span><strong>{app.name}</strong><small>{app.version} · {app.path}</small></span>{(model.drafts[item.id] || model.defaults[item.id]) === app.id ? <Glyph name="check" size={18} /> : manual && !item.declared.includes(app.id) ? <span className="p-tiny-tag">手动选择</span> : null}</button>)}{!choices.length ? <p className="p-empty-small">没有匹配的应用，可选择其他应用。</p> : null}</div>
    <button className="p-other-app" onClick={() => setManual(!manual)}>{manual ? '返回系统候选' : '选择其他应用…'}<Glyph name="chevron" size={15} /></button>
    <p className="p-picker-note">选择后加入待修改列表。</p>
  </Modal>
}

function AddAssociation({ model }: { model: Model }) {
  const [kind, setKind] = useState<'file' | 'url'>('file')
  const [value, setValue] = useState('')
  return <Modal title="添加关联项" onDismiss={() => model.setModal(null)}><form onSubmit={event => { event.preventDefault(); model.add(value, kind) }}><div className="p-kind-control"><button type="button" aria-pressed={kind === 'file'} onClick={() => setKind('file')}>文件扩展名</button><button type="button" aria-pressed={kind === 'url'} onClick={() => setKind('url')}>URL 协议</button></div><label className="p-form-field"><span>{kind === 'file' ? '扩展名' : '协议名称'}</span><input autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder={kind === 'file' ? '例如 pdf、jpg、custom' : '例如 mailto、myapp'} required aria-label={kind === 'file' ? '扩展名' : '协议名称'} /></label><p className="p-picker-note">未能解析的扩展名可以通过实际文件识别。</p><button type="submit" className="p-primary">查找并添加</button></form></Modal>
}

function PendingBar({ model }: { model: Model }) {
  return <footer className="p-status-bar"><span className="p-status-text" role="status">{model.busy ? '正在更新原型…' : model.notice || (model.pending ? `${model.pending} 项待修改` : `${model.items.length} 项关联 · 当前默认已读取`)}</span>{model.pending ? <button className="p-text-button" disabled={model.busy} onClick={() => model.setDrafts({})}>清除选择</button> : null}<button className="p-primary" onClick={model.apply} disabled={!model.pending || model.busy}>{model.busy ? '更新中…' : model.pending ? `应用 ${model.pending} 项修改` : '应用修改'}</button></footer>
}

function Switcher({ model }: { model: Model }) {
  const [stateOpen, setStateOpen] = useState(false)
  const state = { variant: model.variant, view: model.view, search: model.query, selectedApp: model.selectedAppId, selectedAssociation: model.selected.id, defaults: model.defaults, pendingChanges: model.drafts, associations: model.items, busy: model.busy, notice: model.notice }
  useEffect(() => { console.info('Default Apps prototype state', state) }, [model.variant])
  const cycle = (step: number) => { const keys: Variant[] = ['A', 'B', 'C']; model.changeVariant(keys[(keys.indexOf(model.variant) + step + 3) % 3]) }
  return <aside className="p-prototype-bar" aria-label="界面原型切换"><div className="p-prototype-notice">界面原型 · 示例数据</div><div className="p-switcher-controls"><button className="p-switch-arrow" aria-label="上一个方案" onClick={() => cycle(-1)}><Glyph name="left" /></button><div className="p-variant-title"><strong>{model.variant} · {variantNames[model.variant]}</strong><span>{variantDescriptions[model.variant]}</span></div><button className="p-switch-arrow" aria-label="下一个方案" onClick={() => cycle(1)}><Glyph name="chevron" /></button><span className="p-switcher-divider" /><button className="p-switcher-text" onClick={model.reset}>重置</button><button className="p-switcher-text" aria-expanded={stateOpen} onClick={() => setStateOpen(!stateOpen)}>状态</button></div>{stateOpen ? <pre className="p-state-dump">{JSON.stringify(state, null, 2)}</pre> : null}</aside>
}

export default function DefaultAppsPrototype() {
  const model = usePrototypeModel()
  return <div className="p-root"><div className={`p-window p-window-${model.variant}`}>{model.variant === 'A' ? <VariantA model={model} /> : model.variant === 'B' ? <VariantB model={model} /> : <VariantC model={model} />}<PendingBar model={model} /></div>
    {import.meta.env.DEV ? <Switcher model={model} /> : null}
    {model.modal === 'picker' ? <Picker model={model} /> : model.modal === 'app' ? <Modal title="应用关联" wide onDismiss={() => model.setModal(null)}><AppSummary model={model} heading={false} /><SupportRows model={model} /></Modal> : model.modal === 'add' ? <AddAssociation model={model} /> : model.modal === 'identify' ? <Modal title="通过文件识别类型" onDismiss={() => model.setModal(null)}><p className="p-modal-subtitle">原型提供以下示例文件，演示识别后的导航。</p><div className="p-picker-list"><button className="p-picker-row" onClick={() => model.identify('text')}><Glyph name="file" /><span><strong>文稿.txt</strong><small>识别为纯文本文档</small></span><Glyph name="chevron" /></button><button className="p-picker-row" onClick={() => model.identify('jpeg')}><Glyph name="file" /><span><strong>照片.jpg</strong><small>识别为 JPEG 图像</small></span><Glyph name="chevron" /></button><button className="p-picker-row" onClick={() => model.identify(null)}><Glyph name="file" /><span><strong>未知.custom</strong><small>无法识别，保持不可修改</small></span></button></div>{model.notice ? <p role="status">{model.notice}</p> : null}</Modal> : null}
  </div>
}
