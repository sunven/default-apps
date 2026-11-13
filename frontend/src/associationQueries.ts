import type {Association,QueryResult} from '../bindings/github.com/sunven/default-apps/internal/association/models'

export const associationID=(association:Association)=>`${association.kind}:${association.key}`
export type QueryAdapter={
 query(association:Association):PromiseLike<QueryResult>
 subscribe(accept:(result:QueryResult)=>void):()=>void
}
type Intent='background'|'panel'|'selected'|'refresh'
type Snapshot={observations:Record<string,QueryResult>;rowErrors:Record<string,string>;pending:Record<string,boolean>}
export type QueryWatch={ready:Promise<void>;refresh:()=>Promise<void>;close:()=>void}
type Job={
 id:string;association:Association;token:number;observedVersion:number;generation:number
 priority:number;started:boolean;slot:boolean;owners:Set<symbol>;ready:Promise<void>;finish:()=>void
}

// One window owns this module. Consumers own demand; query results belong to the
// shared observation history, even if the originating panel has since closed.
export class AssociationQueries {
 private state:Snapshot={observations:{},rowErrors:{},pending:{}}
 private listeners=new Set<()=>void>()
 private jobs=new Map<string,Job>()
 private issued=new Map<string,number>()
 private running=new Set<Job>()
 private slots=0
 private sequence=0
 private generation=0
 private active=false
 private disconnect=()=>{}
 constructor(private adapter:QueryAdapter){}
 getSnapshot=()=>this.state
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(){for(const listener of this.listeners)listener()}
 start(){
  if(this.active)return
  this.active=true
  const generation=++this.generation
  this.disconnect=this.adapter.subscribe(value=>{if(this.active&&generation===this.generation)this.accept(value)})
 }
 stop(){
  this.active=false;++this.generation;this.disconnect()
  for(const job of new Set([...this.jobs.values(),...this.running]))job.finish()
  this.jobs.clear();this.running.clear();this.issued.clear();this.slots=0
  this.state={...this.state,pending:{}}
 }
 accept=(value:QueryResult,token?:number)=>{
  if(!this.active||value.superseded)return
  const id=associationID(value.association),current=this.state.observations[id]
  if(current&&(value.version<current.version||(value.version===current.version&&(token===undefined||token!==this.issued.get(id)))))return
  const rowErrors={...this.state.rowErrors};delete rowErrors[id]
  this.state={...this.state,observations:{...this.state.observations,[id]:value},rowErrors}
  this.publish()
 }
 private setPending(id:string,pending:boolean){
  if(!!this.state.pending[id]===pending)return
  const values={...this.state.pending}
  if(pending)values[id]=true;else delete values[id]
  this.state={...this.state,pending:values};this.publish()
 }
 private free(job:Job){if(job.slot){job.slot=false;this.slots--}}
 private recordFailure(job:Job,message:string){
  if(!this.active||job.generation!==this.generation||this.issued.get(job.id)!==job.token||job.observedVersion!==(this.state.observations[job.id]?.version??-1))return
  this.state={...this.state,rowErrors:{...this.state.rowErrors,[job.id]:message}}
  this.publish()
 }
 private pump(){
  if(!this.active)return
  const queued=[...this.jobs.values()].filter(job=>!job.started&&job.owners.size).sort((a,b)=>b.priority-a.priority)
  for(const job of queued){
   if(job.priority<2&&this.slots>=4)continue
   this.run(job)
  }
 }
 private run(job:Job){
  job.started=true;this.running.add(job)
  if(job.priority<2){job.slot=true;this.slots++}
  // Fence failures at actual issuance. A queued job has not observed anything yet.
  job.observedVersion=this.state.observations[job.id]?.version??-1
  this.issued.set(job.id,job.token)
  void (async()=>{
   try{
    const result=await this.adapter.query(job.association)
    if(this.active&&job.generation===this.generation){
     if(result.superseded){
      if(!this.state.rowErrors[job.id])this.recordFailure(job,'查询已被更新的查询替代，请重新查询。')
     }else this.accept(result,job.token)
    }
   }catch(error){
    this.recordFailure(job,error instanceof Error?error.message:String(error))
   }finally{
    job.finish()
    if(job.generation===this.generation){
     this.running.delete(job);this.free(job)
     if(this.jobs.get(job.id)===job){this.jobs.delete(job.id);this.setPending(job.id,false)}
     this.pump()
    }
   }
  })()
 }
 watch(associations:Association[],intent:Intent='panel'):QueryWatch{
  const owner=Symbol(),owned=new Set<Job>(),generation=this.generation
  const unique=[...new Map(associations.map(a=>[associationID(a),a])).values()]
  let closed=false
  const request=(mode:Intent)=>{
   if(closed||!this.active||generation!==this.generation)return Promise.resolve()
   const priority=mode==='background'?0:mode==='panel'?1:2
   const requested:Job[]=[],pending={...this.state.pending}
   let pendingChanged=false
   for(const association of unique){
    const id=associationID(association)
    let job=this.jobs.get(id)
    let replaced:Job|undefined
    if(mode==='background'&&!job&&this.state.observations[id])continue
    if(mode==='refresh'&&job){
     // Waiters follow the replacement instead of waiting for the obsolete native
     // call. Its late reply is still fenced by versions and its error by token.
     replaced=job;this.free(job);job=undefined
    }
    if(!job){
     let finish!:()=>void
     const ready=new Promise<void>(resolve=>{finish=resolve})
     job={id,association,token:++this.sequence,observedVersion:-1,generation,priority,started:false,slot:false,owners:new Set(),ready,finish}
     this.jobs.set(id,job)
     if(!pending[id]){pending[id]=true;pendingChanged=true}
    }
    if(replaced){const finish=replaced.finish;replaced.finish=()=>{};void job.ready.then(finish)}
    job.owners.add(owner);requested.push(job)
    if(!owned.has(job)){
     const current=job
     owned.add(current)
     void current.ready.then(()=>{current.owners.delete(owner);owned.delete(current)})
    }
    if(priority>job.priority)job.priority=priority
    if(job.started&&!job.slot&&job.priority<2){job.slot=true;this.slots++}
   }
   if(pendingChanged){this.state={...this.state,pending};this.publish()}
   this.pump()
   return Promise.all(requested.map(job=>job.ready)).then(()=>{})
  }
  return {ready:request(intent),refresh:()=>request('refresh'),close:()=>{
   closed=true
   if(generation!==this.generation){owned.clear();return}
   const pending={...this.state.pending}
   let pendingChanged=false
   for(const job of owned){
    job.owners.delete(owner)
    if(job.owners.size)continue
    this.free(job)
    if(!job.started&&this.jobs.get(job.id)===job){this.jobs.delete(job.id);job.finish();delete pending[job.id];pendingChanged=true}
   }
   if(pendingChanged){this.state={...this.state,pending};this.publish()}
   owned.clear();this.pump()
  }}
 }
}
