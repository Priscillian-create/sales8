import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { OfflineStore } from '../.test-build/offline-store.js'

const product = (id, stock = 10, batch = 'BATCH-' + id) => ({ id, stock, batch, name: 'Test item', generic: 'Test', category: 'OTC', reorder: 2, expiry: '2030-01-01', price: 100, prescription: false, location: 'A1', supplier: 'Test' })
const sale = id => ({ id, patient: 'Walk-in', cashier: 'Test', payment: 'Cash', shift: 'Morning Shift', subtotal: 100, discount: 0, total: 100, items: [], created_at: new Date().toISOString() })
const empty = () => ({ products: [], customers: [], prescriptions: [], sales: [] })
const memory = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
async function database() {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);')
  const schema = fs.readFileSync(new URL('../supabase.schema.sql', import.meta.url), 'utf8')
  await db.exec(schema.slice(0, schema.indexOf('alter table products enable')))
  await db.exec(fs.readFileSync(new URL('../supabase.offline-sync.sql', import.meta.url), 'utf8'))
  return db
}
const transport = db => ({
  async batch(changes, deviceId) { await db.query('select sync_pos_changes($1::jsonb, $2)', [JSON.stringify(changes), deviceId]) },
  async read(table) { return (await db.query('select * from ' + table + ' order by id')).rows },
  async upsert() { throw new Error('Must use atomic upload') },
  async remove() { throw new Error('Must use atomic upload') },
})

test('SQL: failed product upload rolls back sales and operation receipts', async () => {
  const db = await database()
  try {
    const remote = transport(db)
    await remote.batch([{ table: 'products', id: 1, row: product(1), version: 1 }], 'seed')
    await assert.rejects(remote.batch([
      { table: 'sales', id: 'sale-1', row: sale('sale-1'), version: 1 },
      { table: 'products', id: 2, row: product(2, 10, 'BATCH-1'), version: 2 },
    ], 'device'), /products_batch_key/)
    assert.equal((await remote.read('sales')).length, 0)
    assert.equal((await db.query("select * from pos_sync_receipts where operation_id like 'device:%'")).rows.length, 0)
  } finally { await db.close() }
})

test('SQL: two offline devices deduct stock without overwriting each other', async () => {
  const db = await database()
  try {
    const remote = transport(db)
    await remote.batch([{ table: 'products', id: 1, row: product(1), version: 1 }], 'seed')
    const a = new OfflineStore(memory(), empty()), b = new OfflineStore(memory(), empty())
    await a.sync(remote, true)
    await b.sync(remote, true)
    a.replace({ products: [product(1, 8)], sales: [sale('a')] })
    b.replace({ products: [product(1, 7)], sales: [sale('b')] })
    await a.sync(remote, true)
    await b.sync(remote, true)
    assert.equal((await remote.read('products'))[0].stock, 5)
    assert.equal((await remote.read('sales')).length, 2)
  } finally { await db.close() }
})

test('SQL: lost response, further offline sale and restart do not deduct stock twice', async () => {
  const db = await database()
  try {
    const disk = memory(), remote = transport(db)
    await remote.batch([{ table: 'products', id: 1, row: product(1), version: 1 }], 'seed')
    let store = new OfflineStore(disk, empty())
    await store.sync(remote, true)
    store.replace({ products: [product(1, 9)], sales: [sale('a')] })
    await store.sync({ ...remote, batch: async (...args) => { await remote.batch(...args); throw new Error('response lost') } }, true)
    store.replace({ products: [product(1, 8)], sales: [sale('a'), sale('b')] })
    store = new OfflineStore(disk, empty())
    await store.sync(remote, true)
    assert.equal(store.pendingCount, 0)
    assert.equal((await remote.read('products'))[0].stock, 8)
    assert.equal((await remote.read('sales')).length, 2)
  } finally { await db.close() }
})

test('SQL: insufficient cloud stock retains pending sale and rolls back the entire upload', async () => {
  const db = await database()
  try {
    const remote = transport(db), store = new OfflineStore(memory(), empty())
    await remote.batch([{ table: 'products', id: 1, row: product(1, 2), version: 1 }], 'seed')
    await store.sync(remote, true)
    store.replace({ products: [product(1, 0)], sales: [sale('a')] })
    await db.exec('update products set stock=1 where id=1')
    await store.sync(remote, true)
    assert.equal(store.pendingCount, 2)
    assert.equal((await remote.read('sales')).length, 0)
    assert.equal((await remote.read('products'))[0].stock, 1)
  } finally { await db.close() }
})

test('stale tabs cannot replace a newer offline sale', () => {
  const disk = memory(), a = new OfflineStore(disk, empty()), b = new OfflineStore(disk, empty())
  a.replace({ sales: [sale('a')] })
  assert.throws(() => b.replace({ sales: [sale('b')] }), /Another tab/)
  assert.equal(b.read('sales')[0].id, 'a')
})
