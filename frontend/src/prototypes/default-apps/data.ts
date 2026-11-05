// THROWAWAY UI PROTOTYPE. A small fixture, not an inventory of this Mac.
import preview from './assets/preview.png'
import textedit from './assets/textedit.png'
import safari from './assets/safari.png'
import chrome from './assets/chrome.png'
import mail from './assets/mail.png'
import books from './assets/books.png'

export interface DemoApp {
  id: string
  name: string
  version: string
  path: string
  icon: string
  copy?: boolean
}

export interface Association {
  id: string
  name: string
  kind: 'file' | 'url'
  category: string
  tags: string[]
  type: string
  declared: string[]
  candidates: string[]
  resolved: boolean
  source?: string
}

export const apps: DemoApp[] = [
  { id: 'preview', name: '预览', version: '11.0', path: '/System/Applications/Preview.app', icon: preview },
  { id: 'textedit', name: '文本编辑', version: '1.21', path: '/System/Applications/TextEdit.app', icon: textedit },
  { id: 'safari', name: 'Safari', version: '27.0', path: '/Applications/Safari.app', icon: safari },
  { id: 'chrome', name: 'Google Chrome', version: '示例版本', path: '/Applications/Google Chrome.app', icon: chrome },
  { id: 'mail', name: '邮件', version: '示例版本', path: '/System/Applications/Mail.app', icon: mail },
  { id: 'books', name: '图书', version: '示例版本', path: '/System/Applications/Books.app', icon: books },
  { id: 'preview-copy', name: '预览', version: '10.0 · 示例副本', path: '~/Applications/Preview.app', icon: preview, copy: true },
]

export const appById = Object.fromEntries(apps.map(app => [app.id, app]))

export const initialAssociations: Association[] = [
  { id: 'pdf', name: 'PDF 文档', kind: 'file', category: '文档', tags: ['pdf'], type: 'com.adobe.pdf', declared: ['preview', 'preview-copy', 'chrome', 'books'], candidates: ['chrome', 'preview', 'books', 'safari'], resolved: true },
  { id: 'jpeg', name: 'JPEG 图像', kind: 'file', category: '图像', tags: ['jpg', 'jpeg', 'jpe'], type: 'public.jpeg', declared: ['preview', 'preview-copy'], candidates: ['preview', 'chrome', 'safari'], resolved: true },
  { id: 'png', name: 'PNG 图像', kind: 'file', category: '图像', tags: ['png'], type: 'public.png', declared: ['preview', 'preview-copy'], candidates: ['preview', 'chrome', 'safari'], resolved: true },
  { id: 'text', name: '纯文本文档', kind: 'file', category: '文档', tags: ['txt', 'text'], type: 'public.plain-text', declared: ['textedit'], candidates: ['textedit', 'safari', 'chrome'], resolved: true },
  { id: 'rtf', name: '富文本文档', kind: 'file', category: '文档', tags: ['rtf'], type: 'public.rtf', declared: ['textedit'], candidates: ['textedit', 'safari'], resolved: true },
  { id: 'html', name: 'HTML 文档', kind: 'file', category: '网页', tags: ['html', 'htm'], type: 'public.html', declared: ['safari', 'chrome', 'textedit'], candidates: ['safari', 'chrome', 'textedit'], resolved: true },
  { id: 'http', name: '网页链接', kind: 'url', category: '网页', tags: ['http'], type: 'http', declared: ['safari', 'chrome'], candidates: ['chrome', 'safari'], resolved: true },
  { id: 'https', name: '安全网页链接', kind: 'url', category: '网页', tags: ['https'], type: 'https', declared: ['safari', 'chrome'], candidates: ['chrome', 'safari'], resolved: true },
  { id: 'mailto', name: '邮件链接', kind: 'url', category: '通信', tags: ['mailto'], type: 'mailto', declared: ['mail'], candidates: ['mail'], resolved: true },
  { id: 'jpeg-ppt', name: 'PowerPoint 导出图像', kind: 'file', category: '图像', tags: ['jpg'], type: 'com.microsoft.ppt.export.ext.jpg', declared: [], candidates: ['safari', 'preview', 'chrome'], resolved: true },
]

// PDF/JPEG/mail/http observations mirror the read-only research snapshot.
// Other defaults, versions, declaration subsets and the extra copy are fixtures.
export const initialDefaults: Record<string, string> = {
  pdf: 'chrome', jpeg: 'preview', png: 'preview', text: 'textedit', rtf: 'textedit',
  html: 'safari', http: 'chrome', https: 'chrome', mailto: 'mail', 'jpeg-ppt': 'safari',
}

console.assert(new Set(initialAssociations.map(item => item.id)).size === initialAssociations.length)
console.assert(Object.values(initialDefaults).every(id => Boolean(appById[id])))

export function tagsFor(item: Association) {
  return item.tags.map(tag => item.kind === 'file' ? `.${tag}` : `${tag}:`).join('  ')
}

export function matches(item: Association, query: string) {
  const needle = query.trim().toLowerCase().replace(/^\./, '').replace(/:$/, '')
  return !needle || [item.name, item.category, item.type, ...item.tags].join(' ').toLowerCase().includes(needle)
}
