import {useCallback,useMemo,type RefObject} from 'react'
import {defaultRangeExtractor,useVirtualizer} from '@tanstack/react-virtual'
import type {TablePlugin} from '@astryxdesign/core/Table'

const passthrough={transformTable:props=>props} satisfies TablePlugin<{id:string}>

// Keep rich, wrapping cells in a native table. Only the viewport, its overscan,
// and the keyboard selection need mounted controls; gaps retain scroll geometry.
export function useAssociationTableWindow<T extends {id:string}>(rows:T[],viewport:RefObject<HTMLDivElement|null>,selectedID:string|undefined,columnCount:number){
 const enabled=rows.length>60
 const selectedIndex=rows.findIndex(row=>row.id===selectedID)
 const getItemKey=useCallback((index:number)=>rows[index].id,[rows])
 // The first row anchors the table's leading gap. Pin the selection as well so
 // the browser's layout effect can focus Home/End destinations before scrolling.
 const rangeExtractor=useCallback((range:Parameters<typeof defaultRangeExtractor>[0])=>
  [...new Set([0,...defaultRangeExtractor(range),...(selectedIndex>=0?[selectedIndex]:[])])].sort((a,b)=>a-b),[selectedIndex])
 const virtualizer=useVirtualizer<HTMLDivElement,HTMLTableRowElement>({
  count:rows.length,enabled,getScrollElement:()=>viewport.current,getItemKey,
  estimateSize:()=>60,initialRect:{width:0,height:600},overscan:5,rangeExtractor,
  useAnimationFrameWithResizeObserver:true,
 })
 const items=virtualizer.getVirtualItems()
 const totalSize=virtualizer.getTotalSize()
 const data=useMemo(()=>enabled?items.map(item=>rows[item.index]):rows,[enabled,items,rows])
 const plugin=useMemo<TablePlugin<T>>(()=>{
  if(!enabled)return passthrough
  const geometry=new Map(items.map((item,index)=>[rows[item.index].id,{
   index:item.index,gap:Math.max(0,(items[index+1]?.start??totalSize)-item.end),
  }]))
  return {
   rowModel:'flat',
   transformTable:props=>({...props,htmlProps:{...props.htmlProps,'aria-rowcount':rows.length+1}}),
   transformHeaderRow:props=>({...props,htmlProps:{...props.htmlProps,'aria-rowindex':1}}),
   transformBodyRow:(props,row)=>{
    const position=geometry.get(row.id)!
    return {...props,ref:virtualizer.measureElement,
     htmlProps:{...props.htmlProps,'data-index':position.index,'aria-rowindex':position.index+2},
     afterRow:<>{props.afterRow}{position.gap>0?<tr aria-hidden="true" className="association-spacer"><td colSpan={columnCount} style={{height:position.gap}}/></tr>:null}</>,
    }
   },
  }
 },[enabled,items,rows,totalSize,columnCount,virtualizer.measureElement])
 return {data,plugin}
}
