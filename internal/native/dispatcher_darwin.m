//go:build darwin && cgo

#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <string.h>
#include "native.h"
#include "_cgo_export.h"

static void finish(uint64_t operation, NSError *error) {
    @autoreleasepool {
        // NSError and its properties never cross into Go. Owned byte copies
        // remain valid through the synchronous export, on any callback thread.
        char *domain = error ? strdup(error.domain.UTF8String ?: "") : NULL;
        char *description = error ? strdup(error.localizedDescription.UTF8String ?: "") : NULL;
#ifdef DEFAULT_APPS_NATIVE_ACCEPTANCE
        NSDictionary *trace = @{@"event":@"native-completion",@"operation":@(operation),@"mainThread":@(NSThread.isMainThread),@"error":error ? @{@"domain":error.domain,@"code":@(error.code),@"description":error.localizedDescription} : (id)NSNull.null};
        fprintf(stderr,"NATIVE_ACCEPTANCE %s\n",[[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:trace options:0 error:nil] encoding:NSUTF8StringEncoding].UTF8String);
#endif
        defaultAppsNativeCompleted(operation, error != nil, domain, (int64_t)error.code, description);
        free(domain);
        free(description);
    }
}

static NSError *adapterError(NSInteger code, NSString *message) {
    return [NSError errorWithDomain:@"defaultapps.native" code:code userInfo:@{NSLocalizedDescriptionKey:message}];
}

void default_apps_set_file_type(uint64_t operation, const char *identifier, const char *path) {
    @autoreleasepool {
#ifdef DEFAULT_APPS_ADAPTER_TEST
        // Controlled NSWorkspace boundary only; never linked into deliverables.
        BOOL success = strcmp(identifier,"test.success") == 0;
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT,0), ^{
            @autoreleasepool {
                NSError *error = success ? nil : [NSError errorWithDomain:@"org.defaultapps.test.native" code:-709 userInfo:@{NSLocalizedDescriptionKey:@"异步原生错误：保留完整字段"}];
                finish(operation,error);
                finish(operation,error);
            }
        });
        return;
#endif
        if (!NSThread.isMainThread) {
            finish(operation, adapterError(2, @"原生修改未在主线程调度。"));
            return;
        }
        @try {
            // ARC strongly owns Foundation copies through initiation. AppKit
            // owns the asynchronous block; it captures no Go/C buffer pointer.
            NSString *key = [[NSString alloc] initWithUTF8String:identifier];
            NSString *bundlePath = [[NSString alloc] initWithUTF8String:path];
            UTType *type = [UTType typeWithIdentifier:key];
            if (!type || type.isDynamic || !type.isDeclared) {
                finish(operation, adapterError(3, @"系统无法解析此文件类型。"));
                return;
            }
            NSURL *applicationURL = [NSURL fileURLWithPath:bundlePath];
            void (^completion)(NSError *) = ^(NSError *error) { finish(operation, error); };
#ifdef DEFAULT_APPS_NATIVE_ACCEPTANCE
            NSDictionary *trace = @{@"event":@"native-start",@"operation":@(operation),@"mainThread":@(NSThread.isMainThread),@"kind":@"file",@"key":key,@"targetPath":bundlePath};
            fprintf(stderr,"NATIVE_ACCEPTANCE %s\n",[[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:trace options:0 error:nil] encoding:NSUTF8StringEncoding].UTF8String);
#endif
            [NSWorkspace.sharedWorkspace setDefaultApplicationAtURL:applicationURL
                toOpenContentType:type completionHandler:completion];
        } @catch (NSException *exception) {
            finish(operation, [NSError errorWithDomain:@"defaultapps.native.exception" code:1
                userInfo:@{NSLocalizedDescriptionKey:exception.reason ?: @"无法发起系统修改。"}]);
        }
    }
}
