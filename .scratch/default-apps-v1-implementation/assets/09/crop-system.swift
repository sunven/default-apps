// Crop retained evidence to the product/system area, avoiding unrelated desktop.
import AppKit
import CoreGraphics
let path=CommandLine.arguments[1]
let image=NSImage(contentsOfFile:path)!
var rect=CGRect(origin:.zero,size:image.size)
let cg=image.cgImage(forProposedRect:&rect,context:nil,hints:nil)!
let crop=CGRect(x:Double(CommandLine.arguments[2])!,y:Double(CommandLine.arguments[3])!,width:Double(CommandLine.arguments[4])!,height:Double(CommandLine.arguments[5])!)
let data=NSBitmapImageRep(cgImage:cg.cropping(to:crop)!).representation(using:.png,properties:[:])!
try data.write(to:URL(fileURLWithPath:path))
