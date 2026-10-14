import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'

import './index.css'

const journalWorkerEnabled = import.meta.env.PROD || import.meta.env.VITE_ENABLE_JOURNAL_SW === '1'

if ('serviceWorker' in navigator && journalWorkerEnabled) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/journal-sw.js', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {
      // IndexedDB drafts remain available if the browser disables offline shell caching.
    })
  })
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations
      .filter((registration) => [registration.active, registration.waiting, registration.installing]
        .some((worker) => worker?.scriptURL.endsWith('/journal-sw.js')))
      .map((registration) => registration.unregister()))).catch(() => {})
  })
}


ReactDOM.createRoot(
  document.getElementById('root')
)
.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
