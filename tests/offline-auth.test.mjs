import test from 'node:test'
import assert from 'node:assert/strict'
import { rememberAccess, offlineAccess } from '../.test-build/offline-auth.js'

test('offline login requires a verified cached password and expires', async () => {
  const data = new Map()
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  assert.equal(await offlineAccess('test@example.com', 'test-password'), null)
  await rememberAccess('test@example.com', 'test-password', { name: 'Test', role: 'Cashier' })
  assert.equal(await offlineAccess('test@example.com', 'wrong'), null)
  assert.deepEqual(await offlineAccess('TEST@example.com', 'test-password'), { name: 'Test', role: 'Cashier' })
  assert.equal([...data.values()].join('').includes('test-password'), false)
  const credentials = JSON.parse(data.get('purela.offline.credentials.v1'))
  credentials['test@example.com'].expires = 0
  data.set('purela.offline.credentials.v1', JSON.stringify(credentials))
  assert.equal(await offlineAccess('test@example.com', 'test-password'), null)
})
