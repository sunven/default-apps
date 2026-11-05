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
 @autoreleasepool {
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
  NSDictionary *before=@{@"found":@YES,@"class":NSStringFromClass(panel.class),@"title":panel.title ?: @"",@"directory":panel.directoryURL.path ?: @"",@"files":@(panel.canChooseFiles),@"directories":@(panel.canChooseDirectories),@"packagesAsDirectories":@(panel.treatsFilePackagesAsDirectories),@"action":action};
  if([action isEqualToString:@"cancel"]) [panel cancel:nil];
  if([action isEqualToString:@"path"]) {NSURL *url=[NSURL fileURLWithPath:@(path)];panel.directoryURL=url.URLByDeletingLastPathComponent;panel.nameFieldStringValue=url.lastPathComponent;[panel validateVisibleColumns];}
  if([action isEqualToString:@"open"]) [panel ok:nil];
  return report(before);
 }
}
