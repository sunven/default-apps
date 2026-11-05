import AppKit

// Product mark: a document with an outgoing association arrow.
let image = NSImage(size: NSSize(width: 1024, height: 1024))
image.lockFocus()
NSColor(calibratedWhite: 0.96, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 48, y: 48, width: 928, height: 928), xRadius: 200, yRadius: 200).fill()
let ink = NSColor(calibratedRed: 0.09, green: 0.39, blue: 0.70, alpha: 1)
ink.setStroke()
let document = NSBezierPath()
document.lineWidth = 42
document.lineJoinStyle = .round
document.move(to: NSPoint(x: 548, y: 802))
document.line(to: NSPoint(x: 292, y: 802))
document.line(to: NSPoint(x: 292, y: 222))
document.line(to: NSPoint(x: 732, y: 222))
document.line(to: NSPoint(x: 732, y: 618))
document.close()
document.stroke()
let fold = NSBezierPath()
fold.lineWidth = 34
fold.move(to: NSPoint(x: 548, y: 802))
fold.line(to: NSPoint(x: 548, y: 618))
fold.line(to: NSPoint(x: 732, y: 618))
fold.stroke()
let arrow = NSBezierPath()
arrow.lineWidth = 42
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
arrow.move(to: NSPoint(x: 390, y: 432))
arrow.line(to: NSPoint(x: 630, y: 432))
arrow.move(to: NSPoint(x: 558, y: 510))
arrow.line(to: NSPoint(x: 636, y: 432))
arrow.line(to: NSPoint(x: 558, y: 354))
arrow.stroke()
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "build/appicon.png"))
