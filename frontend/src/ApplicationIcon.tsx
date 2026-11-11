import { useState } from 'react'
import type { AppCopy } from '../bindings/github.com/sunven/default-apps/internal/association/models'

export function ApplicationIcon({ app, className='' }: { app: AppCopy; className?: string }) {
 const [failedData,setFailedData] = useState<string>()
 const fallback = (app.name || app.path.split('/').pop() || '?').trim().slice(0, 1).toLocaleUpperCase()
 const source = app.iconData && app.iconData!==failedData ? app.iconData : undefined
 return <span className={`application-icon ${className}`} data-fallback={!source} aria-hidden="true">
  {source ? <img src={`data:image/png;base64,${source}`} alt="" onError={()=>setFailedData(source)}/> : <span>{fallback}</span>}
 </span>
}
