// Dedicated, disposable Launch Services candidates. Never open user content.
#import <AppKit/AppKit.h>
int main(int argc, const char *argv[]) {
    @autoreleasepool { [NSApplication sharedApplication]; [NSApp run]; }
    return 0;
}
