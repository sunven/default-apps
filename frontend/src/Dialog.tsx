import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Shared by association, copy and manual-entry dialogs. Mount only while open.
export function Dialog({ title, subtitle, onClose, children }: {title:string; subtitle?:string; onClose:()=>void; children:ReactNode}) {
 const id=useId()
 const ref=useRef<HTMLDialogElement>(null)
 useLayoutEffect(()=>{
  const trigger=document.activeElement instanceof HTMLElement ? document.activeElement : null
  const dialog=ref.current!
  dialog.showModal()
  dialog.querySelector<HTMLButtonElement>('[data-dialog-close]')?.focus()
  return ()=>{
   dialog.close()
   if(trigger?.isConnected) trigger.focus({preventScroll:true})
   else document.querySelector<HTMLInputElement>('input[type="search"]')?.focus({preventScroll:true})
  }
 },[])
 return createPortal(<dialog ref={ref} className="detail-dialog" aria-labelledby={id} onCancel={event=>{event.preventDefault();onClose()}} onKeyDown={event=>{
  if(event.nativeEvent.isComposing || event.keyCode===229)return
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}
  if(event.key==='Tab'){
   const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(el=>!el.closest('[hidden]'))
   const first=controls[0],last=controls[controls.length-1]
   if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
  }
 }}>
  <div className="dialog-heading"><div><h2 id={id}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button data-dialog-close onClick={onClose} aria-label={`关闭${title}`}>关闭</button></div>
  <div className="dialog-body">{children}</div>
 </dialog>,document.body)
}
