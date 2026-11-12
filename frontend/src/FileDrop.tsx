import {useEffect,useMemo,useRef,useState} from 'react'
import {HStack} from '@astryxdesign/core/HStack'
import {Events} from '@wailsio/runtime'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {IdentifiedFile} from '../bindings/github.com/sunven/default-apps/internal/manual/models'
import {IdentifyFiles,AddIdentifiedType} from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import {Query} from '../bindings/github.com/sunven/default-apps/internal/change/service'
import type {BatchController} from './Batch'
import {Dialog} from './Dialog'
import {notify} from './Notifications'
import {message} from './errors'
import {isTrustworthy} from './useAssociationQueries'
import './file-drop.css'

type FileChoice=IdentifiedFile&{choice:string}
type Group={entry:Entry;files:FileChoice[]}

export function FileDrop({controller:c}:{controller:BatchController}){
 const [files,setFiles]=useState<FileChoice[]>([])
 const [excluded,setExcluded]=useState<Set<string>>(()=>new Set())
 const [defaults,setDefaults]=useState<Record<string,string>>({})
 const [saved,setSaved]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [queryVersion,setQueryVersion]=useState(0)
 const current=useRef(c);current.current=c
 const generation=useRef(0),activity=useRef(''),mounted=useRef(true)
 const groups=useMemo(()=>{
  const result=new Map<string,Group>()
  for(const file of files){
   const entry=file.entries?.find(entry=>entry.resolved&&entry.id===file.choice)
   if(!entry)continue
   const group=result.get(entry.id)
   if(group)group.files.push(file);else result.set(entry.id,{entry,files:[file]})
  }
  return Array.from(result.values())
 },[files])
 const entries=useMemo(()=>groups.map(group=>group.entry),[groups])
 const included=entries.filter(entry=>!excluded.has(entry.id))
 const draftOpen=c.modal==='files'||(c.workflow.source==='files'&&(c.modal==='choose'||c.modal==='preview'))
 useEffect(()=>{
  if(draftOpen)return
  ++generation.current;activity.current='';setBusy('');setFiles([]);setExcluded(new Set());setSaved({});setError('')
 },[draftOpen])
 useEffect(()=>{
  if(c.modal!=='files')return
  let active=true,cursor=0
  setDefaults({})
  const worker=async()=>{
   while(active&&cursor<entries.length){
    const entry=entries[cursor++]
    let text:string
    try{const result=await Query(entry.association);text=!result.superseded&&isTrustworthy(result.default)?result.default.app?.name||result.default.app?.path||'无默认应用':'查询失败，预览前需重新检查'}
    catch{ text='查询失败，预览前需重新检查' }
    if(active)setDefaults(previous=>({...previous,[entry.id]:text}))
   }
  }
  void Promise.all(Array.from({length:Math.min(4,entries.length)},worker))
  return()=>{active=false}
 },[entries,c.modal,queryVersion])
 useEffect(()=>{
  mounted.current=true
  // Native macOS drops hit-test this attribute, including portal dialogs.
  const previous=document.body.getAttribute('data-file-drop-target')
  document.body.setAttribute('data-file-drop-target','')
  const blockedReason=()=>{
   const controller=current.current,state=controller.changes.state
   if(!state)return '正在读取设置状态，请稍后再拖入。'
   if(state.busy||controller.changes.sending||controller.changes.pending||controller.pending||['running','waiting'].includes(state.batch?.state??''))return '请先处理当前设置，再拖入文件；本次文件未加入队列。'
   if(state.quit?.prompt||state.quit?.exiting||state.quit?.restarting)return '请先处理当前退出或重启操作。'
   if(activity.current)return `${activity.current}，请完成后再拖入文件。`
   if(controller.working||(controller.modal&&controller.modal!=='files')||Array.from(document.querySelectorAll('dialog[open]')).some(dialog=>!dialog.hasAttribute('data-file-identification')))return '请先关闭当前面板，或返回识别清单后再拖入文件。'
   return ''
  }
  const off=Events.On('defaultapps:files-dropped',async event=>{
   const reason=blockedReason()
   if(reason){notify('warning',reason);return}
   const paths=event.data
   if(!Array.isArray(paths)||!paths.length){notify('warning','只支持拖入本机普通文件。');return}
   const version=++generation.current
   activity.current='正在识别';setBusy('正在识别');setError('');current.current.setModal('files')
   try{
    const result=await IdentifyFiles(paths)
    if(!mounted.current||version!==generation.current)return
    setFiles(previous=>{
     const byPath=new Map(previous.map(file=>[file.path,file]))
     for(const file of result??[]){
      if(byPath.has(file.path)&&!byPath.get(file.path)?.error)continue
      const matches=(file.entries??[]).filter(entry=>entry.resolved)
      byPath.set(file.path,{...file,choice:matches.length===1?matches[0].id:''})
     }
     return Array.from(byPath.values())
    })
   }catch(error){if(mounted.current&&version===generation.current)setError(`文件识别失败：${message(error)}。请重新拖入。`)}
   finally{if(mounted.current&&version===generation.current){activity.current='';setBusy('')}}
  })
  const preventNavigation=(event:DragEvent)=>{
   event.preventDefault()
   if(event.type==='drop'&&!event.dataTransfer?.types.includes('Files'))notify('warning','只支持普通文件，不支持文字或链接。')
  }
  document.addEventListener('dragover',preventNavigation)
  document.addEventListener('drop',preventNavigation)
  return()=>{
   mounted.current=false;++generation.current;off()
   if(previous===null)document.body.removeAttribute('data-file-drop-target');else document.body.setAttribute('data-file-drop-target',previous)
   document.body.classList.remove('file-drop-target-active')
   document.removeEventListener('dragover',preventNavigation);document.removeEventListener('drop',preventNavigation)
  }
 },[])
 const save=async(entry:Entry)=>{
  if(activity.current)return
  const version=generation.current
  activity.current='正在保存手动关联';setBusy(activity.current)
  try{
   const result=await AddIdentifiedType(entry.association.key)
   if(mounted.current&&version===generation.current)setSaved(previous=>({...previous,[entry.id]:result.saved?'已保存手动关联':'未保存，可继续设置'}))
  }catch(error){if(mounted.current&&version===generation.current)setSaved(previous=>({...previous,[entry.id]:`保存失败：${message(error)}。可继续设置。`}))}
  finally{if(mounted.current&&version===generation.current){activity.current='';setBusy('')}}
 }
 const close=()=>{++generation.current;activity.current='';setBusy('');c.close()}
 return <>
  <HStack as="footer" className="file-drop-hint" gap={3} justify="center"><p>拖入文件，设置同类文件的默认应用</p><small>支持多个普通文件</small></HStack>
  <div className="file-drop-overlay" aria-hidden="true"><strong>松开以识别文件类型</strong><span>先查看清单，再选择默认应用</span></div>
  {c.modal==='files'?<Dialog title="拖入文件识别清单" subtitle="设置将影响这些类型的所有同类文件。可继续拖入文件追加。" onClose={close} fileDrop>
   <div className="file-drop-summary"><strong>{included.length} 个类型 · {files.length} 个文件</strong><button className="btn" disabled={!!busy||!entries.length} onClick={()=>setQueryVersion(value=>value+1)}>重新查询默认</button></div>
   {busy?<p role="status" className="batch-muted">{busy}…</p>:null}
   {error?<p role="alert" className="batch-error">{error}</p>:null}
   <ul className="file-drop-types" aria-label="识别出的文件类型">{groups.map(({entry,files})=><li key={entry.id} data-excluded={excluded.has(entry.id)}>
    <div className="file-drop-type-heading"><div><strong>{entry.name||entry.association.key}</strong><small>{entry.association.key}{entry.extensions?.length?` · ${entry.extensions.map(ext=>`.${ext}`).join(' · ')}`:''}</small></div><button className="btn" disabled={!!busy} aria-label={`${excluded.has(entry.id)?'恢复':'移除'} ${entry.name||entry.association.key}`} onClick={()=>setExcluded(previous=>{const next=new Set(previous);if(next.has(entry.id))next.delete(entry.id);else next.add(entry.id);return next})}>{excluded.has(entry.id)?'恢复':'移除'}</button></div>
    <p className="file-drop-default">{excluded.has(entry.id)?'本次不设置':'当前默认：'+(defaults[entry.id]??'正在查询…')}</p>
    <ul className="file-drop-paths">{files.map(file=><li key={file.path}><span>{file.name}</span><small>{file.path}</small>{(file.entries??[]).filter(entry=>entry.resolved).length>1?<label className="file-drop-choice">实际类型<select aria-label={`文件类型 ${file.name}`} value={file.choice} disabled={!!busy} onChange={event=>{const choice=event.target.value;setFiles(previous=>previous.map(item=>item.path===file.path?{...item,choice}:item))}}>{(file.entries??[]).filter(entry=>entry.resolved).map(entry=><option key={entry.id} value={entry.id}>{entry.name||entry.association.key} · {entry.association.key}</option>)}</select></label>:null}</li>)}</ul>
    <div className="file-drop-save"><button className="btn" disabled={!!busy||saved[entry.id]==='已保存手动关联'} onClick={()=>void save(entry)}>保存为手动关联</button>{saved[entry.id]?<span role="status">{saved[entry.id]}</span>:null}</div>
   </li>)}</ul>
   {files.some(file=>!file.choice)?<section className="file-drop-problems" aria-label="未确定的文件"><h3>未参与设置的文件</h3>{files.filter(file=>!file.choice).map(file=>{
    const matches=(file.entries??[]).filter(entry=>entry.resolved)
    return <div key={file.path}><strong>{file.name}</strong><small>{file.path}</small>{matches.length>1?<fieldset disabled={!!busy}><legend>请选择该文件的实际类型</legend>{matches.map(entry=><label key={entry.id}><input type="radio" name={file.path} onChange={()=>setFiles(previous=>previous.map(item=>item.path===file.path?{...item,choice:entry.id}:item))}/>{entry.name||entry.association.key} · {entry.association.key}</label>)}</fieldset>:<p>{file.error||'无法确定文件类型，请检查文件后重新拖入。'}</p>}</div>
   })}</section>:null}
   <p className="batch-muted">识别结果仅用于本次设置，不自动保存文件路径或手动关联。主动保存的手动关联会保留。</p>
   <div className="batch-dialog-actions"><button className="btn" onClick={close}>取消</button><button className="btn btn--primary" disabled={!!busy||!included.length||c.reviewBlocked||!c.changes.state?.writableKinds?.includes('file')} onClick={()=>c.chooseFiles(included)}>为 {included.length} 个类型选择应用…</button></div>
  </Dialog>:null}
 </>
}
