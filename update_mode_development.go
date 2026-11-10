//go:build !production

package main

func updateDisabledReason() string { return "开发版本不检查或安装更新。" }
