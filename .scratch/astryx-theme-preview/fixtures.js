// Sample data for visual review only. Every mutating operation is unavailable.
const app = (key, name, bundleID, version, system = true) => ({
  name, version, bundleID, system,
  path: `${system ? '/System' : ''}/Applications/${key === 'preview' ? 'Preview' : key === 'textedit' ? 'TextEdit' : name}.app`,
  displayPath: `/Applications/${name}.app`, iconData: icons[key],
})
const preview = app('preview', '预览', 'com.apple.Preview', '11.0')
const textedit = app('textedit', '文本编辑', 'com.apple.TextEdit', '1.21')
const chrome = app('chrome', 'Google Chrome', 'com.google.Chrome', '142.0', false)
const safari = app('safari', 'Safari', 'com.apple.Safari', '27.0')
const books = app('books', '图书', 'com.apple.iBooksX', '8.0')
const mail = app('mail', '邮件', 'com.apple.mail', '16.0')
const definitions = [
  ['com.adobe.pdf', 'PDF 文稿', ['pdf'], preview],
  ['public.jpeg', 'JPEG 图像', ['jpg', 'jpeg'], preview],
  ['public.png', 'PNG 图像', ['png'], preview],
  ['public.heic', 'HEIF 图像', ['heic'], preview],
  ['com.compuserve.gif', 'GIF 图像', ['gif'], preview],
  ['public.tiff', 'TIFF 图像', ['tif', 'tiff'], preview],
  ['com.microsoft.bmp', 'Windows 位图', ['bmp'], preview],
  ['public.plain-text', '纯文本文稿', ['txt'], textedit],
  ['net.daringfireball.markdown', 'Markdown 文稿', ['md', 'markdown'], textedit],
  ['public.html', 'HTML 文稿', ['html', 'htm'], safari],
  ['org.idpf.epub-container', 'EPUB 电子书', ['epub'], books],
  ['https', '安全网页链接', [], chrome],
  ['mailto', '电子邮件链接', [], mail],
]
const entries = definitions.map(([key, name, extensions, target]) => {
  const kind = extensions.length ? 'file' : 'scheme'
  return {
    id: `${kind}:${key}`, association: {kind, key}, name, extensions,
    mimeTypes: [], resolved: true, unresolvedReason: '', diagnosticIdentifiers: [],
    sources: [{kind: 'common', inputKind: 'identifier', rawInput: key, normalizedInput: key, label: name},
      {kind: 'declaration', inputKind: 'identifier', rawInput: key, normalizedInput: key, label: name, appPath: target.path}],
  }
})
const catalog = {
  version: 1, scanning: false, entries, issues: [], roots: [], startedAt: '', completedAt: '', durationMS: 0,
  apps: [preview, textedit, chrome, safari, books, mail].map(item => ({
    app: item, associationIDs: entries.filter((_, index) => definitions[index][3] === item).map(entry => entry.id),
    declarations: [], definitions: [], issues: [],
  })),
}
export const list = async () => entries
export const discovery = async () => catalog
export const changes = async () => ({version: 1, busy: false, requests: [], observations: [], writableKinds: ['file', 'scheme']})
export const status = async () => ({error: '', associations: 0, applications: 0})
export const updates = async () => ({version: 1, phase: 'current', currentVersion: '0.1.7', error: '', release: null, disabledReason: '视觉预览不检查或安装更新。'})
export const unsupported = async () => { throw new Error('视觉预览使用示例数据，不执行系统操作。') }
export const query = async association => {
  const target = definitions.find(item => item[0] === association.key)?.[3] ?? preview
  const observedAt = '2026-11-12T02:00:00Z'
  return {association, version: 1,
    default: {known: true, app: target, stale: false, error: null, observedAt},
    candidates: {known: true, apps: [target], stale: false, error: null, observedAt},
  }
}
