import AppKit
import WebKit

@MainActor final class Probe: NSObject, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let args = CommandLine.arguments
    func start() {
        NSApp.setActivationPolicy(.prohibited)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: Int(args[1])!, height: Int(args[2])!), styleMask: [.borderless], backing: .buffered, defer: false)
        window.appearance = NSAppearance(named: args.count > 5 && args[5] == "dark" ? .darkAqua : .aqua)
        web = WKWebView(frame: window.contentView!.bounds)
        web.navigationDelegate = self
        window.contentView = web
        window.orderFrontRegardless()
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:9256/")!))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                let script = try String(contentsOfFile: args[3], encoding: .utf8)
                let result = try await web.callAsyncJavaScript(script, arguments: ["view": args.count > 6 ? args[6] : "file"], in: nil, contentWorld: .page)
                if let result { print(result) }
                let capture = Process()
                capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
                capture.arguments = ["-o", "-x", "-l", String(window.windowNumber), args[4]]
                try capture.run()
                capture.waitUntilExit()
                let bitmap = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: args[4])))!
                let geometry = try JSONSerialization.jsonObject(with: (result as! String).data(using: .utf8)!) as! [String: Any]
                let scale = Double(bitmap.pixelsWide) / web.bounds.width
                let y = Int(floor((geometry["top"] as! Double) * scale))
                let left = (geometry["left"] as! Double) + 44
                let right = (geometry["right"] as! Double) - 32
                let reference = bitmap.colorAt(x: Int((left + 140) * scale), y: y)!.usingColorSpace(.deviceRGB)!
                var ink = 0
                for x in Int(left * scale)..<Int(right * scale) {
                    let c = bitmap.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
                    if abs(c.redComponent-reference.redComponent)+abs(c.greenComponent-reference.greenComponent)+abs(c.blueComponent-reference.blueComponent) > 0.15 { ink += 1 }
                }
                print("\(ink > 0 ? "FAIL" : "PASS"): \(ink) row-content pixels above the header")
                if ink > 0 { exit(1) }
                NSApp.terminate(nil)
            } catch {
                print("ERROR: \(error)")
                exit(1)
            }
        }
    }
}
let app = NSApplication.shared
let probe = MainActor.assumeIsolated {
    let probe = Probe()
    probe.start()
    return probe
}
DispatchQueue.main.asyncAfter(deadline: .now() + 55) { print("ERROR: timeout"); exit(1) }
app.run()
