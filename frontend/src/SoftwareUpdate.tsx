import {useCallback, useEffect, useRef, useState} from 'react'
import {Browser, Events} from '@wailsio/runtime'
import {Check, Download, GetSnapshot, Restart} from '../bindings/github.com/sunven/default-apps/internal/appupdate/service'
import type {Snapshot} from '../bindings/github.com/sunven/default-apps/internal/appupdate/models'
import {Dialog} from './Dialog'
import {dismissNotification, notify} from './Notifications'
import './updates.css'

const busyPhases = new Set(['checking', 'downloading', 'verifying', 'staging', 'restarting'])
const phaseLabels: Record<string,string> = {
 idle:'启动后自动检查更新', checking:'正在检查更新…', current:'当前已是最新版本',
 available:'有新版本可用', downloading:'正在下载更新…', verifying:'正在校验下载内容…',
 staging:'正在准备安装…', ready:'更新已准备好', restarting:'正在准备重启安装…',
}

// Progress stays in this small subtree instead of rerendering the browser lists.
export function SoftwareUpdate() {
 const [state,setState] = useState<Snapshot|null>(null)
 const [open,setOpen] = useState(false)
 const [confirm,setConfirm] = useState(false)
 const [error,setError] = useState('')
 const [sending,setSending] = useState(false)
 const mounted = useRef(true), version = useRef(-1), inFlight = useRef(false)
 const announced = useRef(new Set<string>())
 const accept = useCallback((value:Snapshot) => {
  if (!mounted.current || value.version <= version.current) return
  version.current = value.version
  setState(value)
 },[])
 useEffect(() => {
  mounted.current = true
  const off = Events.On('defaultapps:update', event => accept(event.data))
  void Promise.resolve().then(() => GetSnapshot()).then(accept).catch(value => {
   if(mounted.current) setError(`无法读取更新状态：${String(value)}`)
  })
  return () => { mounted.current = false; off() }
 },[accept])
 const show = useCallback(() => { setOpen(true);setConfirm(false);dismissNotification('app:update') },[])
 useEffect(() => {
  if(!state?.error || open) return
  const key=`error:${state.error}`
  if(announced.current.has(key)) return
  announced.current.add(key)
  notify('error',state.error,{id:'app:update',action:{label:'查看更新',onClick:show}})
 },[state?.error,open,show])
 useEffect(() => {
  if(!state?.release || !['available','ready'].includes(state.phase)) return
  const key = `${state.release.version}:${state.phase}`
  if(announced.current.has(key)) return
  announced.current.add(key)
  if(!open) notify('info',state.phase==='ready'?'更新已准备好':`发现新版本 ${state.release.version}`,{
   id:'app:update',description:state.phase==='ready'?'可以继续使用，方便时再重启安装。':`Default Apps ${state.currentVersion} → ${state.release.version}`,
   action:{label:'查看更新',onClick:show},
  })
 },[state?.phase,state?.release?.version,state?.currentVersion,open,show])
 const run = async (operation:()=>PromiseLike<Snapshot>,close=false) => {
  if(inFlight.current) return
  inFlight.current=true;setSending(true);setError('')
  try { const value=await operation();accept(value);if(mounted.current&&close){setOpen(false);setConfirm(false)} }
  catch(value){if(mounted.current)setError(String(value))}
  finally{inFlight.current=false;if(mounted.current)setSending(false)}
 }
 const close = () => {setOpen(false);setConfirm(false)}
 const busy = sending || !!state&&busyPhases.has(state.phase)
 const downloading = state?.phase==='downloading'
 const hasTotal = !!state&&state.total>0
 const percent = state&&hasTotal?Math.min(100,Math.max(0,Math.floor(state.written/state.total*100))):undefined
 return <>
  <button className="btn software-update-entry" aria-label="软件更新" title={state?.release?'软件更新 · 有可用更新':'软件更新'} onClick={show} data-available={!!state?.release}>
   软件更新{state?.release?<span className="update-dot" aria-hidden="true"/>:null}
  </button>
  {open?<Dialog title="软件更新" subtitle={`Default Apps${state?` · 当前版本 ${state.currentVersion}`:''}`} onClose={close}>
   <section className="software-update" aria-label="本工具更新">
    {state?.disabledReason?<p>{state.disabledReason}</p>:<>
     <div className="update-summary" role="status" aria-live="polite">
      <strong>{state?phaseLabels[state.phase]??'检查未完成':'正在读取更新状态…'}</strong>
      {state?.release?<span>版本 {state.release.version}</span>:null}
     </div>
     {downloading?<div className="update-progress">
      <progress aria-label="更新下载进度" max={100} value={percent}/>
      <span>{hasTotal?`${percent}%`:`已下载 ${((state?.written??0)/1024/1024).toFixed(1)} MB`}</span>
     </div>:null}
     {state?.phase==='ready'?<p>下载内容已校验。可以继续使用应用，或重启安装新版。</p>:null}
     {state?.release?.notes?<section className="update-notes" aria-label="更新说明"><h3>更新说明</h3><p>{state.release.notes}</p></section>:null}
     {state?.installPath?<p className="update-location">安装位置：{state.installPath}</p>:null}
     {confirm?<div className="update-confirm" role="group" aria-label="确认重启安装">
      <p>将退出 Default Apps，更新当前应用副本并重新打开。</p>
      <div className="lifecycle-actions"><button className="btn" onClick={()=>setConfirm(false)} disabled={busy}>稍后</button><button className="btn btn--primary" onClick={()=>void run(Restart,true)} disabled={busy}>确认重启安装</button></div>
     </div>:null}
    </>}
    {error||state?.error?<p className="change-error" role="alert">{error||state?.error}</p>:null}
    <div className="update-actions">
     <button className="btn" onClick={()=>{setError('');void Browser.OpenURL(state?.releaseURL??'https://github.com/sunven/default-apps/releases/latest').catch(value=>setError(String(value)))}}>打开发布页</button>
     {state&&!state.disabledReason?<>
      {state.phase==='ready'?<button className="btn btn--primary" disabled={busy||confirm} onClick={()=>setConfirm(true)}>重启安装</button>:<>
       <button className="btn" disabled={busy} onClick={()=>void run(Check)}>检查更新</button>
       {state.release?<button className="btn btn--primary" disabled={busy} onClick={()=>void run(Download)}>{state.error?'重试下载':'下载更新'}</button>:null}
      </>}
     </>:null}
    </div>
   </section>
  </Dialog>:null}
 </>
}
