export const tables = ['products', 'customers', 'prescriptions', 'sales'] as const
export type Table = typeof tables[number]
export type Row = { id: number | string; [key: string]: unknown }
type Data = Record<Table, Row[]>
type Change = { table: Table; id: Row['id']; row: Row | null; version: number }
type Snapshot = { version: 1; revision: number; data: Data; pending: Change[] }
export interface Transport {
  upsert(table: Table, row: Row): Promise<void>
  remove(table: Table, id: Row['id']): Promise<void>
  read(table: Table): Promise<Row[]>
}
export const storeKey = 'purela.offline.v1'
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Data and its upload queue are committed in one localStorage write. A successful
// older request may acknowledge only its own version, never a newer edit.
export class OfflineStore {
  private state: Snapshot
  private running: Promise<void> | null = null
  private syncRequested = false
  private listeners = new Set<() => void>()
  status = 'Waiting to sync'
  private storage: Pick<Storage, 'getItem' | 'setItem'>

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, initial: Data,
    deleted: Partial<Record<Table, Array<Row['id']>>> = {}) {
    this.storage = storage
    const saved = storage.getItem(storeKey)
    if (saved) {
      this.state = JSON.parse(saved)
      if (this.state.version !== 1 || !this.state.data || !Array.isArray(this.state.pending)) {
        throw new Error('Local data could not be opened. Preserve browser storage and restore a backup.')
      }
    } else {
      this.state = { version: 1, revision: 0, data: { products: [], customers: [], prescriptions: [], sales: [] }, pending: [] }
      this.replace(initial)
      for (const table of tables) {
        for (const id of deleted[table] ?? []) {
          this.state.data[table] = this.state.data[table].filter(row => row.id !== id)
          this.state.pending = this.state.pending.filter(change => change.table !== table || change.id !== id)
          this.state.pending.push({ table, id, row: null, version: ++this.state.revision })
        }
      }
      this.commit(this.state)
    }
  }

  read<T>(table: Table): T[] { return structuredClone(this.state.data[table]) as T[] }
  get pendingCount() { return this.state.pending.length }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { this.listeners.forEach(listener => listener()) }
  private commit(next: Snapshot) {
    try { this.storage.setItem(storeKey, JSON.stringify(next)) }
    catch (error) {
      this.status = 'Storage unavailable or full. Changes were not saved; export a backup before continuing.'
      this.emit()
      throw error
    }
    this.state = next
    this.emit()
  }

  replace(updates: Partial<Data>) {
    const next = structuredClone(this.state)
    for (const table of tables) {
      const rows = updates[table]
      if (!rows) continue
      const before = new Map(next.data[table].map(row => [row.id, row]))
      const after = new Map(rows.map(row => [row.id, row]))
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (same(before.get(id), after.get(id))) continue
        next.pending = next.pending.filter(change => change.table !== table || change.id !== id)
        next.pending.push({ table, id, row: after.get(id) ?? null, version: ++next.revision })
      }
      next.data[table] = structuredClone(rows)
    }
    this.commit(next)
  }

  backup() { return JSON.stringify(this.state, null, 2) }

  restore(contents: string) {
    const backup = JSON.parse(contents) as Snapshot
    if (backup.version !== 1 || !backup.data || !Array.isArray(backup.pending)) {
      throw new Error('This is not a supported Purela backup.')
    }
    const updates = {} as Data
    for (const table of tables) {
      const rows = backup.data[table]
      if (!Array.isArray(rows) || rows.some(row => !row ||
        (typeof row.id !== 'number' && typeof row.id !== 'string'))) {
        throw new Error('The backup contains invalid records.')
      }
      const merged = new Map(this.state.data[table].map(row => [row.id, row]))
      rows.forEach(row => merged.set(row.id, row))
      backup.pending.filter(change => change.table === table && change.row === null)
        .forEach(change => merged.delete(change.id))
      updates[table] = [...merged.values()]
    }
    // Keep tombstones even when the deleted record is absent on this device.
    const next = structuredClone(this.state)
    for (const table of tables) {
      next.data[table] = updates[table]
      const deletes = backup.pending.filter(change => change.table === table && change.row === null)
      const changes = [...updates[table].map(row => ({ id: row.id, row })), ...deletes]
      for (const change of changes) {
        next.pending = next.pending.filter(item => item.table !== table || item.id !== change.id)
        next.pending.push({ table, id: change.id, row: change.row, version: ++next.revision })
      }
    }
    this.commit(next)
  }

  sync(transport: Transport | null, online: boolean): Promise<void> {
    if (this.running) {
      this.syncRequested = true
      return this.running
    }
    if (!transport || !online) {
      this.status = !transport ? 'Cloud not configured — export a backup' : 'Offline — changes saved on this device'
      this.emit()
      return Promise.resolve()
    }
    this.status = 'Syncing…'
    this.emit()
    this.running = (async () => {
      do {
        this.syncRequested = false
        await this.run(transport)
      } while (this.syncRequested)
    })().catch((error: unknown) => {
      this.status = `Sync failed — changes kept on this device. ${error instanceof Error ? error.message : String(error)}`
      this.emit()
    }).finally(() => { this.running = null })
    return this.running
  }

  private async run(transport: Transport) {
    // Retry on the next timer/reconnect if edits keep arriving during a read.
    for (let attempt = 0; attempt < 3; attempt++) {
      const errors: string[] = []
      const changes = [...this.state.pending].sort((a, b) => {
        if (!a.row && b.row) return -1
        if (a.row && !b.row) return 1
        return (a.row ? 1 : -1) * (tables.indexOf(a.table) - tables.indexOf(b.table))
      })
      for (const change of changes) {
        if (!this.state.pending.some(item => item.version === change.version)) continue
        try {
          if (change.row) await transport.upsert(change.table, change.row)
          else await transport.remove(change.table, change.id)
        } catch (error) {
          errors.push(`${change.table}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const next = structuredClone(this.state)
        next.pending = next.pending.filter(item => item.version !== change.version)
        this.commit(next)
      }
      const revision = this.state.revision
      const remote = await Promise.allSettled(tables.map(table => transport.read(table)))
      // Never apply a response fetched before a local change.
      if (revision !== this.state.revision) continue
      const next = structuredClone(this.state)
      tables.forEach((table, index) => {
        const result = remote[index]
        if (result.status === 'rejected') {
          errors.push(`${table}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
          return
        }
        const rows = new Map(result.value.map(row => [row.id, row]))
        // A failed local edit or deletion stays visible while other cloud rows refresh.
        for (const change of next.pending.filter(item => item.table === table)) {
          if (change.row) rows.set(change.id, change.row)
          else rows.delete(change.id)
        }
        next.data[table] = [...rows.values()]
      })
      this.commit(next)
      if (errors.length) {
        this.status = `Automatic sync will retry — local changes kept. ${errors[0]}`
      } else if (this.pendingCount) {
        continue
      } else {
        this.status = 'All changes synced to cloud'
      }
      this.emit()
      return
    }
    this.status = 'Changes saved on this device — sync will retry'
    this.emit()
  }
}
