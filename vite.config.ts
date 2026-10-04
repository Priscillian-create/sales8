import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'precache-offline-app',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(file => file !== 'sw.js')
      const hash = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12)
      const shell = ['./', './manifest.webmanifest', './favicon.svg', './supabase-config.js', ...files.map(file => './' + file)]
      const source = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8')
        .replace(/const CACHE_NAME = .*/, `const CACHE_NAME = 'purela-pharmacy-pos-${hash}'`)
        .replace(/const APP_SHELL = .*/, `const APP_SHELL = ${JSON.stringify(shell)}`)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }],
})
