import AppKit
import WebKit

@MainActor final class Probe: NSObject, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let args = CommandLine.arguments
    func start() {
        NSApp.setActivationPolicy(.prohibited)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800), styleMask: [.borderless], backing: .buffered, defer: false)
        web = WKWebView(frame: window.contentView!.bounds)
        web.navigationDelegate = self
        window.contentView = web
        window.orderFrontRegardless()
        web.load(URLRequest(url: URL(string: args[1])!))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                let source = try String(contentsOfFile: args[2], encoding: .utf8)
                let result = try await web.callAsyncJavaScript("return await " + source, arguments: [:], in: nil, contentWorld: .page)
                let data = try JSONSerialization.data(withJSONObject: result!, options: [.prettyPrinted, .sortedKeys])
                print(String(data: data, encoding: .utf8)!)
                if (result as? [String: Any])?["pass"] as? Bool == false { exit(1) }
                NSApp.terminate(nil)
            } catch { print("ERROR: \(error)"); exit(1) }
        }
    }
}
let app = NSApplication.shared
let probe = MainActor.assumeIsolated { let probe = Probe(); probe.start(); return probe }
DispatchQueue.main.asyncAfter(deadline: .now() + 55) { print("ERROR: timeout"); exit(1) }
app.run()
