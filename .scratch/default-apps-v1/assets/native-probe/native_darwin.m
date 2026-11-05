// THROWAWAY: native observation only; callers must gate real setters.
#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include "native.h"

extern void goProbeCompletion(uint64_t operation, char *json);

static char *encode(id value) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    return strdup([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}

int probe_main_thread(void) { return NSThread.isMainThread; }

char *probe_query(const char *kind, const char *key) {
    @autoreleasepool {
        NSString *k = @(key);
        NSWorkspace *ws = NSWorkspace.sharedWorkspace;
        NSURL *current = nil;
        NSArray<NSURL *> *candidates = @[];
        BOOL resolved = YES;
        if (strcmp(kind, "type") == 0) {
            UTType *type = [UTType typeWithIdentifier:k];
            resolved = type != nil;
            if (type) {
                current = [ws URLForApplicationToOpenContentType:type];
                candidates = [ws URLsForApplicationsToOpenContentType:type];
            }
        } else {
            NSURL *url = [NSURL URLWithString:[k stringByAppendingString:@":probe"]];
            if (url) {
                current = [ws URLForApplicationToOpenURL:url];
                candidates = [ws URLsForApplicationsToOpenURL:url];
            } else { resolved = NO; }
        }
        NSMutableArray *paths = [NSMutableArray array];
        for (NSURL *url in candidates) [paths addObject:url.path];
        return encode(@{@"kind": @(kind), @"key": k, @"resolved": @(resolved),
                        @"current": current.path ?: (id)NSNull.null,
                        @"candidates": paths, @"queryMainThread": @(NSThread.isMainThread)});
    }
}

static void complete(uint64_t operation, NSError *error, BOOL synthetic) {
    @autoreleasepool {
        uint64_t thread = 0;
        pthread_threadid_np(NULL, &thread);
        id details = error ? @{@"domain": error.domain, @"code": @(error.code),
                              @"description": error.localizedDescription} : (id)NSNull.null;
        char *json = encode(@{@"error": details, @"synthetic": @(synthetic),
                              @"callbackMainThread": @(NSThread.isMainThread),
                              @"callbackThread": @(thread)});
        goProbeCompletion(operation, json);
        free(json);
    }
}

void probe_delayed(uint64_t operation, int milliseconds) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)milliseconds * NSEC_PER_MSEC),
                   dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
        complete(operation, nil, YES);
    });
}

void probe_submit(uint64_t operation, const char *kind, const char *key, const char *path) {
    @autoreleasepool {
        NSWorkspace *ws = NSWorkspace.sharedWorkspace;
        NSURL *app = [NSURL fileURLWithPath:@(path)];
        void (^completion)(NSError *) = ^(NSError *error) { complete(operation, error, NO); };
        if (strcmp(kind, "type") == 0) {
            UTType *type = [UTType typeWithIdentifier:@(key)];
            if (!type) {
                complete(operation, [NSError errorWithDomain:@"DefaultAppsProbe" code:1
                    userInfo:@{NSLocalizedDescriptionKey: @"测试类型尚未注册"}], NO);
                return;
            }
            [ws setDefaultApplicationAtURL:app toOpenContentType:type completionHandler:completion];
        } else {
            [ws setDefaultApplicationAtURL:app toOpenURLsWithScheme:@(key) completionHandler:completion];
        }
    }
}

