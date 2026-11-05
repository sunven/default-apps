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

char *default_apps_query(const char *kind, const char *key, int candidates) {
    @autoreleasepool {
        if (!NSThread.isMainThread) return encode(@{@"error": @"原生查询未在主线程调度"});
        @try {
            if (strcmp(kind, "file") != 0) return encode(@{@"error": @"尚不支持此关联种类"});
            UTType *type = [UTType typeWithIdentifier:@(key)];
            if (!type) return encode(@{@"error": @"系统无法解析此文件类型"});
            NSWorkspace *workspace = NSWorkspace.sharedWorkspace;
            if (candidates) {
                NSMutableArray *apps = [NSMutableArray array];
                for (NSURL *url in [workspace URLsForApplicationsToOpenContentType:type]) {
                    [apps addObject:applicationCopy(url)];
                }
                return encode(@{@"apps": apps});
            }
            NSURL *url = [workspace URLForApplicationToOpenContentType:type];
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
