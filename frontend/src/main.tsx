import React from 'react'
import ReactDOM from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import { themes, defaultThemeSlug } from './astryx-themes'
import App from './App'
import './app.css'
import './changes.css'
import './manual.css'
import './batch.css'
import './file-drop.css'
import './updates.css'
import './notifications.css'
import './assets/motion/motion.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme theme={themes[defaultThemeSlug]}><App /></Theme>
  </React.StrictMode>,
)
