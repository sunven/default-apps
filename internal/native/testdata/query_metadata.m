#import <objc/runtime.h>
#include "../native_darwin.m"

static NSURL *fixtureURL;

static NSURL *defaultURL(id self, SEL selector, id input) { return fixtureURL; }
static NSArray *candidateURLs(id self, SEL selector, id input) { return @[fixtureURL]; }

static BOOL expectMetadata(NSString *name, NSString *version, NSString *bundleID, BOOL usable) {
    for (NSString *kind in @[@"file", @"scheme"]) {
        for (int candidates = 0; candidates <= 1; candidates++) {
            const char *key = [kind isEqualToString:@"file"] ? "public.plain-text" : "test-metadata";
            char *json = default_apps_query(kind.UTF8String, key, candidates);
            NSDictionary *result = json ? [NSJSONSerialization JSONObjectWithData:[@(json) dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
            free(json);
            NSDictionary *app = candidates ? [result[@"apps"] firstObject] : result[@"app"];
            if (![app isKindOfClass:NSDictionary.class] ||
                ![app[@"name"] isEqual:name] || ![app[@"version"] isEqual:version] ||
                ![app[@"bundleID"] isEqual:bundleID] ||
                ([app[@"metadataError"] length] == 0) != usable) {
                fprintf(stderr, "%s candidates=%d: expected name=%s version=%s bundleID=%s usable=%d; got name=%s version=%s bundleID=%s metadataError=%s queryError=%s\n",
                    kind.UTF8String, candidates, name.UTF8String, version.UTF8String, bundleID.UTF8String, usable,
                    [app[@"name"] UTF8String], [app[@"version"] UTF8String], [app[@"bundleID"] UTF8String],
                    [app[@"metadataError"] UTF8String], [result[@"error"] UTF8String]);
                return NO;
            }
            char *scanJSON = default_apps_read_application(fixtureURL.fileSystemRepresentation);
            NSDictionary *scan = scanJSON ? [NSJSONSerialization JSONObjectWithData:[@(scanJSON) dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
            free(scanJSON);
            for (NSString *field in @[@"path", @"displayPath", @"name", @"version", @"bundleID", @"system", @"metadataError"]) {
                if (![app[field] isEqual:scan[@"app"][field]]) {
                    fprintf(stderr, "query and scan disagree on %s\n", field.UTF8String);
                    return NO;
                }
            }
        }
    }
    return YES;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        fixtureURL = [NSURL fileURLWithPath:@(argv[1])];
        NSURL *contents = [fixtureURL URLByAppendingPathComponent:@"Contents"];
        NSError *error = nil;
        if (![NSFileManager.defaultManager createDirectoryAtURL:contents withIntermediateDirectories:YES attributes:nil error:&error]) {
            fprintf(stderr, "create fixture: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
        NSString *plist = [contents URLByAppendingPathComponent:@"Info.plist"].path;
        method_setImplementation(class_getInstanceMethod(NSWorkspace.class, @selector(URLForApplicationToOpenContentType:)), (IMP)defaultURL);
        method_setImplementation(class_getInstanceMethod(NSWorkspace.class, @selector(URLForApplicationToOpenURL:)), (IMP)defaultURL);
        method_setImplementation(class_getInstanceMethod(NSWorkspace.class, @selector(URLsForApplicationsToOpenContentType:)), (IMP)candidateURLs);
        method_setImplementation(class_getInstanceMethod(NSWorkspace.class, @selector(URLsForApplicationsToOpenURL:)), (IMP)candidateURLs);

        [@{@"CFBundleDisplayName": @"Before", @"CFBundleShortVersionString": @"1", @"CFBundleIdentifier": @"test.before"} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"Before", @"1", @"test.before", YES)) return 1;
        [@{@"CFBundleName": @"After", @"CFBundleVersion": @"2", @"CFBundleIdentifier": @"test.after"} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"After", @"2", @"test.after", YES)) return 1;
        [@{} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"Reader", @"", @"", YES)) return 1;
        [@{@"CFBundleDisplayName": @42, @"CFBundleName": @"Fallback", @"CFBundleShortVersionString": @42, @"CFBundleVersion": @"3", @"CFBundleIdentifier": @42} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"Fallback", @"3", @"", YES)) return 1;
        [@{@"CFBundleDisplayName": @"", @"CFBundleName": @"Empty fallback", @"CFBundleShortVersionString": @"", @"CFBundleVersion": @"4"} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"Empty fallback", @"4", @"", YES)) return 1;
        [@"broken plist" writeToFile:plist atomically:YES encoding:NSUTF8StringEncoding error:nil];
        if (!expectMetadata(@"Reader", @"", @"", NO)) return 1;
        [@{@"CFBundleName": @"Repaired", @"CFBundleVersion": @"5", @"CFBundleIdentifier": @"test.repaired"} writeToFile:plist atomically:YES];
        if (!expectMetadata(@"Repaired", @"5", @"test.repaired", YES)) return 1;
        [NSFileManager.defaultManager removeItemAtPath:plist error:nil];
        if (!expectMetadata(@"Reader", @"", @"", NO)) return 1;
    }
    return 0;
}
