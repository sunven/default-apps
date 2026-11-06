//go:build manual_smoke && darwin && cgo

#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <string.h>

static char *report(NSDictionary *data) {return strdup([[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:data options:0 error:nil] encoding:NSUTF8StringEncoding].UTF8String);}
static WKWebView *webview(NSView *view) {
 if ([view isKindOfClass:WKWebView.class]) return (WKWebView *)view;
 for (NSView *child in view.subviews) {WKWebView *found=webview(child);if(found)return found;}
 return nil;
}
char *manual_smoke_panel(const char *command,const char *path) {
 @autoreleasepool { @try {
  if (strcmp(command,"deactivate")==0) {[NSApp deactivate];return report(@{@"active":@(NSApp.active)});}
  if (strcmp(command,"activate")==0) {
   [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];[NSApp unhide:nil];
   NSMutableArray *windows=[NSMutableArray array];
   for(NSWindow *window in NSApp.windows) {if(webview(window.contentView)){[window orderFrontRegardless];[window makeKeyAndOrderFront:nil];}[windows addObject:@{@"class":NSStringFromClass(window.class),@"visible":@(window.visible),@"key":@(window.keyWindow),@"title":window.title ?: @""}];}
   [NSApp activateIgnoringOtherApps:YES];
   return report(@{@"windows":windows,@"active":@(NSApp.active),@"hidden":@(NSApp.hidden),@"policy":@(NSApp.activationPolicy)});
  }
  if (strcmp(command,"snapshot")==0) {
   for(NSWindow *window in NSApp.windows) {
    WKWebView *web=webview(window.contentView);
    if(web){NSString *output=@(path);[web takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image,NSError *error){if(image){NSBitmapImageRep *bitmap=[NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];[[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:output atomically:YES];}}];return report(@{@"snapshotScheduled":@YES});}
   }
   return report(@{@"snapshotScheduled":@NO});
  }
  NSOpenPanel *panel=nil;
  for (NSWindow *window in NSApp.windows) {if([window isKindOfClass:NSOpenPanel.class] && window.isVisible){panel=(NSOpenPanel *)window;break;} if([window.attachedSheet isKindOfClass:NSOpenPanel.class]) {panel=(NSOpenPanel *)window.attachedSheet;break;}}
  if(!panel)return report(@{@"found":@NO});
  NSString *action=@(command);
  NSDictionary *before=@{@"found":@YES,@"class":NSStringFromClass(panel.class),@"title":panel.title ?: @"",@"directory":panel.directoryURL.path ?: @"",@"files":@(panel.canChooseFiles),@"directories":@(panel.canChooseDirectories),@"packagesAsDirectories":@(panel.treatsFilePackagesAsDirectories),@"action":action,@"nameField":panel.nameFieldStringValue ?: @"",@"URLs":[panel.URLs valueForKey:@"path"] ?: @[],@"key":@(panel.isKeyWindow),@"responder":NSStringFromClass(panel.firstResponder.class)};
  if([action isEqualToString:@"cancel"]) [panel cancel:nil];
  if([action isEqualToString:@"path"]) {NSURL *url=[NSURL fileURLWithPath:@(path)];panel.directoryURL=url.URLByDeletingLastPathComponent;panel.nameFieldStringValue=url.lastPathComponent;[panel validateVisibleColumns];}
  if([action isEqualToString:@"open"]) {
   [panel makeKeyAndOrderFront:nil];
   NSEvent *event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:panel.windowNumber context:nil characters:@"\r" charactersIgnoringModifiers:@"\r" isARepeat:NO keyCode:36];
   [NSApp sendEvent:event];
   NSEvent *up=[NSEvent keyEventWithType:NSEventTypeKeyUp location:NSZeroPoint modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:panel.windowNumber context:nil characters:@"\r" charactersIgnoringModifiers:@"\r" isARepeat:NO keyCode:36];[NSApp sendEvent:up];
  }
  if([action isEqualToString:@"goto"]) {
   [NSApp activateIgnoringOtherApps:YES];[panel makeKeyAndOrderFront:nil];
   NSEvent *event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:NSEventModifierFlagCommand|NSEventModifierFlagShift timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:panel.windowNumber context:nil characters:@"g" charactersIgnoringModifiers:@"g" isARepeat:NO keyCode:5];[NSApp sendEvent:event];
  }
  if([action isEqualToString:@"text"]) {
   [panel makeKeyAndOrderFront:nil];
   for(NSUInteger index=0;index<[@(path) length];index++) {NSString *character=[@(path) substringWithRange:NSMakeRange(index,1)];NSEvent *event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:panel.windowNumber context:nil characters:character charactersIgnoringModifiers:character isARepeat:NO keyCode:0];[NSApp sendEvent:event];}
  }
  return report(before);
 } @catch(NSException *exception) {return report(@{@"exception":exception.reason ?: @"native helper exception"});}
 }
}
