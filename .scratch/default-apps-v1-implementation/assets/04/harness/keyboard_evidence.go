//go:build darwin && cgo && native_keyboard
package main
/*
#cgo CFLAGS: -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -framework AppKit -framework WebKit
#include <stdlib.h>
char *keyboard_evidence(void *window, const char *action, const char *key, int code, unsigned long flags);
*/
import "C"
import (
 "encoding/json"
 "net/http"
 "unsafe"
 "github.com/wailsapp/wails/v3/pkg/application"
)
func init(){go func(){mux:=http.NewServeMux();mux.HandleFunc("/action",func(w http.ResponseWriter,r *http.Request){
 var in struct{Action,Key string; Code int; Flags uint64}
 if err:=json.NewDecoder(r.Body).Decode(&in);err!=nil{http.Error(w,err.Error(),400);return}
 result:=application.InvokeSyncWithResult(func()string{
  app:=application.Get();window,ok:=app.Window.GetByName("main");if !ok{return `{}`}
  action,key:=C.CString(in.Action),C.CString(in.Key);defer C.free(unsafe.Pointer(action));defer C.free(unsafe.Pointer(key))
  out:=C.keyboard_evidence(window.(*application.WebviewWindow).NativeWindow(),action,key,C.int(in.Code),C.ulong(in.Flags));defer C.free(unsafe.Pointer(out));return C.GoString(out)
 });w.Header().Set("Content-Type","application/json");_,_=w.Write([]byte(result))
 });_ = http.ListenAndServe("127.0.0.1:9106",mux)}()}
