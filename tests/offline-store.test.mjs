import test from 'node:test'
import assert from 'node:assert/strict'
import { OfflineStore, storeKey } from '../.test-build/offline-store.js'

const empty = () => ({ products: [], customers: [], prescriptions: [], sales: [] })
const memory = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const cloud = () => {
  const data = empty(), calls = []
  return {
    data, calls,
    async upsert(table, row) {
      calls.push(['upsert', table, row.id])
      data[table] = [...data[table].filter(item => item.id !== row.id), structuredClone(row)]
    },
    async remove(table, id) {
      calls.push(['delete', table, id])
      data[table] = data[table].filter(item => item.id !== id)
    },
    async read(table) { return structuredClone(data[table]) },
  }
}

test('offline sale and stock survive restart, reconnect, and cleared local storage after sync', async () => {
  const disk = memory(), remote = cloud()
  let store = new OfflineStore(disk, empty())
  store.replace({ products: [{ id: 1, stock: 4 }], sales: [{ id: 'sale-1', total: 20 }] })
  await store.sync(remote, false)
  assert.equal(remote.calls.length, 0)
  store = new OfflineStore(disk, empty())
  assert.equal(store.pendingCount, 2)
  await store.sync(remote, true)
  assert.equal(store.pendingCount, 0)
  const restored = new OfflineStore(memory(), empty())
  await restored.sync(remote, true)
  assert.equal(restored.read('products')[0].stock, 4)
  assert.equal(restored.read('sales')[0].id, 'sale-1')
})

test('failed writes remain queued and retry without duplicated sales', async () => {
  const disk = memory(), store = new OfflineStore(disk, empty()), remote = cloud()
  store.replace({ sales: [{ id: 'sale-1' }] })
  const write = remote.upsert
  remote.upsert = async () => { throw new Error('network failure') }
  await store.sync(remote, true)
  assert.equal(store.pendingCount, 1)
  assert.match(store.status, /network failure/)
  remote.upsert = async (...args) => { await write(...args); throw new Error('response lost') }
  await store.sync(remote, true)
  assert.equal(store.pendingCount, 1)
  remote.upsert = write
  await store.sync(remote, true)
  assert.equal(remote.data.sales.length, 1)
  assert.equal(store.pendingCount, 0)
})

test('an older upload cannot acknowledge or overwrite a newer edit', async () => {
  const store = new OfflineStore(memory(), empty()), remote = cloud()
  store.replace({ products: [{ id: 1, stock: 10 }] })
  const write = remote.upsert
  let release
  remote.upsert = async (...args) => {
    if (!release) await new Promise(resolve => { release = resolve })
    await write(...args)
  }
  const running = store.sync(remote, true)
  store.replace({ products: [{ id: 1, stock: 9 }] })
  assert.equal(store.sync(remote, true), running)
  release()
  await running
  assert.equal(remote.data.products[0].stock, 9)
  assert.equal(store.read('products')[0].stock, 9)
  assert.equal(store.pendingCount, 0)
})

test('local changes during a remote fetch are never replaced by that stale response', async () => {
  const store = new OfflineStore(memory(), empty()), remote = cloud()
  const read = remote.read
  let edited = false
  remote.read = async table => {
    const old = await read(table)
    if (!edited) {
      edited = true
      store.replace({ products: [{ id: 1, stock: 3 }] })
    }
    return old
  }
  await store.sync(remote, true)
  assert.equal(store.read('products')[0].stock, 3)
  assert.equal(remote.data.products[0].stock, 3)
})

test('deleting the last product persists across restart and failed deletion', async () => {
  const disk = memory(), remote = cloud()
  const store = new OfflineStore(disk, { ...empty(), products: [{ id: 1 }] })
  await store.sync(remote, true)
  store.replace({ products: [] })
  const reopened = new OfflineStore(disk, empty())
  const remove = remote.remove
  remote.remove = async () => { throw new Error('permission denied') }
  await reopened.sync(remote, true)
  assert.deepEqual(reopened.read('products'), [])
  assert.equal(reopened.pendingCount, 1)
  remote.remove = remove
  await reopened.sync(remote, true)
  assert.deepEqual(remote.data.products, [])
})

test('uploads parents before prescriptions, deletes children before parents', async () => {
  const remote = cloud(), store = new OfflineStore(memory(), empty())
  store.replace({ prescriptions: [{ id: 'rx' }], customers: [{ id: 1 }], products: [{ id: 2 }] })
  await store.sync(remote, true)
  assert.deepEqual(remote.calls.map(call => call[1]), ['products', 'customers', 'prescriptions'])
  remote.calls.length = 0
  store.replace({ products: [], prescriptions: [] })
  await store.sync(remote, true)
  assert.deepEqual(remote.calls.map(call => call[1]), ['prescriptions', 'products'])
})

