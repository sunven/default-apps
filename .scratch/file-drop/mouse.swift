import AppKit
import ApplicationServices
let values=CommandLine.arguments.dropFirst().compactMap(Double.init)
guard values.count==4 else {fatalError("sourceX sourceY targetX targetY")}
let start=CGPoint(x:values[0],y:values[1]),end=CGPoint(x:values[2],y:values[3])
func post(_ type:CGEventType,_ point:CGPoint){let event=CGEvent(mouseEventSource:nil,mouseType:type,mouseCursorPosition:point,mouseButton:.left)!;event.post(tap:.cghidEventTap)}
post(.mouseMoved,start);Thread.sleep(forTimeInterval:0.2);post(.leftMouseDown,start);Thread.sleep(forTimeInterval:0.4)
for step in 1...45 {let p=Double(step)/45;post(.leftMouseDragged,CGPoint(x:start.x+(end.x-start.x)*p,y:start.y+(end.y-start.y)*p));Thread.sleep(forTimeInterval:0.035)}
Thread.sleep(forTimeInterval:0.3);post(.leftMouseUp,end)
