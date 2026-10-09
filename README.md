# PURELA PHARMACY POS

An installable offline pharmacy point-of-sale app built with React, TypeScript, Vite, Lucide icons, and Recharts.

## Offline Mode

PURELA PHARMACY now runs without Supabase or any paid online database. Products, customers, prescriptions, sales, reports, cashier name, and receipt history are saved on the installed computer in the browser's local app storage.

The app can be installed as a PWA from the browser. Once installed, sales can continue without internet.

## Staff Login

Use these local accounts on the installed POS:

- Admin: username `admin`, password `admin123`
- Cashier: username `cashier`, password `cashier123`

Admin can add, edit, delete, and clear products. Cashier can use the sales register, receipts, customers, prescriptions, and reports without product management controls.

## Backup and Moving to Another System

Use **Settings > Export Data Backup** to download a JSON backup file. Keep this file somewhere safe, such as a flash drive, external disk, or cloud folder.

To move to another computer:

1. Open/install the app on the new computer.
2. Go to **Settings**.
3. Choose **Restore Data Backup**.
4. Select the latest exported JSON backup file.
5. Confirm that products, customers, prescriptions, sales, and reports appear.

Export a backup at the end of each business day. Browser storage can be lost if Windows, the browser, or a cleaner app clears site data.

## Features Included

- PURELA PHARMACY branding with Naira pricing
- Install button for app-style use on a POS computer
- Local Admin and Cashier login with cashier name on receipts
- Working register workflow with medicine search, cart quantities, discounts, payment method, stock validation, and receipt generation
- Checkout updates inventory counts and writes sales into the local database
- Prescription-aware product flags, patient attachment requirements, and a status queue
- Customer profiles with insurance, allergy, refill, phone, and consultation signals
- Inventory management for stock, batch, supplier, shelf location, reorder level, expiry risk, stock adjustments, product edit/delete, and popup product creation
- Reports with shift and date filters for Morning Shift and Afternoon Shift
- Backup and restore for transferring records to another system

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploy or copy the `dist` folder to the computer that will run the POS.

## Deploy on Netlify

This project includes `netlify.toml`, so Netlify can deploy it directly from GitHub.

1. Push this repository to GitHub.
2. Open Netlify and choose **Add new site > Import an existing project**.
3. Select the GitHub repository.
4. Use these settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Deploy the site.

After deployment, open the Netlify link in the POS computer browser and click **Install App**.

Because this is offline/local mode, each browser/device keeps its own database. Use **Settings > Export Data Backup** and **Restore Data Backup** when moving records to another computer.

## Verification

Run:

```bash
npm test
npm run lint
npm run build
```

The tests cover local storage reliability, backup restore/validation, service-worker behavior, and the legacy sync engine used by older backups.
