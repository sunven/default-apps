//go:build darwin && cgo

package appupdate

/*
#cgo LDFLAGS: -framework CFNetwork -framework CoreFoundation
#include <CFNetwork/CFNetwork.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	char *host;
	int port;
	int kind;
} update_proxy;

static update_proxy update_system_proxy(const char *address) {
	update_proxy result = {0};
	CFURLRef url = CFURLCreateWithBytes(NULL, (const UInt8 *)address, strlen(address), kCFStringEncodingUTF8, NULL);
	CFDictionaryRef settings = CFNetworkCopySystemProxySettings();
	if (!url || !settings) {
		if (url) CFRelease(url);
		if (settings) CFRelease(settings);
		return result;
	}
	CFArrayRef proxies = CFNetworkCopyProxiesForURL(url, settings);
	CFRelease(settings);
	CFRelease(url);
	if (!proxies) return result;
	if (CFArrayGetCount(proxies) > 0) {
		CFDictionaryRef proxy = CFArrayGetValueAtIndex(proxies, 0);
		CFStringRef type = CFDictionaryGetValue(proxy, kCFProxyTypeKey);
		if (type && (CFEqual(type, kCFProxyTypeHTTP) || CFEqual(type, kCFProxyTypeHTTPS))) result.kind = 1;
		else if (type && CFEqual(type, kCFProxyTypeSOCKS)) result.kind = 2;
		else if (type && !CFEqual(type, kCFProxyTypeNone)) result.kind = 3;
		if (result.kind == 1 || result.kind == 2) {
			CFStringRef host = CFDictionaryGetValue(proxy, kCFProxyHostNameKey);
			CFNumberRef port = CFDictionaryGetValue(proxy, kCFProxyPortNumberKey);
			if (host && port) {
				CFIndex capacity = CFStringGetMaximumSizeForEncoding(CFStringGetLength(host), kCFStringEncodingUTF8) + 1;
				result.host = malloc(capacity);
				if (result.host && !CFStringGetCString(host, result.host, capacity, kCFStringEncodingUTF8)) {
					free(result.host);
					result.host = NULL;
				}
				CFNumberGetValue(port, kCFNumberIntType, &result.port);
			}
		}
	}
	CFRelease(proxies);
	return result;
}
*/
import "C"

import (
	"net"
	"net/http"
	"net/url"
	"strconv"
	"unsafe"
)

func systemProxy(req *http.Request) (*url.URL, error) {
	address := C.CString(req.URL.String())
	defer C.free(unsafe.Pointer(address))
	proxy := C.update_system_proxy(address)
	if proxy.host != nil {
		defer C.free(unsafe.Pointer(proxy.host))
	}
	if proxy.kind == 0 {
		return nil, nil
	}
	if proxy.kind == 3 {
		return nil, publicSourceError("暂不支持系统自动代理配置，请使用系统手动代理，或打开发布页下载。")
	}
	if proxy.host == nil || proxy.port < 1 || proxy.port > 65535 {
		return nil, publicSourceError("系统代理地址无效，请检查代理设置后重试。")
	}
	scheme := "http"
	if proxy.kind == 2 {
		scheme = "socks5"
	}
	return &url.URL{Scheme: scheme, Host: net.JoinHostPort(C.GoString(proxy.host), strconv.Itoa(int(proxy.port)))}, nil
}
