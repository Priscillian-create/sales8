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
2. Copy `.env.example` to `.env`.
3. Add your `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Restart the dev server.

The supplied `public/supabase-config.js` also supports runtime configuration. The app saves changes locally and queues them for upload to Supabase. The existing SQL schema is sufficient for this update; no database migration is required.

## Offline data fix

- Products, customers, prescriptions, sales, and pending changes share one durable local snapshot.
- Checkout saves the sale, customer update, and stock reduction in one local write. If storage fails, checkout does not report success.
- Only changed records upload. Failed uploads remain queued. Requests run sequentially, and an older response cannot acknowledge a newer change.
- Products and customers upload before prescriptions. Deletions persist even when the final product is removed.
- Startup, reconnect, focus, realtime notifications, and a 30-second timer trigger sync. Settings also provides Sync Now.
- Remote reads are paginated. Responses fetched before a local edit are discarded. The service worker no longer caches database responses.
- Clear Products preserves sales and customers. It requires Admin access and confirmation.
- Settings includes Export Data Backup and Restore Data Backup. Backup files contain business/customer data; keep them in a safe location outside browser storage.

## Upgrade and recovery

1. Keep the same hosting address and browser profile to retain existing offline data. Do not clear browser storage during the upgrade.
2. Deploy the included `dist` contents, or run `npm ci` and `npm run build` and deploy the resulting `dist` contents.
3. Close old app tabs. Open the updated app online and reload once so the updated service worker can cache the current assets for offline use.
4. Existing local products, customers, prescriptions, sales, and pending deletions migrate automatically on first launch. The legacy keys are retained but are no longer used after migration.
5. In Settings, export a backup, then choose Sync Now. Wait for **All changes synced to cloud** with no pending changes before clearing browser data.
6. If storage was cleared after successful sync, opening the same configured app online reloads records from Supabase. If unsent records were cleared, use Restore Data Backup. Without an exported backup or a server copy, erased offline records cannot be recovered.

An internet connection alone does not confirm upload: database configuration, permissions, and validation must also succeed. Sync errors are shown with their actual messages. Persistent browser storage is requested where supported, but this cannot prevent explicit clearing of site data.

Use one active POS tab per browser profile. Concurrent offline edits to the same record on different devices still use last-uploaded values; this patch does not add conflict resolution or transactional server-side stock accounting. Local checkout is atomic, while cloud writes are retried individually. Cashier preferences and the current unsold cart are not cloud business records.

## Verification

Run `npm test`, `npm run build`, and `npm run lint`.

The regression tests cover offline restart/reconnect, recovery from cloud after local storage clearing, failed and interrupted uploads, overlapping edits, stale reads, persistent deletions, foreign-key ordering, remote deletions, unchanged rows, legacy deletion migration, storage quota failure, backup restore/validation, and service-worker API exclusions. Tests use an in-memory cloud transport; they do not write to your live Supabase database. Browser interaction and live-database end-to-end testing are not included.

## Supabase handoff notes

The schema includes products, customers, prescriptions, sales, and audit logs. It also includes starter data and permissive development RLS policies for anon/authenticated access. Tighten those policies before production use.
