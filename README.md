# PURELA PHARMACY POS

A professional pharmacy point-of-sale front end built with React, TypeScript, Vite, Supabase, Lucide icons, and Recharts.

## Features included

- PURELA PHARMACY branding with Naira pricing
- Top-right Add Product button that opens a full product dashboard popup
- Working register workflow with medicine search, cart quantities, discounts, payment method, stock validation, and receipt generation
- Checkout updates inventory counts and writes a sale into browser local storage
- Prescription-aware product flags, patient attachment requirements, and a status queue
- Patient profiles with insurance, allergy, refill, phone, and consultation signals
- Inventory management for stock, batch, supplier, shelf location, reorder level, expiry risk, stock adjustments, and popup product creation
- Customer creation and immediate attachment to the active sale
- Sales history and prescription analytics generated from working local data
- Supabase-ready client module and SQL schema
- Responsive layout for desktop counters and smaller devices

## Run locally

```bash
npm install
npm run dev
```

## Connect Supabase

1. Run `supabase.schema.sql` in your Supabase SQL editor.
2. Run `supabase.offline-sync.sql` to enable transactional uploads and durable retry receipts.
3. Copy `.env.example` to `.env`.
4. Add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Restart the dev server.

The supplied `public/supabase-config.js` also supports runtime configuration. The app saves changes locally and queues them for upload to Supabase. The migration above is required; without it, queued changes stay on the device and sync displays a setup message. See [OFFLINE-UPDATE.md](OFFLINE-UPDATE.md) for the upgrade procedure and limitations.

## Offline data fix

- Products, customers, prescriptions, sales, and pending changes share one durable local snapshot.
- Checkout saves the sale, customer update, and stock reduction in one local write. If storage fails, checkout does not report success.
- Only changed records upload. A queued batch commits in one database transaction. Failed uploads remain queued, and durable operation receipts make retries idempotent. An older response cannot acknowledge a newer change.
- Products and customers upload before prescriptions. Deletions persist even when the final product is removed.
- Changes upload immediately. Startup, reconnect, focus, returning to a visible tab, realtime subscription/reconnection, and realtime notifications trigger sync. A 15-second timer refreshes visible apps even if realtime is unavailable. Settings retains Sync Now as a manual retry.
- Reads time out after 15 seconds and transactional uploads after 30 seconds. A rejected batch remains pending in full; validation conflicts pause uploads until edited or manually retried. Incoming records still refresh, and failed table reads preserve that table's local cache.
- Remote reads are paginated. Responses fetched before a local edit are discarded. The service worker no longer caches database responses.
- Clear Products preserves sales and customers. It requires Admin access and confirmation.
- Settings includes Export Data Backup and Restore Data Backup. Backup files contain business/customer data; keep them in a safe location outside browser storage.

## Upgrade and recovery

1. Keep the same hosting address and browser profile to retain existing offline data. Do not clear browser storage during the upgrade.
2. Run `supabase.offline-sync.sql` in Supabase, then run `npm ci` and `npm run build` and deploy the resulting `dist` contents.
3. Close old app tabs. Open the updated app online and reload once so the updated service worker can cache the current assets for offline use.
4. Existing local products, customers, prescriptions, sales, and pending deletions migrate automatically on first launch. The legacy keys are retained but are no longer used after migration.
5. In Settings, export a backup, then choose Sync Now. Wait for **All changes synced to cloud** with no pending changes before clearing browser data.
6. If storage was cleared after successful sync, opening the same configured app online reloads records from Supabase. If unsent records were cleared, use Restore Data Backup. Without an exported backup or a server copy, erased offline records cannot be recovered.

An internet connection alone does not confirm upload: database configuration, permissions, and validation must also succeed. Sync errors are shown with their actual messages. Persistent browser storage is requested where supported, but this cannot prevent explicit clearing of site data.

Use one active POS tab per browser profile. Where supported, browser locks serialize tab uploads and stale tab edits are rejected. New stock changes use deltas so offline device deductions accumulate; other record fields still use last-uploaded values. Both local checkout and cloud upload are atomic. Insufficient cloud stock requires reconciliation and keeps the batch pending. Cashier preferences and cart drafts remain device-local. Offline login requires a successful online login on that device within seven days.

## Verification

Run `npm test`, `npm run build`, and `npm run lint`.

The 25 regression tests cover offline restart/reconnect, interrupted uploads, overlapping edits, stale reads, deletions, foreign-key ordering, migration, storage quota failure, backup restore, service-worker API exclusions, password verification, and stale tabs. PGlite executes the PostgreSQL migration to verify transactional rollback, multiple offline devices, lost-response replay, and stock shortage. Isolated browser checks confirmed a sale, receipt, reduced stock, and retained reports with the preview server stopped. Live Supabase end-to-end testing has not been performed.

## Supabase handoff notes

The schema includes products, customers, prescriptions, sales, and audit logs. It also includes starter data and permissive development RLS policies for anon/authenticated access. Tighten those policies before production use.
