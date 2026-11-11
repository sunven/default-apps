#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <string.h>
#include <sys/stat.h>
#include "native.h"

static char *encode(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    if (!data) return NULL;
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}

static NSString *applicationIconData(NSURL *url) {
    // Fixed pixel dimensions keep scan snapshots small and remain sharp on Retina.
    // iconForFile: is safe on the scan worker; draw into a private bitmap context.
    @try {
        NSImage *icon = [NSWorkspace.sharedWorkspace iconForFile:url.path];
        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
            pixelsWide:128 pixelsHigh:128 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES
            isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
        NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
        if (!icon || !context) return @"";
        [NSGraphicsContext saveGraphicsState];
        @try {
            NSGraphicsContext.currentContext = context;
            [icon drawInRect:NSMakeRect(0, 0, 128, 128) fromRect:NSZeroRect
                  operation:NSCompositingOperationCopy fraction:1.0];
        } @finally {
            [NSGraphicsContext restoreGraphicsState];
        }
        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        return [png base64EncodedStringWithOptions:0] ?: @"";
    } @catch (NSException *exception) {
        return @"";
    }
}

static NSString *nonemptyString(id value) {
    return [value isKindOfClass:NSString.class] && [value length] ? value : nil;
}

static NSDictionary *applicationCopy(NSURL *url, NSDictionary **declarations) {
    NSURL *resolved = url.URLByResolvingSymlinksInPath.URLByStandardizingPath;
    // File-reference resolution asks the filesystem for the actual bundle spelling.
    // No lowercasing: distinct paths on a case-sensitive volume remain distinct.
    NSURL *canonical = resolved.fileReferenceURL.filePathURL ?: resolved;
    // NSBundle caches Info.plist for the life of the process. Read it once per
    // copy so discovery, default queries and candidates all observe updates,
    // removed fields and repaired bundles using the same metadata snapshot.
    NSError *metadataError = nil;
    NSData *data = [NSData dataWithContentsOfURL:[canonical URLByAppendingPathComponent:@"Contents/Info.plist"] options:0 error:&metadataError];
    id value = data ? [NSPropertyListSerialization propertyListWithData:data options:NSPropertyListImmutable format:nil error:&metadataError] : nil;
    BOOL valid = [value isKindOfClass:NSDictionary.class];
    NSDictionary *info = valid ? value : @{};
    if (declarations) *declarations = info;
    NSString *name = nonemptyString(info[@"CFBundleDisplayName"]) ?: nonemptyString(info[@"CFBundleName"]) ?: canonical.lastPathComponent.stringByDeletingPathExtension;
    NSString *version = nonemptyString(info[@"CFBundleShortVersionString"]) ?: nonemptyString(info[@"CFBundleVersion"]);
    // Use the actual copy's SIP flag, including Safari's Cryptex target.
    // An Apple bundle ID alone does not make a user-installed copy a system app.
    struct stat attributes;
    BOOL system = stat(canonical.fileSystemRepresentation, &attributes) == 0 &&
                  (attributes.st_flags & SF_RESTRICTED) != 0;
    return @{@"path": canonical.path ?: @"", @"displayPath": url.path ?: @"",
             @"name": name ?: @"", @"version": version ?: @"",
             @"system": @(system),
             @"iconData": applicationIconData(canonical),
             @"metadataError": valid ? @"" : (metadataError.localizedDescription ?: @"应用声明不是属性字典"),
             @"bundleID": nonemptyString(info[@"CFBundleIdentifier"]) ?: @""};
}

// Property-list objects are decoded as data on the scan worker, without app
// launch, registration or main-thread filesystem traversal.
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

static char *readApplication(const char *path, BOOL declarations) {
    @autoreleasepool {
        @try {
            NSURL *original = [NSURL fileURLWithPath:@(path)].URLByStandardizingPath;
            NSURL *resolved = original.URLByResolvingSymlinksInPath;
            NSError *error = nil;
            if (![resolved checkResourceIsReachableAndReturnError:&error]) return encode(@{@"error": error.localizedDescription ?: @"应用包不存在"});
            NSNumber *directory = nil;
            [resolved getResourceValue:&directory forKey:NSURLIsDirectoryKey error:&error];
            if (!directory.boolValue) return encode(@{@"error": @"所选位置不是应用包目录"});
            NSDictionary *info = nil;
            NSDictionary *app = applicationCopy(original, &info);
            NSMutableArray *issues = [NSMutableArray array];
            if ([app[@"metadataError"] length]) {
                NSString *message = app[@"metadataError"];
                [issues addObject:@{@"path": app[@"path"], @"origin": @"Info.plist", @"message": message}];
            }
            if (!declarations) return encode(@{@"app": app});
            return encode(@{@"app": app, @"info": jsonProperty(info), @"issues": issues});
        } @catch (NSException *exception) {
            return encode(@{@"error": exception.reason ?: @"无法读取应用声明"});
        }
    }
}

char *default_apps_read_application(const char *path) {
    return readApplication(path, YES);
}

char *default_apps_read_application_copy(const char *path) {
    return readApplication(path, NO);
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
                    [apps addObject:applicationCopy(url, NULL)];
                }
                return encode(@{@"apps": apps});
            }
            NSURL *url = type ? [workspace URLForApplicationToOpenContentType:type] : [workspace URLForApplicationToOpenURL:schemeURL];
            return encode(@{@"app": url ? applicationCopy(url, NULL) : (id)NSNull.null});
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

char *default_apps_identify_file(const char *path) {
    @autoreleasepool {
        @try {
            NSURL *url = [NSURL fileURLWithPath:@(path)];
            NSError *error = nil;
            UTType *type = nil;
            if (![url getResourceValue:&type forKey:NSURLContentTypeKey error:&error])
                return encode(@{@"error": error.localizedDescription ?: @"无法读取文件类型元数据"});
            if (!type) return encode(@{@"error": @"系统未返回文件类型元数据"});
            return encode(@{@"type": @{@"identifier":type.identifier, @"name":type.localizedDescription ?: type.identifier,
                @"extensions":type.tags[UTTagClassFilenameExtension] ?: @[], @"mimeTypes":type.tags[UTTagClassMIMEType] ?: @[],
                @"declared":@(type.isDeclared), @"dynamic":@(type.isDynamic)}});
        } @catch (NSException *exception) { return encode(@{@"error":exception.reason ?: @"文件类型识别失败"}); }
    }
}
