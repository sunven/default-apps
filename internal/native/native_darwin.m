#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <string.h>
#include "native.h"

static char *encode(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return NULL;
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}

static NSDictionary *applicationCopy(NSURL *url) {
    NSURL *resolved = url.URLByResolvingSymlinksInPath.URLByStandardizingPath;
    // File-reference resolution asks the filesystem for the actual bundle spelling.
    // No lowercasing: distinct paths on a case-sensitive volume remain distinct.
    NSURL *canonical = resolved.fileReferenceURL.filePathURL ?: resolved;
    NSBundle *bundle = [NSBundle bundleWithURL:canonical];
    NSString *name = [bundle objectForInfoDictionaryKey:@"CFBundleDisplayName"];
    if (![name isKindOfClass:NSString.class] || !name.length)
        name = [bundle objectForInfoDictionaryKey:@"CFBundleName"];
    if (![name isKindOfClass:NSString.class] || !name.length)
        name = canonical.lastPathComponent.stringByDeletingPathExtension;
    id version = [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
    if (![version isKindOfClass:NSString.class]) version = [bundle objectForInfoDictionaryKey:@"CFBundleVersion"];
    return @{@"path": canonical.path ?: @"", @"displayPath": url.path ?: @"",
             @"name": name ?: @"", @"version": [version isKindOfClass:NSString.class] ? version : @"",
             @"bundleID": bundle.bundleIdentifier ?: @""};
}

char *default_apps_resolve_extension(const char *extension) {
    @autoreleasepool {
        if (!NSThread.isMainThread) return encode(@{@"error": @"原生解析未在主线程调度"});
        @try {
            NSMutableArray *types = [NSMutableArray array];
            for (UTType *type in [UTType typesWithTag:@(extension) tagClass:UTTagClassFilenameExtension conformingToType:nil]) {
                [types addObject:@{@"identifier": type.identifier, @"name": type.localizedDescription ?: type.identifier,
                  @"extensions": type.tags[UTTagClassFilenameExtension] ?: @[], @"mimeTypes": type.tags[UTTagClassMIMEType] ?: @[],
                  @"declared": @(type.isDeclared), @"dynamic": @(type.isDynamic)}];
            }
            return encode(@{@"types": types});
        } @catch (NSException *exception) {
            return encode(@{@"error": exception.reason ?: @"文件类型解析失败"});
        }
    }
}

char *default_apps_query(const char *kind, const char *key, int candidates) {
    @autoreleasepool {
        if (!NSThread.isMainThread) return encode(@{@"error": @"原生查询未在主线程调度"});
        @try {
            UTType *type = nil;
            NSURL *schemeURL = nil;
            if (strcmp(kind, "file") == 0) {
                type = [UTType typeWithIdentifier:@(key)];
                if (!type || type.isDynamic || !type.isDeclared) return encode(@{@"error": @"系统无法解析此文件类型"});
            } else if (strcmp(kind, "scheme") == 0) {
                NSString *scheme = @(key);
                NSRegularExpression *pattern = [NSRegularExpression regularExpressionWithPattern:@"^[A-Za-z][A-Za-z0-9+.-]*$" options:0 error:nil];
                if ([pattern numberOfMatchesInString:scheme options:0 range:NSMakeRange(0, scheme.length)] != 1)
                    return encode(@{@"error": @"URL 协议名称无效"});
                schemeURL = [NSURL URLWithString:[scheme stringByAppendingString:@":catalog-readonly"]];
                if (!schemeURL || schemeURL.isFileURL) return encode(@{@"error": @"此协议不能用于链接关联查询"});
            } else {
                return encode(@{@"error": @"未知关联种类"});
            }
            NSWorkspace *workspace = NSWorkspace.sharedWorkspace;
            if (candidates) {
                NSMutableArray *apps = [NSMutableArray array];
                NSArray<NSURL *> *urls = type ? [workspace URLsForApplicationsToOpenContentType:type] : [workspace URLsForApplicationsToOpenURL:schemeURL];
                for (NSURL *url in urls) {
                    [apps addObject:applicationCopy(url)];
                }
                return encode(@{@"apps": apps});
            }
            NSURL *url = type ? [workspace URLForApplicationToOpenContentType:type] : [workspace URLForApplicationToOpenURL:schemeURL];
            return encode(@{@"app": url ? applicationCopy(url) : (id)NSNull.null});
        } @catch (NSException *exception) {
            return encode(@{@"error": exception.reason ?: @"系统查询失败"});
        }
    }
}

void default_apps_content_minimum(void *handle, double width, double height) {
    @autoreleasepool {
        NSWindow *window = (__bridge NSWindow *)handle;
        NSSize content = NSMakeSize(width, height);
        // Wails' public minimum measures the outer frame on Darwin. Derive both
        // constraints from content so native titlebar height is never guessed.
        NSSize frame = [window frameRectForContentRect:NSMakeRect(0, 0, width, height)].size;
        window.minSize = frame;
        window.contentMinSize = content;
        NSSize current = window.contentView.bounds.size;
        if (current.width < width || current.height < height)
            [window setContentSize:NSMakeSize(MAX(current.width,width), MAX(current.height,height))];
    }
}
