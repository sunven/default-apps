import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import {useEffect,useMemo} from 'react'
import {Events} from '@wailsio/runtime'
import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import type {BatchController} from './useBatchSettings'
import type {BatchPanel} from './batchWorkflow'
import {Dialog} from './Dialog'
import {notify} from './Notifications'
import {useQueryObservations} from './QueryObservations'

export function FileDrop({controller:c}:{controller:BatchController}){
 const receiveFiles=c.receiveFiles
 useEffect(()=>{
  // Native macOS drops hit-test this attribute, including portal dialogs.
  const previous=document.body.getAttribute('data-file-drop-target')
  document.body.setAttribute('data-file-drop-target','')
  const off=Events.On('defaultapps:files-dropped',async event=>{
   const otherDialog=Array.from(document.querySelectorAll('dialog[open]')).some(dialog=>!dialog.hasAttribute('data-file-identification'))
   const reason=await receiveFiles(event.data,otherDialog)
   if(reason)notify('warning',reason)
  })
  const preventNavigation=(event:DragEvent)=>{
   event.preventDefault()
   if(event.type==='drop'&&!event.dataTransfer?.types.includes('Files'))notify('warning','只支持普通文件，不支持文字或链接。')
  }
  document.addEventListener('dragover',preventNavigation)
  document.addEventListener('drop',preventNavigation)
  return()=>{
   off()
   if(previous===null)document.body.removeAttribute('data-file-drop-target');else document.body.setAttribute('data-file-drop-target',previous)
   document.body.classList.remove('file-drop-target-active')
   document.removeEventListener('dragover',preventNavigation);document.removeEventListener('drop',preventNavigation)
  }
 },[receiveFiles])
 return <>
  <HStack as="footer" className="file-drop-hint" gap={3} justify="center"><p>拖入文件，设置同类文件的默认应用</p><small>支持多个普通文件</small></HStack>
  <VStack gap={0} className="file-drop-overlay" aria-hidden="true"><strong>松开以识别文件类型</strong><Text>先查看清单，再选择默认应用</Text></VStack>
  {c.panel.kind==='files'?<FileIdentification controller={c} panel={c.panel}/>:null}
 </>
}

function FileIdentification({controller:c,panel}:{controller:BatchController;panel:Extract<BatchPanel,{kind:'files'}>}){
 const {files,groups,excluded,saved}=panel.draft
 const entries=useMemo(()=>groups.map(group=>group.entry),[groups])
 const included=entries.filter(entry=>!excluded.has(entry.id))
 const defaults=useQueryObservations(entries.map(entry=>entry.association))
 const busy=c.activityLabel,error=c.error
 const defaultLabel=(entry:Entry)=>{
  const result=defaults.observations[entry.id]?.default
  const failed=!!defaults.rowErrors[entry.id]||!!result?.error||!!result?.stale
  if(!result?.known)return failed?'查询失败，预览前需重新检查':'正在查询…'
  const name=result.app?.name||result.app?.path||'无默认应用'
  if(failed)return `${name}（上次查询结果 · 刷新失败，预览前需重新检查）`
  return defaults.pending[entry.id]?`${name}（上次查询结果 · 正在刷新…）`:name
 }
 return <Dialog title="拖入文件识别清单" subtitle="设置将影响这些类型的所有同类文件。可继续拖入文件追加。" onClose={c.close} fileDrop>
   <HStack gap={2} align="center" className="file-drop-summary"><strong>{included.length} 个类型 · {files.length} 个文件</strong><Button label="重新查询默认" variant="secondary" isDisabled={!!busy||!entries.length} onClick={()=>void defaults.refresh()}/></HStack>
   {busy?<p role="status" aria-label="文件识别状态" className="batch-muted">{busy}…</p>:null}
   {error?<p role="alert" className="batch-error">{error}</p>:null}
   <ul className="file-drop-types" aria-label="识别出的文件类型">{groups.map(({entry,files})=><li key={entry.id} data-excluded={excluded.has(entry.id)}>
    <HStack gap={2} align="center" className="file-drop-type-heading"><VStack gap={0}><strong>{entry.name||entry.association.key}</strong><small>{entry.association.key}{entry.extensions?.length?` · ${entry.extensions.map(ext=>`.${ext}`).join(' · ')}`:''}</small></VStack><Button label={`${excluded.has(entry.id)?'恢复':'移除'} ${entry.name||entry.association.key}`} variant="secondary" isDisabled={!c.can.editFiles}  onClick={()=>c.toggleFileType(entry.id)}>{excluded.has(entry.id)?'恢复':'移除'}</Button></HStack>
    <p className="file-drop-default">{excluded.has(entry.id)?'本次不设置':'当前默认：'+defaultLabel(entry)}</p>
    <ul className="file-drop-paths">{files.map(file=><li key={file.path}><Text>{file.name}</Text><small>{file.path}</small>{(file.entries??[]).filter(entry=>entry.resolved).length>1?<Selector containerClassName="file-drop-choice" label="实际类型" aria-label={`文件类型 ${file.name}`} value={file.choice} isDisabled={!c.can.editFiles} onChange={choice=>c.chooseFileType(file.path,choice)} options={(file.entries??[]).filter(entry=>entry.resolved).map(entry=>({value:entry.id,label:`${entry.name||entry.association.key} · ${entry.association.key}`}))} presentation="popover"/>:null}</li>)}</ul>
    <HStack gap={2} align="center" className="file-drop-save"><Button label="保存为手动关联" variant="secondary" isDisabled={!c.can.editFiles||saved[entry.id]==='已保存手动关联'} onClick={()=>void c.saveFileType(entry.id)}/>{saved[entry.id]?<Text role="status">{saved[entry.id]}</Text>:null}</HStack>
   </li>)}</ul>
   {files.some(file=>!file.choice)?<section className="file-drop-problems" aria-label="未确定的文件"><Heading level={3}>未参与设置的文件</Heading>{files.filter(file=>!file.choice).map(file=>{
    const matches=(file.entries??[]).filter(entry=>entry.resolved)
    return <VStack gap={0} key={file.path}><strong>{file.name}</strong><small>{file.path}</small>{matches.length>1?<RadioList label="请选择该文件的实际类型" htmlName={file.path} value={file.choice} isDisabled={!c.can.editFiles} onChange={choice=>c.chooseFileType(file.path,choice)}>{matches.map(entry=><RadioListItem key={entry.id} value={entry.id} label={`${entry.name||entry.association.key} · ${entry.association.key}`}/>)}</RadioList>:<p>{file.error||'无法确定文件类型，请检查文件后重新拖入。'}</p>}</VStack>
   })}</section>:null}
   <p className="batch-muted">识别结果仅用于本次设置，不自动保存文件路径或手动关联。主动保存的手动关联会保留。</p>
   <HStack gap={2} align="center" className="batch-dialog-actions"><Button label="取消" variant="secondary" onClick={c.close}/><Button label={`为 ${included.length} 个类型选择应用…`} variant="primary" isDisabled={!c.can.chooseFiles} onClick={c.chooseFiles}>为 {included.length} 个类型选择应用…</Button></HStack>
 </Dialog>
}