test('unmodified cached rows are not uploaded over newer cloud values', async () => {
  const remote = cloud(), store = new OfflineStore(memory(), { ...empty(), products: [{ id: 1, stock: 10 }, { id: 2, stock: 8 }] })
  await store.sync(remote, true)
  remote.data.products[1].stock = 6
  remote.calls.length = 0
  store.replace({ products: [{ id: 1, stock: 9 }, { id: 2, stock: 8 }] })
  await store.sync(remote, true)
  assert.equal(remote.calls.length, 1)
  assert.equal(store.read('products').find(row => row.id === 2).stock, 6)
})

test('remote deletion is not resurrected from a clean cache', async () => {
  const remote = cloud(), store = new OfflineStore(memory(), { ...empty(), products: [{ id: 1 }] })
  await store.sync(remote, true)
  remote.data.products = []
  await store.sync(remote, true)
  assert.deepEqual(store.read('products'), [])
})

test('legacy deletions migrate without restoring deleted products', async () => {
  const remote = cloud(), store = new OfflineStore(memory(), { ...empty(), products: [{ id: 1 }] }, { products: [1] })
  remote.data.products = [{ id: 1 }]
  await store.sync(remote, true)
  assert.deepEqual(remote.data.products, [])
  assert.equal(store.pendingCount, 0)
})

test('quota failure leaves both sale and stock unchanged', () => {
  const disk = memory(), store = new OfflineStore(disk, empty())
  const before = disk.getItem(storeKey)
  disk.setItem = () => { throw new Error('quota') }
  assert.throws(() => store.replace({ products: [{ id: 1 }], sales: [{ id: 'sale' }] }), /quota/)
  assert.deepEqual(store.read('products'), [])
  assert.deepEqual(store.read('sales'), [])
  assert.equal(disk.getItem(storeKey), before)
})

test('exported offline backup restores unsent sales and deletions on another device', async () => {
  const remote = cloud(), source = new OfflineStore(memory(), { ...empty(), products: [{ id: 1 }] })
  await source.sync(remote, true)
  source.replace({ products: [], sales: [{ id: 'offline-sale' }] })
  const restored = new OfflineStore(memory(), empty())
  restored.restore(source.backup())
  await restored.sync(remote, true)
  assert.deepEqual(remote.data.products, [])
  assert.equal(remote.data.sales[0].id, 'offline-sale')
})

test('invalid backups leave existing data untouched', () => {
  const store = new OfflineStore(memory(), { ...empty(), products: [{ id: 1 }] })
  const before = store.backup()
  assert.throws(() => store.restore('{"version":1,"data":{},"pending":[]}'))
  assert.equal(store.backup(), before)
})

test('a realtime event during an existing fetch triggers a follow-up fetch', async () => {
  const store = new OfflineStore(memory(), empty()), remote = cloud()
  const read = remote.read
  let changed = false
  remote.read = async table => {
    const snapshot = await read(table)
    if (table === 'products' && !changed) {
      changed = true
      remote.data.products = [{ id: 5, name: 'New product from another device' }]
      void store.sync(remote, true)
    }
    return snapshot
  }
  await store.sync(remote, true)
  assert.equal(store.read('products')[0].id, 5)
})

test('a rejected local row does not block incoming products or other uploads', async () => {
  const store = new OfflineStore(memory(), empty()), remote = cloud()
  store.replace({ products: [{ id: 1, name: 'Local edit' }], sales: [{ id: 'sale-1' }] })
  remote.data.products = [{ id: 1, name: 'Older cloud value' }, { id: 2, name: 'New cloud product' }]
  const write = remote.upsert
  remote.upsert = async (table, row) => {
    if (table === 'products') throw new Error('validation failed')
    await write(table, row)
  }
  await store.sync(remote, true)
  assert.equal(store.pendingCount, 1)
  assert.equal(store.read('products').find(row => row.id === 1).name, 'Local edit')
  assert.equal(store.read('products').find(row => row.id === 2).name, 'New cloud product')
  assert.equal(remote.data.sales[0].id, 'sale-1')
  assert.match(store.status, /retry/)
})

test('a failed table read preserves its cache while other tables refresh', async () => {
  const store = new OfflineStore(memory(), empty()), remote = cloud()
  store.replace({ customers: [{ id: 1, name: 'Saved customer' }] })
  await store.sync(remote, true)
  remote.data.products = [{ id: 3 }]
  const read = remote.read
  remote.read = async table => {
    if (table === 'customers') throw new Error('temporary read failure')
    return read(table)
  }
  await store.sync(remote, true)
  assert.equal(store.read('products')[0].id, 3)
  assert.equal(store.read('customers')[0].name, 'Saved customer')
  assert.match(store.status, /temporary read failure/)
})
