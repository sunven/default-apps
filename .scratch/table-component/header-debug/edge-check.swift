import AppKit
let args = CommandLine.arguments
let bitmap = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: args[1])))!
let scale = Double(bitmap.pixelsWide) / 1200
let y = Int(Double(args[2])! * scale)
var ink = 0
for x in Int(60 * scale)..<Int(1100 * scale) {
    let reference = bitmap.colorAt(x: Int(200 * scale), y: y)!.usingColorSpace(.deviceRGB)!
    let color = bitmap.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
    if abs(color.redComponent-reference.redComponent)+abs(color.greenComponent-reference.greenComponent)+abs(color.blueComponent-reference.blueComponent) > 0.15 { ink += 1 }
}
print("\(ink > 0 ? "FAIL" : "PASS"): \(ink) row-content pixels above the header")
exit(ink > 0 ? 1 : 0)
