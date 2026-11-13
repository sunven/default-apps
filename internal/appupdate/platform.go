package appupdate

import (
	"debug/macho"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const bundleID = "io.github.sunven.default-apps"

// installLocation accepts only the current canonical bundle, without elevation.
func installLocation(executable string) (string, error) {
	real, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return "", err
	}
	if filepath.Base(real) != "default-apps" || filepath.Base(filepath.Dir(real)) != "MacOS" || filepath.Base(filepath.Dir(filepath.Dir(real))) != "Contents" {
		return "", errors.New("请从已安装的 Default Apps.app 运行；开发程序不能安装更新。")
	}
	app := filepath.Dir(filepath.Dir(filepath.Dir(real)))
	if !strings.HasSuffix(app, ".app") {
		return "", errors.New("当前程序不是应用包。")
	}
	// Wails selects the outermost .app in the unresolved executable path.
	// Every bundle component in either path must identify this same copy.
	for _, path := range []string{real, executable} {
		for parent := filepath.Dir(path); parent != filepath.Dir(parent); parent = filepath.Dir(parent) {
			if !strings.HasSuffix(parent, ".app") {
				continue
			}
			target, err := filepath.EvalSymlinks(parent)
			if err != nil || target != app {
				return "", errors.New("当前启动路径包含其他应用包，无法安全安装更新。请将 Default Apps.app 移到独立目录后重新打开。")
			}
		}
	}
	if strings.Contains(app, "/AppTranslocation/") {
		return "", errors.New("请先将应用移到可写的应用目录，再重新打开以安装更新。")
	}
	probe, err := os.MkdirTemp(filepath.Dir(app), ".default-apps-write-check-*")
	if err != nil {
		return "", errors.New("应用所在目录不可写，请从发布页下载并手动安装。")
	}
	if err = os.Remove(probe); err != nil {
		return "", err
	}
	return app, nil
}

// validateBundle runs before the helper exists, so a wrong product/version or
// malformed bundle cannot displace the running application.
func validateBundle(path, version string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || !strings.HasSuffix(path, ".app") {
		return errors.New("更新包不是有效的 macOS 应用。")
	}
	plist := filepath.Join(path, "Contents", "Info.plist")
	for key, want := range map[string]string{"CFBundleIdentifier": bundleID, "CFBundleExecutable": "default-apps", "CFBundleShortVersionString": version, "CFBundleVersion": version} {
		out, err := exec.Command("/usr/bin/plutil", "-extract", key, "raw", "-o", "-", plist).Output()
		if err != nil || strings.TrimSpace(string(out)) != want {
			return fmt.Errorf("更新包的 %s 与发布版本不一致。", key)
		}
	}
	binary := filepath.Join(path, "Contents", "MacOS", "default-apps")
	info, err = os.Stat(binary)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&0111 == 0 {
		return errors.New("更新包缺少可执行程序。")
	}
	f, err := macho.Open(binary)
	if err != nil {
		return err
	}
	defer f.Close()
	if f.Cpu != macho.CpuArm64 {
		return errors.New("更新包不适用于 Apple Silicon。")
	}
	out, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", path).CombinedOutput()
	if err != nil {
		return fmt.Errorf("应用包完整性检查失败：%s", strings.TrimSpace(string(out)))
	}
	return nil
}
