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

This local workspace already has `.env` configured for your Supabase project. The app loads products, customers, prescriptions, and sales from Supabase when the tables exist, and keeps browser local storage as a fallback.

## Supabase handoff notes

The schema includes products, customers, prescriptions, sales, and audit logs. It also includes starter data and permissive development RLS policies for anon/authenticated access. Tighten those policies before production use.
