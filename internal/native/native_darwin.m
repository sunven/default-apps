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
    NSError *metadataError = nil;
    [canonical checkResourceIsReachableAndReturnError:&metadataError];
    return @{@"path": canonical.path ?: @"", @"displayPath": url.path ?: @"",
             @"name": name ?: @"", @"version": [version isKindOfClass:NSString.class] ? version : @"",
             @"metadataError": metadataError.localizedDescription ?: (bundle.infoDictionary ? @"" : @"无法读取应用包元数据"),
             @"bundleID": bundle.bundleIdentifier ?: @""};
}

// Property-list objects are decoded as data on the scan worker. No NSWorkspace,
// app launch, registration or main-thread filesystem traversal is involved.
static id jsonProperty(id value) {
    if ([value isKindOfClass:NSDictionary.class]) {
        NSMutableDictionary *result = [NSMutableDictionary dictionary];
        for (id key in value) if ([key isKindOfClass:NSString.class]) result[key] = jsonProperty(value[key]);
        return result;
    }
    if ([value isKindOfClass:NSArray.class]) {
        NSMutableArray *result = [NSMutableArray array];
        for (id item in value) [result addObject:jsonProperty(item)];
        return result;
    }
    if ([value isKindOfClass:NSString.class] || [value isKindOfClass:NSNumber.class]) return value;
    return NSNull.null;
}

char *default_apps_read_application(const char *path) {
    @autoreleasepool {
        @try {
            NSURL *original = [NSURL fileURLWithPath:@(path)].URLByStandardizingPath;
            NSURL *resolved = original.URLByResolvingSymlinksInPath;
            NSError *error = nil;
            if (![resolved checkResourceIsReachableAndReturnError:&error]) return encode(@{@"error": error.localizedDescription ?: @"应用包不存在"});
            NSNumber *directory = nil;
            [resolved getResourceValue:&directory forKey:NSURLIsDirectoryKey error:&error];
            if (!directory.boolValue) return encode(@{@"error": @"所选位置不是应用包目录"});
            NSURL *canonical = resolved.fileReferenceURL.filePathURL ?: resolved;
            NSMutableDictionary *app = [applicationCopy(original) mutableCopy];
            NSData *data = [NSData dataWithContentsOfURL:[canonical URLByAppendingPathComponent:@"Contents/Info.plist"] options:0 error:&error];
            id info = data ? [NSPropertyListSerialization propertyListWithData:data options:NSPropertyListImmutable format:nil error:&error] : nil;
            NSMutableArray *issues = [NSMutableArray array];
            if (![info isKindOfClass:NSDictionary.class]) {
                NSString *message = error.localizedDescription ?: @"应用声明不是属性字典";
                [issues addObject:@{@"path": app[@"path"], @"origin": @"Info.plist", @"message": message}];
                app[@"metadataError"] = message;
                info = @{};
            }
            // Avoid NSBundle's process cache when an installed copy changes on refresh.
            id name = info[@"CFBundleDisplayName"] ?: info[@"CFBundleName"];
            if ([name isKindOfClass:NSString.class] && [name length]) app[@"name"] = name;
            id version = info[@"CFBundleShortVersionString"] ?: info[@"CFBundleVersion"];
            app[@"version"] = [version isKindOfClass:NSString.class] ? version : @"";
            id bundleID = info[@"CFBundleIdentifier"];
            app[@"bundleID"] = [bundleID isKindOfClass:NSString.class] ? bundleID : @"";
            return encode(@{@"app": app, @"info": jsonProperty(info), @"issues": issues});
        } @catch (NSException *exception) {
            return encode(@{@"error": exception.reason ?: @"无法读取应用声明"});
        }
    }
}

char *default_apps_resolve_type(const char *kind, const char *value) {
    @autoreleasepool {
        @try {
            NSArray<UTType *> *matches;
            if (strcmp(kind,"identifier")==0) {
                UTType *type = [UTType typeWithIdentifier:@(value)];
                matches = type ? @[type] : @[];
            } else {
                NSString *tagClass = strcmp(kind,"mime")==0 ? UTTagClassMIMEType : UTTagClassFilenameExtension;
                matches = [UTType typesWithTag:@(value) tagClass:tagClass conformingToType:nil];
            }
            NSMutableArray *types = [NSMutableArray array];
            for (UTType *type in matches) [types addObject:@{@"identifier": type.identifier, @"name": type.localizedDescription ?: type.identifier,
                @"extensions": type.tags[UTTagClassFilenameExtension] ?: @[], @"mimeTypes": type.tags[UTTagClassMIMEType] ?: @[],
                @"declared": @(type.isDeclared), @"dynamic": @(type.isDynamic)}];
            return encode(@{@"types":types});
        } @catch(NSException *exception) { return encode(@{@"error":exception.reason ?: @"文件类型解析失败"}); }
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
