import { useEffect, useRef, useState } from 'react'
import type { AppCopy, Association } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import { AddIdentifiedType, AddInput, GetStatus, IdentifyFile, PickApplication, ResolveInput } from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { message } from './errors'
import { isComposing } from './keyboard'
import './manual.css'

export function ManualActions({kind="type",onCatalogChanged,label,showStorageWarning=true}:{kind?:"type"|"application";onCatalogChanged?:()=>void;label?:string;showStorageWarning?:boolean}) {
 const [open,setOpen]=useState(false)
 const [storageError,setStorageError]=useState('')
 useEffect(()=>{let active=true;GetStatus().then(status=>{if(active)setStorageError(status.error)}).catch(error=>{if(active)setStorageError(message(error))});return ()=>{active=false}},[])
 return <><button className="btn" onClick={()=>setOpen(true)}><Icon name="plus"/>{label ?? (kind==='application' ? '补充应用…' : '补充文件类型…')}</button>{storageError && showStorageWarning ? <span className="manual-storage-warning" role="alert" title={storageError}>配置读取失败 · {storageError}</span> : null}{open ? kind==='application' ? <ManualApplicationDialog onClose={()=>setOpen(false)} onCatalogChanged={onCatalogChanged} storageError={storageError}/> : <ManualTypeDialog onClose={()=>setOpen(false)} onCatalogChanged={onCatalogChanged} storageError={storageError}/> : null}</>
}
function ManualTypeDialog({onClose,onCatalogChanged,storageError}:{onClose:()=>void;onCatalogChanged?:()=>void;storageError:string}) {
 const [kind,setKind]=useState('extension')
 const [value,setValue]=useState('')
 const [entries,setEntries]=useState<Entry[]>([])
 const [selected,setSelected]=useState('')
 const [fileName,setFileName]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState(storageError)
 const [notice,setNotice]=useState('')
 const revision=useRef(0)
 const invalidate=()=>{revision.current++;setEntries([]);setSelected('');setFileName('');setNotice('');setError(storageError)}
 const resolve=async()=>{
  const version=++revision.current;setBusy(true);setError('');setNotice('');setEntries([]);setSelected('');setFileName('')
  try {const result=await ResolveInput(kind,value);if(version===revision.current){const matches=result.entries??[];setEntries(matches);if(matches.length===1&&matches[0].resolved)setSelected(matches[0].id)}}catch(error){if(version===revision.current)setError(message(error))}finally{setBusy(false)}
 }
 const identify=async()=>{
  const version=++revision.current;setBusy(true);setError('');setNotice('')
  try {const result=await IdentifyFile();if(version===revision.current&&!result.cancelled){const matches=result.entries??[];setEntries(matches);setSelected(matches.length===1&&matches[0].resolved ? matches[0].id : '');setFileName(result.fileName)}}catch(error){setError(message(error))}finally{setBusy(false)}
 }
 const save=async()=>{
  const entry=entries.find(item=>item.id===selected);if(!entry)return
  setBusy(true);setError('');setNotice('')
  try {const result=fileName ? await AddIdentifiedType(entry.association.key) : await AddInput(kind,value,selected);if(result.saved){setNotice('已保存手动关联');onCatalogChanged?.()}}catch(error){setError(message(error))}finally{setBusy(false)}
 }
 return <Dialog title="补充文件类型" subtitle="通过扩展名、URL 协议或选择文件补充关联目录。" onClose={onClose}>
  <section className="manual-section" aria-label="补充关联"><h3>添加文件类型或协议</h3>
   <div className="manual-input-row"><label>输入种类<select value={kind} disabled={busy} onChange={event=>{setKind(event.target.value);invalidate()}}><option value="extension">扩展名</option><option value="scheme">URL 协议</option></select></label><label className="manual-value">扩展名或协议<input autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={value} disabled={busy} onChange={event=>{setValue(event.target.value);invalidate()}} placeholder={kind==='extension'?'例如 jpg 或 .pdf':'例如 mailto'} onKeyDown={event=>{if(event.key==='Enter'&&!isComposing(event)){event.preventDefault();void resolve()}}}/></label><button className="btn" disabled={busy||!value.trim()} onClick={()=>void resolve()}>解析输入</button></div>
   <p className="manual-help">扩展名可能对应多个文件类型。协议仅输入名称，不输入完整网址。</p>
   {entries.length>1 ? <p>找到多个类型，请明确选择一个：</p> : null}
   <div className="manual-matches">{entries.map(entry=>entry.resolved ? <label key={entry.id} className="manual-match"><input type="radio" aria-label={`${entry.name} ${entry.association.key}`} name="manual-type" value={entry.id} checked={selected===entry.id} onChange={()=>setSelected(entry.id)} disabled={busy}/><span><strong>{entry.name}</strong><code>{entry.association.key}</code>{(entry.extensions??[]).length>0 ? <small>{(entry.extensions??[]).map(ext=>`.${ext}`).join(' · ')}</small>:null}</span></label> : <div key={entry.id} className="manual-unresolved"><strong>未解析</strong><p>{entry.unresolvedReason}</p>{(entry.diagnosticIdentifiers??[]).map(id=><code key={id}>{id}</code>)}</div>)}</div>
   {fileName ? <p className="manual-file">所选文件：<span>{fileName}</span></p> : null}
   <div className="manual-buttons"><button className="btn" disabled={busy} onClick={()=>void identify()}><Icon name="folder"/>选择文件识别类型…</button><button className="btn btn--primary" disabled={busy||!selected||!!storageError} onClick={()=>void save()}>保存手动关联</button></div>
   <p className="manual-help">文件仅用于识别整类类型；不会读取文件内容或改变该文件自己的默认应用。</p>
  </section>
  {busy ? <p role="status">正在处理…</p> : null}{notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className="manual-error">{error}</p> : null}
 </Dialog>
}
function ManualApplicationDialog({onClose,onCatalogChanged,storageError}:{onClose:()=>void;onCatalogChanged?:()=>void;storageError:string}) {
 return <Dialog title="补充应用" subtitle="将其他位置的应用加入列表，供后续选择。" onClose={onClose}>
  <ManualApplicationAction onSelected={()=>onCatalogChanged?.()} disabled={!!storageError}/>
  {storageError ? <p role="alert" className="manual-error">{storageError}</p> : null}
 </Dialog>
}
export function ManualApplicationAction({association,onSelected,disabled=false}:{association?:Association;onSelected?:(app:AppCopy)=>void;disabled?:boolean}) {
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [selected,setSelected]=useState<AppCopy|null>(null)
 useEffect(()=>{setSelected(null);setError('')},[association?.kind,association?.key])
 const choose=async()=>{setBusy(true);setError('');try{const result=await PickApplication();if(!result.cancelled&&result.saved&&result.app){setSelected(result.app);onSelected?.(result.app)}}catch(error){setError(message(error))}finally{setBusy(false)}}
 return <div className="manual-application"><button className="btn" disabled={busy||disabled} onClick={()=>void choose()}><Icon name="plus"/>{busy?'正在选择…':association?'选择其他应用…':'添加应用位置…'}</button><p className="manual-help">{association ? '保存所选副本的位置。是否声明支持不代表系统能否接受它为默认应用。' : '选择 .app 应用包，将它加入应用列表。'}</p>{selected ? <div role="status" className="manual-picked"><strong>已保存应用位置 · {selected.name}</strong><span>版本 {selected.version||'未知'} · {selected.bundleID||'无 bundle ID'}</span><code>{selected.path}</code><span>尚未提出修改默认应用的请求。</span></div>:null}{error ? <p role="alert" className="manual-error">{error}</p>:null}</div>
}
