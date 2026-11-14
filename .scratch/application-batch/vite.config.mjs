import { defineConfig } from '../../frontend/node_modules/vite/dist/node/index.js'
import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../frontend', import.meta.url))
const icons = Object.fromEntries(['preview', 'textedit', 'chrome', 'safari', 'books', 'mail'].map(name => [
  name, readFileSync(`${root}/src/prototypes/default-apps/assets/${name}.png`).toString('base64'),
]))
const fixtures = `const icons = ${JSON.stringify(icons)};\n${readFileSync(new URL('./fixtures.js', import.meta.url), 'utf8')}`
const sources = {
  runtime: 'export const Events={On:()=>()=>{}}; export const Browser={OpenURL:async()=>{}};',
  catalog: "export {list as List} from 'theme-preview:fixtures';",
  discovery: "export {discovery as GetSnapshot, discovery as StartScan, unsupported as Reparse} from 'theme-preview:fixtures';",
  change: "export {changes as GetSnapshot, query as Query, changes as Requery, unsupported as Submit, unsupported as ReconcileSubmission, unsupported as RespondQuit, prepare as PrepareBatch, start as StartBatch, unsupported as StopBatch, unsupported as ReconcileBatchStart} from 'theme-preview:fixtures';",
  manual: "export {status as GetStatus, unsupported as AddIdentifiedType, unsupported as AddInput, unsupported as IdentifyFile, unsupported as IdentifyFiles, unsupported as PickApplication, unsupported as ResolveInput} from 'theme-preview:fixtures';",
  appupdate: "export {updates as GetSnapshot, unsupported as Check, unsupported as Download, unsupported as Restart} from 'theme-preview:fixtures';",
}

// This separate preview serves the actual app entry with read-only sample data.
// The production Vite config and app never import this fixture boundary.
export default defineConfig({
  root,
  plugins: [{
    name: 'theme-preview-services',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'theme-preview:fixtures') return '\0theme-preview:fixtures'
      if (source === '@wailsio/runtime') return '\0theme-preview:runtime'
      const match = source.match(/bindings\/github\.com\/sunven\/default-apps\/internal\/(catalog|discovery|change|manual|appupdate)\/service$/)
      if (match) return `\0theme-preview:${match[1]}`
    },
    load(id) {
      if (!id.startsWith('\0theme-preview:')) return
      const name = id.slice('\0theme-preview:'.length)
      return name === 'fixtures' ? fixtures : sources[name]
    },
  }, react()],
  server: { host: '127.0.0.1', port: 9259, strictPort: true },
})
