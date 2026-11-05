#!/usr/bin/env python3
"""Build only. Does not register bundles, launch them, or change associations."""
from pathlib import Path
import json
import os
import plistlib
import shutil
import subprocess
import uuid

root = Path(__file__).resolve().parent
out = root / 'out'
out.mkdir(exist_ok=True)
manifest_path = root / 'manifest.json'
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
else:
    token = uuid.uuid4().hex[:8]
    manifest = {'type': f'org.defaultapps.probe.{token}.document',
                'scheme': f'defaultapps-probe-{token}', 'token': token, 'targets': {}}

def bundle(name, binary, identifier, declarations=False):
    path = out / 'fixtures' / (name + '.app')
    (path / 'Contents/MacOS').mkdir(parents=True, exist_ok=True)
    shutil.copy2(binary, path / 'Contents/MacOS/fixture')
    info = {'CFBundleName': name, 'CFBundleIdentifier': identifier, 'CFBundlePackageType': 'APPL',
            'CFBundleExecutable': 'fixture', 'CFBundleVersion': '1', 'CFBundleShortVersionString': '0.1',
            'LSMinimumSystemVersion': '13.0', 'NSHighResolutionCapable': True}
    if declarations:
        info['CFBundleDocumentTypes'] = [{'CFBundleTypeName': 'Default Apps Probe Document',
            'CFBundleTypeRole': 'Viewer', 'LSHandlerRank': 'Alternate', 'LSItemContentTypes': [manifest['type']]}]
        info['UTExportedTypeDeclarations'] = [{'UTTypeIdentifier': manifest['type'],
            'UTTypeConformsTo': ['public.data'], 'UTTypeDescription': 'Default Apps Probe Document',
            'UTTypeTagSpecification': {'public.filename-extension': 'dafp' + manifest['token']}}]
        info['CFBundleURLTypes'] = [{'CFBundleURLName': 'Default Apps Probe Scheme',
            'CFBundleURLSchemes': [manifest['scheme']], 'CFBundleTypeRole': 'Viewer'}]
    (path / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    subprocess.run(['codesign', '--force', '--sign', '-', str(path)], check=True, capture_output=True)
    return str(path)

subprocess.run(['xcrun', 'clang', '-fobjc-arc', '-mmacosx-version-min=13.0', '-framework', 'AppKit',
    str(root / 'fixture-source/fixture.m'), '-o', str(out / 'fixture')], check=True)
for target, name, suffix, declared in [
    ('a', 'Probe Candidate A', 'candidate-a', True),
    ('b', 'Probe Candidate B', 'candidate-b', True),
    ('copy', 'Probe Candidate A Copy', 'candidate-a', True),
    ('undeclared', 'Probe Undeclared', 'undeclared', False)]:
    manifest['targets'][target] = bundle(name, out / 'fixture', f'org.defaultapps.probe.{manifest["token"]}.{suffix}', declared)
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

app = out / 'Native Behavior Probe.app'
(app / 'Contents/MacOS').mkdir(parents=True, exist_ok=True)
executable = app / 'Contents/MacOS/native-probe'
build_env = os.environ.copy()
build_env['MACOSX_DEPLOYMENT_TARGET'] = '13.0'
build_env['CGO_CFLAGS'] = '-mmacosx-version-min=13.0'
build_env['CGO_LDFLAGS'] = '-mmacosx-version-min=13.0'
subprocess.run(['go', 'build', '-tags', 'production', '-ldflags', '-extldflags=-mmacosx-version-min=13.0',
    '-o', str(executable), '.'], cwd=root, env=build_env, check=True)
info = {'CFBundleName': 'Native Behavior Probe', 'CFBundleIdentifier': 'org.defaultapps.native-probe',
        'CFBundlePackageType': 'APPL', 'CFBundleExecutable': 'native-probe', 'CFBundleVersion': '1',
        'CFBundleShortVersionString': '0.1', 'LSMinimumSystemVersion': '13.0', 'NSHighResolutionCapable': True}
(app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True, capture_output=True)
snapshot = subprocess.run([str(executable), '--workspace', str(root), '--inspect'], check=True, capture_output=True, text=True)
items = json.loads(snapshot.stdout)
(root / 'ui/snapshot.json').write_text(json.dumps(items, indent=2, ensure_ascii=False) + '\n')
baseline = root / 'baseline.json'
if not baseline.exists():
    # Keep the first pre-experiment baseline for restoration across app restarts.
    baseline.write_text(json.dumps({'pdf': items[0]['current'], 'items': items}, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'app': str(app), 'type': manifest['type'], 'scheme': manifest['scheme'],
                  'pdfBaseline': json.loads(baseline.read_text())['pdf'], 'registeredFixtures': False}, indent=2, ensure_ascii=False))
