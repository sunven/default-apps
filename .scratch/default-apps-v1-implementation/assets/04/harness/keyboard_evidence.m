//go:build darwin && cgo && native_keyboard
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <stdlib.h>
static WKWebView *findWebView(NSView *view){if([view isKindOfClass:WKWebView.class])return (WKWebView *)view;for(NSView *child in view.subviews){WKWebView *found=findWebView(child);if(found)return found;}return nil;}
char *keyboard_evidence(void *handle,const char *action,const char *key,int code,unsigned long flags){
 NSWindow *window=(__bridge NSWindow *)handle;WKWebView *web=findWebView(window.contentView);NSString *what=@(action);BOOL menuMatched=NO;
 if([what isEqualToString:@"key"]){
  [NSApp activateIgnoringOtherApps:YES];[window makeKeyAndOrderFront:nil];
  NSString *characters=@(key);
  NSEvent *down=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:flags timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil characters:characters charactersIgnoringModifiers:characters isARepeat:NO keyCode:code];
  [NSApp sendEvent:down];
  NSEvent *up=[NSEvent keyEventWithType:NSEventTypeKeyUp location:NSZeroPoint modifierFlags:flags timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil characters:characters charactersIgnoringModifiers:characters isARepeat:NO keyCode:code];[NSApp sendEvent:up];
 } else if([what isEqualToString:@"menu"]){
  NSEvent *event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:flags timestamp:0 windowNumber:window.windowNumber context:nil characters:@(key) charactersIgnoringModifiers:@(key) isARepeat:NO keyCode:code];menuMatched=[NSApp.mainMenu performKeyEquivalent:event];
 } else if([what isEqualToString:@"snapshot"]){
  NSString *path=@(key);[web takeSnapshotWithConfiguration:nil completionHandler:^(NSImage *image,NSError *error){if(image){NSBitmapImageRep *rep=[NSBitmapImageRep imageRepWithData:image.TIFFRepresentation];[[rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:path atomically:YES];}}];
 }
 NSMutableArray *menus=[NSMutableArray array];for(NSMenuItem *item in NSApp.mainMenu.itemArray){NSMutableArray *children=[NSMutableArray array];for(NSMenuItem *child in item.submenu.itemArray)[children addObject:@{@"title":child.title,@"key":child.keyEquivalent}];[menus addObject:@{@"title":item.title,@"children":children}];}
 NSDictionary *result=@{@"action":what,@"key":@(key),@"menuMatched":@(menuMatched),@"tabFocusesLinks":@(web.configuration.preferences.tabFocusesLinks),@"keyboardUIMode":[NSUserDefaults.standardUserDefaults objectForKey:@"AppleKeyboardUIMode"]?:NSNull.null,@"frame":@[@(window.frame.size.width),@(window.frame.size.height)],@"content":@[@(window.contentLayoutRect.size.width),@(window.contentLayoutRect.size.height)],@"minimumContent":@[@(window.contentMinSize.width),@(window.contentMinSize.height)],@"menus":menus};
 NSData *data=[NSJSONSerialization dataWithJSONObject:result options:0 error:nil];return strdup([[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
}
