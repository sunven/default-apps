#!/usr/bin/env python3
"""Build the exact archive consumed by the updater, without publishing it."""
import hashlib
import pathlib
import plistlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION = (ROOT / 'internal/buildinfo/version.txt').read_text().strip()
bundle = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'bin/default-apps.app').resolve()
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / 'bin/release').resolve()
if not bundle.is_dir() or bundle.name != 'default-apps.app':
    raise SystemExit('Expected a built default-apps.app')
info = plistlib.loads(subprocess.check_output(['/usr/bin/plutil', '-convert', 'xml1', '-o', '-', str(bundle / 'Contents/Info.plist')]))
for key, value in {'CFBundleIdentifier': 'io.github.sunven.default-apps', 'CFBundleExecutable': 'default-apps', 'CFBundleVersion': VERSION, 'CFBundleShortVersionString': VERSION}.items():
    if info.get(key) != value:
        raise SystemExit(f'{key} does not match release identity/version')
binary = bundle / 'Contents/MacOS/default-apps'
if subprocess.check_output([str(binary), '--version'], text=True, timeout=10).strip() != VERSION:
    raise SystemExit('Executable version does not match release version; rebuild the application')
arch = subprocess.check_output(['/usr/bin/lipo', '-archs', str(binary)], text=True).strip()
if arch != 'arm64':
    raise SystemExit(f'Expected ARM64 only; got {arch}')
subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(bundle)], check=True)
out.mkdir(parents=True, exist_ok=True)
archive = out / 'default-apps-darwin-arm64.zip'
archive.unlink(missing_ok=True)
subprocess.run(['/usr/bin/ditto', '-c', '-k', '--norsrc', '--keepParent', str(bundle), str(archive)], check=True)
with zipfile.ZipFile(archive) as file:
    if file.testzip() is not None:
        raise SystemExit('Invalid ZIP')
    entries = file.namelist()
    if not entries or any(name.split('/')[0] != bundle.name or '..' in pathlib.PurePosixPath(name).parts for name in entries):
        raise SystemExit('Archive must contain exactly the application bundle')
    if f'{bundle.name}/Contents/MacOS/default-apps' not in entries:
        raise SystemExit('Archive executable missing')
with archive.open('rb') as file:
    digest = hashlib.file_digest(file, 'sha256').hexdigest()
(out / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
(out / 'INSTALL.md').write_text(f'''# Default Apps {VERSION}

仅支持 macOS Apple Silicon。下载并解压 ZIP，将 default-apps.app 移至可写的应用目录。
本应用不提供 Developer ID 签名或公证。首次手动安装后，如被 macOS 隔离，请在终端按实际路径执行：

```sh
xattr -dr com.apple.quarantine "/Applications/default-apps.app"
```

然后重新打开应用。此版本内置软件更新；只有主动下载并确认重启安装后才替换当前应用副本。
SHA256SUMS 用于下载完整性校验。更新包不使用密钥签名。
''')
print(f'{archive}\nSHA-256 {digest}')
