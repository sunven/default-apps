//go:build darwin && cgo && native_acceptance

package native

/*
#cgo CFLAGS: -DDEFAULT_APPS_NATIVE_ACCEPTANCE
*/
import "C"
