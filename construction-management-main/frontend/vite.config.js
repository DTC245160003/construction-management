import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const proxy = {
  '/admin': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000', changeOrigin: true },
  '/auth': {
    target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
  '/projects': {
    target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
    changeOrigin: true,
    // /projects is also a React page. Only JSON requests go to the API.
    bypass(req) {
      if (req.headers.accept?.includes('text/html')) return '/index.html'
    },
  },
}

const developmentServiceWorkerCleanup = {
  name: 'development-journal-service-worker-cleanup',
  apply: 'serve',
  transformIndexHtml() {
    if (process.env.VITE_ENABLE_JOURNAL_SW === '1') return []
    return [{
      tag: 'script',
      injectTo: 'head-prepend',
      children: `(() => {
        if (!('serviceWorker' in navigator)) return;
        const reloadKey = 'xds-journal-sw-dev-cleanup';
        const controlledByJournal = navigator.serviceWorker.controller?.scriptURL.endsWith('/journal-sw.js');
        navigator.serviceWorker.getRegistrations().then(async (registrations) => {
          const journalRegistrations = registrations.filter((registration) =>
            [registration.active, registration.waiting, registration.installing]
              .some((worker) => worker?.scriptURL.endsWith('/journal-sw.js')));
          if (!controlledByJournal && journalRegistrations.length === 0) {
            sessionStorage.removeItem(reloadKey);
            return;
          }
          await Promise.all(journalRegistrations.map((registration) => registration.unregister()));
          if (!sessionStorage.getItem(reloadKey)) {
            sessionStorage.setItem(reloadKey, '1');
            location.reload();
          }
        }).catch(() => {});
      })();`
    }]
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [developmentServiceWorkerCleanup, react(), {
    name: 'version-journal-service-worker', apply: 'build',
    closeBundle() {
      const directory=path.resolve('dist');
      const digest=createHash('sha256');
      for (const file of ['index.html','journal-sw.js','journal-queue.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png']) digest.update(fs.readFileSync(path.join(directory,file)));
      const version=digest.digest('hex').slice(0,16);
      const worker=path.join(directory,'journal-sw.js');
      fs.writeFileSync(worker,fs.readFileSync(worker,'utf8').replace('__XDS_BUILD__',version));
    },
  }],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'http-client', test: /node_modules[\\/]axios[\\/]/, includeDependenciesRecursively: false }],
        },
      },
    },
  },
  server: {
    proxy,
  },
  preview: { proxy },
})
