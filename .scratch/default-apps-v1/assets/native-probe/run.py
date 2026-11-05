#!/usr/bin/env python3
"""Disposable probe launcher. Each write mode names its exact scope."""
from pathlib import Path
import argparse
import json
import subprocess
import time

root = Path(__file__).resolve().parent
binary = root / 'out/Native Behavior Probe.app/Contents/MacOS/native-probe'
lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['inspect', 'self-test', 'exit-test', 'fixtures', 'pdf', 'restore-pdf', 'cleanup'])
parser.add_argument('--cancel-after-ms', type=int, default=-1)
parser.add_argument('--scenario', default='fixture-suite', help='dedicated fixture-suite or fixture:type:a etc.')
args = parser.parse_args()
manifest = json.loads((root / 'manifest.json').read_text())

def launch(*flags):
    return subprocess.run([str(binary), '--workspace', str(root), *flags], check=True)

def snapshot(name):
    result = subprocess.run([str(binary), '--workspace', str(root), '--inspect'], check=True, capture_output=True, text=True)
    values = json.loads(result.stdout)
    (root / name).write_text(json.dumps(values, ensure_ascii=False, indent=2) + '\n')
    return values

def unregister():
    for path in manifest['targets'].values():
        if Path(path).exists(): subprocess.run([lsregister, '-u', path], check=True)
    time.sleep(1)
    values = snapshot('cleanup-snapshot.json')
    remaining = [item for item in values if item['key'] in (manifest['type'], manifest['scheme']) and
        (item.get('current') in manifest['targets'].values() or any(p in manifest['targets'].values() for p in item['candidates']))]
    if remaining:
        print('系统查询仍返回测试应用；请保留资产并查看 cleanup-snapshot.json，不视为清理已验证。')
    else:
        print('清理后查询未返回测试应用；没有执行 Launch Services 全库重置。')

if args.mode == 'inspect':
    print(json.dumps(snapshot('current-snapshot.json'), ensure_ascii=False, indent=2))
elif args.mode == 'self-test':
    launch('--self-test')
elif args.mode == 'exit-test':
    launch('--scenario', 'synthetic:15000', '--quit-after-ms', '5000')
elif args.mode == 'fixtures':
    # Registration alone affects system discovery, so only do it in this explicit experiment mode.
    snapshot('before-fixtures.json')
    for path in manifest['targets'].values(): subprocess.run([lsregister, '-f', path], check=True)
    time.sleep(1)
    snapshot('registered-fixtures.json')
    try:
        if not (args.scenario == 'fixture-suite' or args.scenario.startswith('fixture:')):
            raise SystemExit('fixtures 模式只允许专用关联场景')
        launch('--allow-fixtures', '--scenario', args.scenario, '--cancel-after-ms', str(args.cancel_after_ms))
    finally:
        unregister()
elif args.mode in ('pdf', 'restore-pdf'):
    current = snapshot('before-pdf.json' if args.mode == 'pdf' else 'before-restore-pdf.json')[0]['current']
    if args.mode == 'pdf':
        baseline = root / 'pdf-experiment-baseline.json'
        if baseline.exists():
            previous = json.loads(baseline.read_text())['pdf']
            if current != previous:
                raise SystemExit('上次 PDF 实验尚未恢复；先运行 restore-pdf。')
        baseline.write_text(json.dumps({'pdf': current}, indent=2) + '\n')
    elif not (root / 'pdf-experiment-baseline.json').exists():
        raise SystemExit('没有本次实验的 PDF 基线；不猜测恢复目标。')
    target = 'preview' if args.mode == 'pdf' else 'restore'
    launch('--allow-pdf', '--scenario', 'pdf:' + target, '--cancel-after-ms', str(args.cancel_after_ms))
    after = snapshot('after-pdf.json' if args.mode == 'pdf' else 'after-restore-pdf.json')[0]['current']
    print('实际 PDF 默认应用：', after)
    if args.mode == 'restore-pdf':
        expected = json.loads((root / 'pdf-experiment-baseline.json').read_text())['pdf']
        print('恢复回读一致：', after == expected)
else:
    unregister()
