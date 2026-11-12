import { Heading } from '@astryxdesign/core/Heading'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Dialog as AstryxDialog } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Icon } from './Icon'
import { registerNotificationDialog } from './Notifications'

// Shared by association, copy and manual-entry dialogs. Mount only while open.
export function Dialog({ title, subtitle, onClose, children, fileDrop=false }: {title:string; subtitle?:string; onClose:()=>void; children:ReactNode; fileDrop?:boolean}) {
 const id=useId()
 const ref=useRef<HTMLDialogElement>(null)
 useLayoutEffect(()=>{
  const trigger=document.activeElement instanceof HTMLElement ? document.activeElement : null
  const dialog=ref.current!
  const unregisterNotifications=registerNotificationDialog(dialog)
  return ()=>{
   unregisterNotifications()
   // Astryx restores connected openers. A rescan can remove the original row.
   if(!trigger?.isConnected) document.querySelector<HTMLInputElement>('input[type="search"]')?.focus({preventScroll:true})
  }
 },[])
 return createPortal(<AstryxDialog ref={ref} isOpen onOpenChange={open=>{if(!open)onClose()}} purpose="form" padding={0} width="43.75rem" className="detail-dialog" data-file-identification={fileDrop?'true':undefined} aria-labelledby={id}>
  <HStack className="dialog-heading" gap={3} justify="between" align="start"><VStack gap={1}><Heading level={2} id={id} tabIndex={-1} data-autofocus="dialog-title">{title}</Heading>{subtitle ? <p>{subtitle}</p> : null}</VStack><IconButton className="dialog-close" label={`关闭${title}`} tooltip="关闭 · Esc" variant="ghost" onClick={onClose} icon={<Icon name="close"/>}/></HStack>
  <VStack gap={0} className="dialog-body">{children}</VStack>
 </AstryxDialog>,document.body)
}
