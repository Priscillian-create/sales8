import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const handlers = {}
vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
  self: { addEventListener: (type, handler) => { handlers[type] = handler }, registration: { scope: 'https://pos.example/app/' } },
  URL,
})
for (const url of ['https://project.supabase.co/rest/v1/products', 'https://pos.example/api/sales']) {
  test('does not intercept database request: ' + url, () => {
    let intercepted = false
    handlers.fetch({ request: { method: 'GET', mode: 'cors', url }, respondWith() { intercepted = true } })
    assert.equal(intercepted, false)
  })
}

test('offline asset failure returns an error, never app HTML', async () => {
  const events = {}
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { addEventListener: (type, handler) => { events[type] = handler }, registration: { scope: 'https://pos.example/app/' } },
    URL, Response,
    fetch: async () => { throw new Error('offline') },
    caches: { open: async () => ({ match: async key => key === './' ? new Response('app html') : undefined }) },
  })
  let response
  events.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://pos.example/app/assets/missing.js' }, respondWith(value) { response = value } })
  assert.equal((await response).type, 'error')
})
