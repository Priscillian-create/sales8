import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecordId } from '../.test-build/record-id.js'
import { OfflineStore } from '../.test-build/offline-store.js'

test('record IDs use getRandomValues when randomUUID is unavailable', () => {
  const id = createRecordId({ getRandomValues(bytes) { bytes.fill(0xab); return bytes } })
  assert.equal(id, 'abababab-abab-4bab-abab-abababababab')
})

test('fallback IDs remain unique across repeated offline transactions', () => {
  const source = { getRandomValues: crypto.getRandomValues.bind(crypto) }
  const ids = Array.from({ length: 1000 }, () => createRecordId(source))
  assert.equal(new Set(ids).size, ids.length)
})

test('missing UUID API does not prevent initializing and saving an offline sale', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID')
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined })
  try {
    const values = new Map()
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
    const store = new OfflineStore(storage, { products: [], customers: [], prescriptions: [], sales: [] })
    store.replace({ sales: [{ id: 'SALE-' + createRecordId(), total: 100 }] })
    store.reportSyncError(new Error('connection unavailable'))
    assert.equal(store.read('sales').length, 1)
    assert.equal(store.pendingCount, 1)
    assert.match(store.status, /connection unavailable/)
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor)
    else delete crypto.randomUUID
  }
})
