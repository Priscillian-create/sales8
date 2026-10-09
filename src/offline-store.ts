import { createRecordId } from './record-id.js'

export const tables = ['products', 'customers', 'prescriptions', 'sales'] as const
export type Table = typeof tables[number]
export type Row = { id: number | string; [key: string]: unknown }
type Data = Record<Table, Row[]>
export type Change = { table: Table; id: Row['id']; row: Row | null; version: number; stockDelta?: number }
type Snapshot = { version: 1; revision: number; deviceId?: string; data: Data; pending: Change[] }
type OfflineStoreOptions = { localOnly?: boolean }
export interface Transport {
  batch?(changes: Change[], deviceId: string): Promise<void>
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
  private conflicts = new Map<number, string>()
  private listeners = new Set<() => void>()
  status = 'Waiting to sync'
  private storage: Pick<Storage, 'getItem' | 'setItem'>
  private localOnly: boolean

  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, initial: Data,
    deleted: Partial<Record<Table, Array<Row['id']>>> = {}, options: OfflineStoreOptions = {}) {
    this.storage = storage
    this.localOnly = Boolean(options.localOnly)
    if (this.localOnly) this.status = 'Local database ready'
    const saved = storage.getItem(storeKey)
    if (saved) {
      this.state = JSON.parse(saved)
      if (this.state.version !== 1 || !this.state.data || !Array.isArray(this.state.pending)) {
        throw new Error('Local data could not be opened. Preserve browser storage and restore a backup.')
      }
      if (this.localOnly && this.state.pending.length) {
        this.state = { ...this.state, pending: [], revision: this.state.revision + 1 }
        this.commit(this.state)
      }
    } else {
      this.state = { version: 1, revision: 0, data: { products: [], customers: [], prescriptions: [], sales: [] }, pending: [] }
      this.replace(initial)
      for (const table of tables) {
        for (const id of deleted[table] ?? []) {
          this.state.data[table] = this.state.data[table].filter(row => row.id !== id)
          this.state.pending = this.state.pending.filter(change => change.table !== table || change.id !== id)
          if (!this.localOnly) this.state.pending.push({ table, id, row: null, version: ++this.state.revision })
        }
      }
      this.commit(this.state)
    }
    if (!this.state.deviceId) {
      this.commit({ ...this.state, deviceId: createRecordId() })
    }
  }

  read<T>(table: Table): T[] { return structuredClone(this.state.data[table]) as T[] }
  get pendingCount() { return this.localOnly ? 0 : this.state.pending.length }
  reportSyncError(error: unknown) {
    this.status = `Sync failed — changes kept on this device. ${error instanceof Error ? error.message : String(error)}`
    this.emit()
  }
  refreshFromStorage() {
    const saved = this.storage.getItem(storeKey)
    if (saved && !same(JSON.parse(saved), this.state)) {
      this.state = JSON.parse(saved)
      this.conflicts.clear()
      this.emit()
    }
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { this.listeners.forEach(listener => listener()) }
  private commit(next: Snapshot) {
    const saved = this.storage.getItem(storeKey)
    if (saved && this.state && JSON.parse(saved).revision > this.state.revision) {
      this.state = JSON.parse(saved)
      this.emit()
      throw new Error('Another tab changed local data. Retry your action with the refreshed records.')
    }
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
      if (this.localOnly) {
        next.data[table] = structuredClone(rows)
        next.pending = []
        next.revision += 1
        continue
      }
      const before = new Map(next.data[table].map(row => [row.id, row]))
      const after = new Map(rows.map(row => [row.id, row]))
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (same(before.get(id), after.get(id))) continue
        const row = after.get(id) ?? null
        const previous = before.get(id)
        if (table === 'products' && row && previous?.batch !== row.batch) {
          next.pending = next.pending.map(change => change.table === table && change.id === id && change.row
            ? { ...change, row: { ...change.row, batch: row.batch } } : change)
        }
        // Keep product operations in order: a lost response may already have
        // applied an earlier stock delta in the cloud.
        if (table !== 'products' || !row) {
          next.pending = next.pending.filter(change => change.table !== table || change.id !== id)
        }
        next.pending.push({ table, id, row, version: ++next.revision,
          ...(table === 'products' && row && previous
            ? { stockDelta: Number(row.stock) - Number(previous.stock) } : {}) })
      }
      next.data[table] = structuredClone(rows)
    }
    this.commit(next)
    this.conflicts.clear()
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
      if (this.localOnly) {
        next.pending = []
        next.revision += 1
        continue
      }
      const deletes = backup.pending.filter(change => change.table === table && change.row === null)
      const changes = [...updates[table].map(row => ({ id: row.id, row })), ...deletes]
      for (const change of changes) {
        next.pending = next.pending.filter(item => item.table !== table || item.id !== change.id)
        next.pending.push({ table, id: change.id, row: change.row, version: ++next.revision })
      }
    }
    this.commit(next)
  }

  sync(transport: Transport | null, online: boolean, retryConflicts = false): Promise<void> {
    if (this.localOnly) {
      this.status = 'Local database ready'
      this.emit()
      return Promise.resolve()
    }
    if (retryConflicts) this.conflicts.clear()
    if (this.running) {
      this.syncRequested = true
      return this.running
    }
    this.refreshFromStorage()
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
      if (transport.batch && changes.length) {
        const blocked = changes.find(change => this.conflicts.has(change.version))
        if (blocked) {
          errors.push(this.conflicts.get(blocked.version)!)
        } else {
          try {
            await transport.batch(changes, this.state.deviceId!)
            const versions = new Set(changes.map(change => change.version))
            const next = structuredClone(this.state)
            next.pending = next.pending.filter(change => !versions.has(change.version))
            this.commit(next)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            errors.push(message)
            if (typeof error === 'object' && error !== null && 'code' in error &&
              ['23505', '23503', '23514', 'PT409', 'PGRST202', '42501'].includes(String(error.code))) {
              // Editing any member of a rejected atomic batch permits a new attempt.
              this.conflicts.set(changes[changes.length - 1].version, message)
            }
          }
        }
      }
      for (const change of transport.batch ? [] : changes) {
        if (!this.state.pending.some(item => item.version === change.version)) continue
        const conflict = this.conflicts.get(change.version)
        if (conflict) {
          errors.push(conflict)
          continue
        }
        try {
          if (change.row) await transport.upsert(change.table, change.row)
          else await transport.remove(change.table, change.id)
        } catch (error) {
          const message = `${change.table}: ${error instanceof Error ? error.message : String(error)}`
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
            this.conflicts.set(change.version, message)
          }
          errors.push(message)
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
        const hasConflict = next.pending.some(change => this.conflicts.has(change.version))
        this.status = hasConflict
          ? `Sync needs attention — local changes kept. ${errors[0]} Edit the conflicting record, then save; use Sync Now to retry.`
          : `Automatic sync will retry — local changes kept. ${errors[0]}`
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
