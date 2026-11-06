//go:build darwin && cgo && native_adapter_test

package native

import (
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
)

// Only the external Wails main-thread queue and NSWorkspace completion are
// controlled. Dispatch and its C/Go ownership conversion run unchanged.
func TestDispatchKeepsCompletionAfterCallerReturnsAndCopiesNativeError(t *testing.T) {
	queue := make(chan func(), 1)
	original := invokeOnMain
	invokeOnMain = func(fn func()) { queue <- fn }
	t.Cleanup(func() { invokeOnMain = original })
	started := make(chan struct{}, 1)
	result := make(chan *change.NativeError, 2)
	Dispatcher{}.Dispatch(association.Association{Kind: "file", Key: "test.error"}, association.AppCopy{Path: "/Dedicated/Target.app"}, func() { started <- struct{}{} }, func(err *change.NativeError) { result <- err })
	select {
	case <-started:
		t.Fatal("queued request was reported as submitted before initiation")
	default:
	}
	(<-queue)()
	<-started
	select {
	case err := <-result:
		if err == nil || err.Domain != "org.defaultapps.test.native" || err.Code != -709 || err.Description != "异步原生错误：保留完整字段" {
			t.Fatalf("copied error = %#v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("native completion was lost")
	}
	select {
	case second := <-result:
		t.Fatalf("duplicate completion reached caller: %#v", second)
	case <-time.After(30 * time.Millisecond):
	}
}

func TestOverlappingFileAndSchemeCallbacksKeepTheirOriginalTargets(t *testing.T) {
	queue := make(chan func(), 2)
	original := invokeOnMain
	invokeOnMain = func(fn func()) { queue <- fn }
	t.Cleanup(func() { invokeOnMain = original })
	errorResult, successResult := make(chan *change.NativeError, 2), make(chan *change.NativeError, 2)
	Dispatcher{}.Dispatch(association.Association{Kind: "file", Key: "test.error"}, association.AppCopy{Path: "/Dedicated/A.app"}, func() {}, func(err *change.NativeError) { errorResult <- err })
	Dispatcher{}.Dispatch(association.Association{Kind: "scheme", Key: "test-success"}, association.AppCopy{Path: "/Dedicated/B.app"}, func() {}, func(err *change.NativeError) { successResult <- err })
	first, second := <-queue, <-queue
	second()
	first()
	for _, expected := range []struct {
		result  chan *change.NativeError
		success bool
	}{{successResult, true}, {errorResult, false}} {
		select {
		case err := <-expected.result:
			if (err == nil) != expected.success {
				t.Fatalf("completion went to the wrong request: success=%v error=%#v", expected.success, err)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("completion was lost")
		}
	}
}

func TestSchemeDispatchOwnsErrorCompletionAcrossDeferredScheduling(t *testing.T) {
	queue := make(chan func(), 1)
	original := invokeOnMain
	invokeOnMain = func(fn func()) { queue <- fn }
	t.Cleanup(func() { invokeOnMain = original })
	result := make(chan *change.NativeError, 2)
	started := make(chan struct{}, 1)
	Dispatcher{}.Dispatch(association.Association{Kind: "scheme", Key: "test-error"}, association.AppCopy{Path: "/Dedicated/Scheme.app"}, func() { started <- struct{}{} }, func(err *change.NativeError) { result <- err })
	select {
	case fn := <-queue:
		select {
		case <-started:
			t.Fatal("reported submission before native initiation")
		default:
		}
		fn()
	case err := <-result:
		t.Fatalf("scheme must reach the queued native boundary: %#v", err)
	case <-time.After(time.Second):
		t.Fatal("scheme never reached native boundary")
	}
	<-started
	select {
	case err := <-result:
		if err == nil || err.Domain != "org.defaultapps.test.native" || err.Code != -709 || err.Description != "异步原生错误：保留完整字段" {
			t.Fatalf("copied scheme error = %#v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("scheme completion lost")
	}
	select {
	case err := <-result:
		t.Fatalf("duplicate scheme completion: %#v", err)
	case <-time.After(30 * time.Millisecond):
	}
}
