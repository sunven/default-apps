import React from 'react'
import ReactDOM from 'react-dom/client'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
const render = (Component: React.ComponentType) => root.render(
  <React.StrictMode><Component /></React.StrictMode>,
)

// The throwaway UI is gated to development; normal builds keep the Wails app.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('prototype') === 'default-apps') {
  document.documentElement.classList.add('default-apps-prototype')
  document.body.classList.add('default-apps-prototype')
  document.documentElement.lang = 'zh-CN'
  document.title = 'Default Apps · 界面原型'
  import('./prototypes/default-apps/DefaultAppsPrototype').then(module => render(module.default))
} else {
  import('./App').then(module => render(module.default))
}
