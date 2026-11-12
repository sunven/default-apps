import { Tooltip } from '@astryxdesign/core/Tooltip'
import { Heading } from '@astryxdesign/core/Heading'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useRef, useState } from 'react'
import type { AppCopy, Association } from '../bindings/github.com/sunven/default-apps/internal/association/models'
import type { Entry } from '../bindings/github.com/sunven/default-apps/internal/catalog/models'
import { AddIdentifiedType, AddInput, GetStatus, IdentifyFile, PickApplication, ResolveInput } from '../bindings/github.com/sunven/default-apps/internal/manual/service'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { message } from './errors'
import { notify, dismissNotification } from './Notifications'

export function ManualActions({kind="type",onCatalogChanged,label,showStorageWarning=true}:{kind?:"type"|"application";onCatalogChanged?:()=>void;label?:string;showStorageWarning?:boolean}) {
 const [open,setOpen]=useState(false)
 const [storageError,setStorageError]=useState('')
 useEffect(()=>{let active=true;GetStatus().then(status=>{if(active)setStorageError(status.error)}).catch(error=>{if(active)setStorageError(message(error))});return ()=>{active=false}},[])
 return <><Button label={label ?? (kind==='application' ? '补充应用…' : '补充文件类型…')} icon={<Icon name="plus"/>} variant="ghost" onClick={()=>setOpen(true)}/>{storageError && showStorageWarning ? <Tooltip content={storageError} hasHoverIndication={false}><Text className="manual-storage-warning" role="alert">配置读取失败 · {storageError}</Text></Tooltip> : null}{open ? kind==='application' ? <ManualApplicationDialog onClose={()=>setOpen(false)} onCatalogChanged={onCatalogChanged} storageError={storageError}/> : <ManualTypeDialog onClose={()=>setOpen(false)} onCatalogChanged={onCatalogChanged} storageError={storageError}/> : null}</>
}
function ManualTypeDialog({onClose,onCatalogChanged,storageError}:{onClose:()=>void;onCatalogChanged?:()=>void;storageError:string}) {
 const [kind,setKind]=useState('extension')
 const [value,setValue]=useState('')
 const [entries,setEntries]=useState<Entry[]>([])
 const [selected,setSelected]=useState('')
 const [fileName,setFileName]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState(storageError)
 const revision=useRef(0)
 const invalidate=()=>{revision.current++;setEntries([]);setSelected('');setFileName('');setError(storageError)}
 const resolve=async()=>{
  const version=++revision.current;setBusy(true);setError('');setEntries([]);setSelected('');setFileName('')
  try {const result=await ResolveInput(kind,value);if(version===revision.current){const matches=result.entries??[];setEntries(matches);if(matches.length===1&&matches[0].resolved)setSelected(matches[0].id)}}catch(error){if(version===revision.current)setError(message(error))}finally{setBusy(false)}
 }
 const identify=async()=>{
  const version=++revision.current;setBusy(true);setError('')
  try {const result=await IdentifyFile();if(version===revision.current&&!result.cancelled){const matches=result.entries??[];setEntries(matches);setSelected(matches.length===1&&matches[0].resolved ? matches[0].id : '');setFileName(result.fileName)}}catch(error){setError(message(error))}finally{setBusy(false)}
 }
 const save=async()=>{
  const entry=entries.find(item=>item.id===selected);if(!entry)return
  setBusy(true);setError('')
  const id=notify('pending','正在保存手动关联…')
  try {const result=fileName ? await AddIdentifiedType(entry.association.key) : await AddInput(kind,value,selected);if(result.saved){notify('success','已保存手动关联',{id,description:entry.association.key});onCatalogChanged?.()}else dismissNotification(id)}catch(error){dismissNotification(id);setError(message(error))}finally{setBusy(false)}
 }
 return <Dialog title="补充文件类型" subtitle="通过扩展名、URL 协议或选择文件补充关联目录。" onClose={onClose}>
  <section className="manual-section" aria-label="补充关联"><Heading level={3}>添加文件类型或协议</Heading>
   <HStack gap={2} align="end" className="manual-input-row">
    <Selector label="输入种类" value={kind} isDisabled={busy} onChange={value=>{setKind(value);invalidate()}} options={[{value:'extension',label:'扩展名'},{value:'scheme',label:'URL 协议'}]} presentation="popover"/>
    <TextInput containerClassName="manual-value" label="扩展名或协议" autoComplete="off" hasAutoCorrect={false} autoCapitalize="none" hasSpellCheck={false} value={value} isDisabled={busy} onChange={value=>{setValue(value);invalidate()}} placeholder={kind==='extension'?'例如 jpg 或 .pdf':'例如 mailto'} onEnter={()=>{if(!busy&&value.trim())void resolve()}}/>
    <Button label="解析输入" isDisabled={busy||!value.trim()} onClick={()=>void resolve()}/>
   </HStack>
   <p className="manual-help">扩展名可能对应多个文件类型。协议仅输入名称，不输入完整网址。</p>
   {entries.length>1 ? <p>找到多个类型，请明确选择一个：</p> : null}
   <VStack gap={2} className="manual-matches">
    {entries.some(entry=>entry.resolved)?<RadioList label="解析出的文件类型" isLabelHidden value={selected} onChange={setSelected} isDisabled={busy} htmlName="manual-type">
     {entries.filter(entry=>entry.resolved).map(entry=><RadioListItem key={entry.id} value={entry.id} label={entry.name} aria-label={`${entry.name} ${entry.association.key}`} description={<VStack gap={1}><Text type="code">{entry.association.key}</Text>{entry.extensions?.length?<Text type="supporting">{entry.extensions.map(ext=>`.${ext}`).join(' · ')}</Text>:null}</VStack>}/>)}
    </RadioList>:null}
    {entries.filter(entry=>!entry.resolved).map(entry=><VStack gap={1} key={entry.id} className="manual-unresolved"><strong>未解析</strong><p>{entry.unresolvedReason}</p>{entry.diagnosticIdentifiers?.map(id=><Text type="code" key={id}>{id}</Text>)}</VStack>)}
   </VStack>
   {fileName ? <p className="manual-file">所选文件：<Text>{fileName}</Text></p> : null}
   <HStack gap={2} align="center" className="manual-buttons"><Button label="选择文件识别类型…" icon={<Icon name="folder"/>} variant="secondary" isDisabled={busy} onClick={()=>void identify()}/><Button label="保存手动关联" variant="primary" isDisabled={busy||!selected||!!storageError} onClick={()=>void save()}/></HStack>
   <p className="manual-help">文件仅用于识别整类类型；不会读取文件内容或改变该文件自己的默认应用。</p>
  </section>
  {error ? <p role="alert" className="manual-error">{error}</p> : null}
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
 const choose=async()=>{
  setBusy(true);setError('')
  const id=notify('pending','正在选择应用…')
  try{const result=await PickApplication();if(!result.cancelled&&result.saved&&result.app){setSelected(result.app);notify('success','已保存应用位置',{id,description:result.app.path});onSelected?.(result.app)}else dismissNotification(id)}catch(error){dismissNotification(id);setError(message(error))}finally{setBusy(false)}
 }
 return <VStack gap={0} className="manual-application"><Button label={busy?'正在选择…':association?'选择其他应用…':'添加应用位置…'} icon={<Icon name="plus"/>} variant="secondary" isDisabled={busy||disabled} onClick={()=>void choose()}/><p className="manual-help">{association ? '保存所选副本的位置。是否声明支持不代表系统能否接受它为默认应用。' : '选择 .app 应用包，将它加入应用列表。'}</p>{selected ? <VStack gap={0} className="manual-picked"><strong>所选应用 · {selected.name}</strong><Text>版本 {selected.version||'未知'} · {selected.bundleID||'无 bundle ID'}</Text><code>{selected.path}</code><Text>尚未提出修改默认应用的请求。</Text></VStack>:null}{error ? <p role="alert" className="manual-error">{error}</p>:null}</VStack>
}
