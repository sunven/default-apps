import type {Entry} from '../bindings/github.com/sunven/default-apps/internal/catalog/models'

export const associationSourceOptions = [
 {value:'all',label:'全部来源'},
 {value:'default',label:'当前默认关联'},
 {value:'direct',label:'直接声明'},
 {value:'extension',label:'扩展名解析'},
 {value:'mime',label:'MIME 解析'},
 {value:'ostype',label:'旧式声明'},
 {value:'other',label:'原始声明'},
] as const
export type AssociationSourceFilter = typeof associationSourceOptions[number]['value']

// A direct declaration takes precedence over derived declarations in the row.
export function applicationDeclarationSources(entry:Entry,appPath:string) {
 const sources=entry.sources?.filter(source=>source.kind==='declaration'&&source.appPath===appPath)??[]
 const direct=sources.filter(source=>source.inputKind==='identifier'||source.inputKind==='scheme')
 return direct.length?direct:sources
}

export function matchesAssociationSource(entry:Entry,appPath:string,isDefault:boolean,filter:AssociationSourceFilter) {
 if(filter==='all')return true
 const sources=applicationDeclarationSources(entry,appPath)
 if(filter==='default')return !sources.length&&isDefault
 if(filter==='direct')return sources.some(source=>source.inputKind==='identifier'||source.inputKind==='scheme')
 if(filter==='other')return sources.some(source=>!['identifier','scheme','extension','mime','ostype'].includes(source.inputKind))
 return sources.some(source=>source.inputKind===filter)
}
