#!/usr/bin/env python3
"""Read-only declaration census. No Launch Services registration or default writes."""
import collections, datetime, json, os, pathlib, plistlib

roots = [pathlib.Path('/Applications'), pathlib.Path.home() / 'Applications', pathlib.Path('/System/Applications')]
apps, errors, seen = [], [], set()
def strings(value):
    if isinstance(value, str): return [value]
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []
def scan_error(e): errors.append({'path': e.filename, 'error': str(e)})
for root in roots:
    if not root.exists():
        errors.append({'path': str(root), 'error': 'root missing'})
        continue
    for base, dirs, files in os.walk(root, followlinks=False, onerror=scan_error):
        for name in sorted(dirs[:]):
            path = pathlib.Path(base) / name
            if not name.lower().endswith('.app'): continue
            dirs.remove(name)  # App bundles are leaves; do not count embedded helper apps.
            canonical = str(path.resolve())
            if canonical in seen: continue
            seen.add(canonical)
            try:
                with (path / 'Contents/Info.plist').open('rb') as f: info = plistlib.load(f)
                docs = info.get('CFBundleDocumentTypes', [])
                docs = [d for d in docs if isinstance(d, dict)] if isinstance(docs, list) else []
                urls = info.get('CFBundleURLTypes', [])
                urls = [u for u in urls if isinstance(u, dict)] if isinstance(urls, list) else []
                utis = sorted(set(x for d in docs for x in strings(d.get('LSItemContentTypes'))))
                exts = sorted(set(x for d in docs for x in strings(d.get('CFBundleTypeExtensions'))))
                schemes = sorted(set(x.lower() for u in urls for x in strings(u.get('CFBundleURLSchemes'))))
                types = []
                for key in ['UTExportedTypeDeclarations', 'UTImportedTypeDeclarations']:
                    for item in info.get(key, []) if isinstance(info.get(key), list) else []:
                        if isinstance(item, dict):
                            tags = item.get('UTTypeTagSpecification', {})
                            types.append({'id': item.get('UTTypeIdentifier'), 'name': item.get('UTTypeDescription'), 'extensions': strings(tags.get('public.filename-extension')) if isinstance(tags, dict) else []})
                apps.append({'name': info.get('CFBundleDisplayName') or info.get('CFBundleName') or path.stem,
                             'version': str(info.get('CFBundleShortVersionString') or info.get('CFBundleVersion') or '未提供'),
                             'path': str(path), 'bundle': info.get('CFBundleIdentifier'),
                             'documentEntries': len(docs), 'utis': utis, 'extensions': exts, 'schemes': schemes, 'typeDeclarations': types})
            except (OSError, ValueError, plistlib.InvalidFileException) as e:
                errors.append({'path': str(path), 'error': str(e)})
apps.sort(key=lambda a: (str(a['name']).casefold(), a['path']))
all_utis = sorted(set(x for a in apps for x in a['utis']))
all_exts = sorted(set(x for a in apps for x in a['extensions']))
all_schemes = sorted(set(x for a in apps for x in a['schemes']))
counts = collections.Counter(a['bundle'] for a in apps if a['bundle'])
summary = {'appCopies': len(apps), 'withDocumentEntries': sum(bool(a['documentEntries']) for a in apps),
           'withURLSchemes': sum(bool(a['schemes']) for a in apps),
           'withoutDocumentOrURLDeclarations': sum(not a['documentEntries'] and not a['schemes'] for a in apps),
           'withLegacyExtensionsButNoDocumentUTI': sum(bool(a['extensions']) and not a['utis'] for a in apps),
           'uniqueRawDocumentUTIs': len(all_utis), 'uniqueRawExtensions': len(all_exts), 'uniqueURLSchemes': len(all_schemes),
           'duplicateBundleIDs': {k:v for k,v in counts.items() if v > 1}, 'errors': len(errors)}
result = {'observedAt': datetime.datetime.now().astimezone().isoformat(), 'roots': [str(p) for p in roots],
          'method': 'Read Contents/Info.plist; recurse directories, stop at .app; do not follow directory symlinks. Raw declarations, not UTType resolution or system candidates/defaults. Display names are plist values, not localized Finder names.',
          'summary': summary, 'apps': apps, 'errors': errors}
pathlib.Path(__file__).with_name('snapshot.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
print('Largest raw declaration sets:')
for a in sorted(apps, key=lambda a: len(a['utis'])+len(a['extensions'])+len(a['schemes']), reverse=True)[:8]:
    print(a['name'], len(a['utis']), len(a['extensions']), len(a['schemes']))
