//go:build lifecycle_smoke && darwin && cgo
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#include <string.h>
static char *life_report(NSDictionary *data){return strdup([[NSString alloc]initWithData:[NSJSONSerialization dataWithJSONObject:data options:0 error:nil] encoding:NSUTF8StringEncoding].UTF8String);}
static NSMenuItem *quit_item(NSMenu *menu){for(NSMenuItem *item in menu.itemArray){if([item.keyEquivalent.lowercaseString isEqualToString:@"q"]&&(item.keyEquivalentModifierMask&NSEventModifierFlagCommand))return item;if(item.submenu){NSMenuItem *found=quit_item(item.submenu);if(found)return found;}}return nil;}
char *lifecycle_smoke_action(void *pointer,const char *command){@autoreleasepool{@try{
 NSWindow *window=(__bridge NSWindow *)pointer;NSString *action=@(command);
 if([action isEqualToString:@"menu"]){NSMenuItem *item=quit_item(NSApp.mainMenu);if(!item)return life_report(@{@"action":action,@"matched":@NO});NSString *title=item.title;[item.menu performActionForItemAtIndex:[item.menu indexOfItem:item]];return life_report(@{@"action":action,@"matched":@YES,@"title":title});}
 if([action isEqualToString:@"cmd-q"]){NSEvent *event=[NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:NSEventModifierFlagCommand timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil characters:@"q" charactersIgnoringModifiers:@"q" isARepeat:NO keyCode:12];BOOL matched=[NSApp.mainMenu performKeyEquivalent:event];return life_report(@{@"action":action,@"matched":@(matched)});}
 if([action isEqualToString:@"close"]){[window performClose:nil];return life_report(@{@"action":action,@"performed":@YES,@"visible":@(window.visible)});}
 if([action isEqualToString:@"geometry"]){NSRect bounds=window.contentLayoutRect;return life_report(@{@"contentWidth":@(bounds.size.width),@"contentHeight":@(bounds.size.height),@"visible":@(window.visible)});}
 if([action isEqualToString:@"minimum"]){[window setFrame:[window frameRectForContentRect:NSMakeRect(100,100,1000,700)] display:YES];return life_report(@{@"resized":@YES});}
 if([action isEqualToString:@"escape"]||[action isEqualToString:@"tab"]||[action isEqualToString:@"shift-tab"]){[NSApp activateIgnoringOtherApps:YES];[window makeKeyAndOrderFront:nil];BOOL escape=[action isEqualToString:@"escape"];NSString *characters=escape?@"\033":@"\t";NSEventModifierFlags modifiers=[action isEqualToString:@"shift-tab"]?NSEventModifierFlagShift:0;for(NSNumber *kind in @[@(NSEventTypeKeyDown),@(NSEventTypeKeyUp)]){NSEvent *event=[NSEvent keyEventWithType:kind.unsignedIntegerValue location:NSZeroPoint modifierFlags:modifiers timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil characters:characters charactersIgnoringModifiers:characters isARepeat:NO keyCode:escape?53:48];[NSApp sendEvent:event];}return life_report(@{@"action":action,@"sent":@YES});}
 return life_report(@{@"error":@"unknown native action"});
 }@catch(NSException *exception){return life_report(@{@"exception":exception.reason?:@"native exception"});}}}
