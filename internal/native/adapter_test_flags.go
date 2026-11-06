//go:build darwin && cgo && native_adapter_test

package native

/*
#cgo CFLAGS: -DDEFAULT_APPS_ADAPTER_TEST
*/
import "C"
