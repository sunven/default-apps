import {defineConfig} from '../../../../../frontend/node_modules/vite/dist/node/index.js'
import react from '../../../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js'
import {fileURLToPath} from 'node:url'
const fixture=fileURLToPath(new URL('./scale-service.ts',import.meta.url))
export default defineConfig({root:fileURLToPath(new URL('../../../../../frontend',import.meta.url)),plugins:[react()],server:{host:'127.0.0.1',port:9244,strictPort:true},resolve:{alias:[{find:/.*bindings\/github\.com\/sunven\/default-apps\/internal\/(association|catalog|discovery)\/service$/,replacement:fixture},{find:'@wailsio/runtime',replacement:fixture}]}})
