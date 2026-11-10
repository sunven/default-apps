#import <AppKit/AppKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
static NSDictionary *errorInfo(NSError *error) {
 if (!error) return @{};
 NSMutableDictionary *info=[@{@"domain":error.domain,@"code":@(error.code),@"description":error.localizedDescription,@"details":error.userInfo.description} mutableCopy];
 NSError *underlying=error.userInfo[NSUnderlyingErrorKey];
 if(underlying)info[@"underlying"]=errorInfo(underlying);
 return info;
}
int main(int argc,const char **argv) {@autoreleasepool {
 if(argc!=3)return 2;
 [NSApplication sharedApplication];
 NSString *identifier=@(argv[1]),*path=@(argv[2]);
 UTType *type=[UTType typeWithIdentifier:identifier];
 if(!type)return 3;
 [NSWorkspace.sharedWorkspace setDefaultApplicationAtURL:[NSURL fileURLWithPath:path] toOpenContentType:type completionHandler:^(NSError *error){
  NSDictionary *report=@{@"type":identifier,@"target":path,@"error":error?(id)errorInfo(error):NSNull.null};
  NSData *json=[NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
  puts([[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
  exit(error?1:0);
 }];
 [NSApp run];
}}
