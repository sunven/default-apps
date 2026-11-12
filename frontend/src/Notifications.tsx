import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Toaster, toast, type ExternalToast } from 'sonner'
import './notifications.css'

export type NotificationTone = 'pending' | 'success' | 'warning' | 'error' | 'info'
type NotificationID = string | number
const notifications = new Map<NotificationID,{toastID:NotificationID;closed:boolean}>()

export function isNotificationVisible(id:NotificationID) {
 const record=notifications.get(id)
 return !!record&&!record.closed&&toast.getToasts().some(item=>item.id===record.toastID)
}

export function notify(tone: NotificationTone, title: string, options: ExternalToast = {}) {
 const id=options.id??crypto.randomUUID()
 const previous=notifications.get(id)
 // A dismissed toast may still be animating out. A new result needs a new DOM
 // identity so that the old toast's removal timer cannot remove that result.
 const record={toastID:previous&&!isNotificationVisible(id)?`${id}:${crypto.randomUUID()}`:previous?.toastID??id,closed:false}
 notifications.set(id,record)
 const close=()=>{if(notifications.get(id)===record)record.closed=true}
 // Sonner's loading type hides its close button. An info toast with a spinner
 // keeps progress dismissible without implying that closing cancels the work.
 toast[tone === 'pending' ? 'info' : tone](title, {
  description: undefined, action: undefined, cancel: undefined,
  icon: tone === 'pending' ? <span className="notification-spinner" aria-hidden="true"/> : undefined,
  duration: tone === 'success' ? 4000 : Infinity,
  closeButton: true, dismissible: true,
  ...options,
  id:record.toastID,
  onDismiss:value=>{close();options.onDismiss?.(value)},
  onAutoClose:value=>{close();options.onAutoClose?.(value)},
 })
 return id
}
export function dismissNotification(id?:NotificationID) {
 if(id===undefined){for(const record of notifications.values())record.closed=true;toast.dismiss();return}
 const record=notifications.get(id)
 if(record)record.closed=true
 toast.dismiss(record?.toastID??id)
}

// Move one stable portal container into the native top layer. Remounting a
// Toaster would lose its subscriptions, timers and focused action buttons.
const dialogs: HTMLDialogElement[] = []
let container: HTMLDivElement | null = null
function placeContainer() {
 const parent = dialogs[dialogs.length - 1] ?? document.body
 if (container && container.parentElement !== parent) parent.append(container)
}
export function registerNotificationDialog(dialog: HTMLDialogElement) {
 dialogs.push(dialog)
 placeContainer()
 return () => {
  const index = dialogs.indexOf(dialog)
  if (index !== -1) dialogs.splice(index, 1)
  placeContainer()
 }
}

export function NotificationHost() {
 const [element] = useState(() => document.createElement('div'))
 useLayoutEffect(() => {
  container = element
  element.className = 'notification-host'
  placeContainer()
  return () => { if (container === element) container = null; element.remove() }
 }, [element])
 return createPortal(<Toaster position="top-right" theme="system" richColors closeButton expand
  offset={20} mobileOffset={16} visibleToasts={3} containerAriaLabel="操作通知"
  toastOptions={{ closeButtonAriaLabel: '关闭通知' }}/>, element)
}
