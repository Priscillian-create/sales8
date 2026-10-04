# Offline POS Update

This repository includes the updated app, regression tests, and required database migration.

## Required Deployment Steps

1. Export a data backup from every device that has unsynced records. Keep the original browser storage intact.
2. In the existing project's Supabase SQL Editor, run `supabase.offline-sync.sql`. Run it after the original schema exists. This adds an operation receipt table and a transactional sync function; it does not delete existing pharmacy data.
3. Run `npm ci` and `npm run build`, then deploy the resulting `dist` contents to the existing website. Keep the same website origin so devices retain their saved browser data. Keep your existing Supabase configuration.
4. Reopen the app online. The new service worker installs a complete cache of the app assets. Log in successfully online on each cashier device to enable offline login for that login and password for seven days.
5. Check pending changes and resolve any duplicate batches. Use Sync Now after a correction or after installing the SQL migration. Verify that pending operations reach zero.
6. On a test device, disconnect, make a test sale, check the receipt and report, reopen offline, and reconnect. Compare the sale and stock with Supabase before using the update across all cashier devices.

For development, run `npm ci`, `npm test`, and `npm run dev` in the repository root.

## Changes

- Sales and stock changes remain committed together in local storage.
- Cloud uploads now commit the queued changes in one database transaction.
- Durable operation receipts prevent duplicate stock deductions after a lost response, including when another sale occurs before reconnecting.
- Stock changes apply as deltas, preserving deductions from multiple offline devices.
- Insufficient cloud stock or invalid records reject the transaction and preserve the entire pending queue for review. Offline devices cannot reserve stock held by other devices; overselling conflicts require reconciliation.
- Duplicate batch validation and actionable conflict messages remain in place. Invalid uploads pause until edits or a manual retry.
- Sync runs on reconnect, focus, visibility, and a 15-second visible-page interval. Browser locks prevent competing tab uploads where supported; stale edits are rejected and refreshed rather than overwriting newer local data.
- The production service worker precaches the HTML, all generated JavaScript/CSS, and required app files. Database calls never use the app cache.
- Login by cashier name now resolves the email and verifies the password online. Offline login checks a salted PBKDF2 verifier saved after successful online authentication. Plaintext passwords are not stored.
- Reports aggregate by transaction date, preserve date/shift/payment filters, and support CSV export without a connection.
- Cart drafts and the latest receipt survive reopening. Checkout rejects unavailable/expired products. Prices and discounts round to currency precision. Stock/reorder inputs require integers.
- Product and sale IDs use cryptographic randomness. Expiry alerts use a rolling 90-day window.
- Recovery export is available when the register cannot initialize. Receipt printing hides action buttons.

## Verification And Limits

All 26 automated tests passed. Tests include real PostgreSQL logic through PGlite for rollback, two offline devices, lost-response replay, stock shortage, and selected sale deletion after offline restart and a failed upload. Production build and lint passed; the build retains nonblocking runtime-configuration and large-chunk warnings.

Browser checks used an isolated fixture with cloud configuration disabled, never real sales. With its local server stopped, a sale completed, stock fell from 10 to 9, a receipt showed NGN 100, and an offline reload retained the sale in Reports. Online retry behavior was tested against the local PostgreSQL engine, not the live Supabase service. The browser's backup file-upload control stalled, so interactive backup restore was not verified; data restore logic is covered by automated tests.

The app must have loaded online and finished its cache installation before it can reopen offline. Browser storage is device-specific: clearing it removes unsynced records. Keep regular backups. Storage capacity and device failure can still prevent saving.

Older queued product writes and full backup restores may contain absolute stock snapshots rather than new stock deltas. Review old pending stock and matching backup records before their first upload; full restore intentionally replaces matching values after confirmation. Do not use a backup restore to reconcile another active cashier device without reviewing newer cloud stock.

Existing database access policies are unchanged. The original schema permits anonymous access to POS records. Password verification in the UI does not replace database access controls; review those policies before treating the system as secured against untrusted clients. Offline role/password cache changes on the server take effect after the next verified login or cache expiry.

The production build and migration have not been installed on your live site or database. Live deployment and a controlled live sync check are still required.
