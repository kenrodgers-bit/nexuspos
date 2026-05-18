# Nexus POS

Nexus POS is a mobile-first, installable Progressive Web App for offline retail checkout. It runs like a standalone Android app from Chrome, stores sales in IndexedDB, deducts inventory immediately, and queues sync events for a future cloud backend.

## Features

- Offline login for admin password and cashier PIN users
- Local IndexedDB storage with Dexie.js
- Product, inventory, sales, receipts, reports, settings, users, backup, and restore workflows
- POS terminal with search, barcode entry, category filters, cart drawer, discounts, tax, cash/M-Pesa/card payments, change calculation, and receipt generation
- Sync queue with online/offline detection, retry logic, pending sync badge, and backend-ready adapter interface
- Self-service account page for admins to update passwords and cashiers to update PINs
- Admin staff management for creating accounts, assigning roles, and deactivating staff away from work
- 58mm and 80mm thermal receipt layouts, browser print, plain text fallback, and Web Share API support
- PWA manifest, Workbox service worker, app shell precaching, offline fallback page, Android icons, install prompt, and update prompt
- Dark/light mode and mobile bottom navigation

## Tech Stack

React, Vite, TypeScript, TailwindCSS, vite-plugin-pwa, Workbox, IndexedDB, Dexie.js, Zustand, React Router, React Hook Form, Zod, Lucide React, Recharts, react-hot-toast, and UUID.

## Setup

```bash
npm install
npm run generate:icons
npm run lint
npm run build
npm run preview
```

Local preview defaults to `http://localhost:4173`.

## First Login

Use the initial account configured for your installation, then rotate credentials from the Users page before live operation.

## Android Install

1. Open the deployed HTTPS URL in Chrome on Android.
2. Sign in once while online so the app shell and seed data initialize.
3. Tap the in-app `Install App` button or Chrome menu `Install app` / `Add to Home screen`.
4. Open Nexus POS from the Android home screen. It will launch in standalone portrait mode and continue working offline.

## Offline Data

All core actions run locally:

- Login
- Products and inventory
- Sales and stock deduction
- Receipts and reports
- Settings
- Backup and restore

Cloud sync is intentionally adapter-based. The current `MockSyncAdapter` marks queued events as synced when online. Replace it in `src/services/syncService.ts` with a real API adapter when a backend is available.

## Backup And Restore

Go to Settings:

- `Backup JSON` exports every IndexedDB table.
- `Restore JSON` validates the Nexus POS backup shape, warns before overwrite, then restores local data.

Keep backups secure because they contain local business records and hashed login credentials.

## Build

```bash
npm run lint
npm run build
```

The production build emits `dist/`, `manifest.webmanifest`, `sw.js`, generated icons, and precached app assets.

## Deployment

Preferred deployment is Vercel:

```bash
vercel
vercel --prod
```

The included `vercel.json` rewrites SPA routes to `index.html` and prevents HTTP caching of app-shell HTML. Runtime business data is stored in IndexedDB, not HTTP cache.

## GitHub

Repository name:

```text
nexus-pos-pwa
```

If GitHub CLI is installed and authenticated:

```bash
gh repo create nexus-pos-pwa --public --source=. --remote=origin --push
```

If GitHub CLI is not installed, create a public GitHub repository named `nexus-pos-pwa`, then add its remote:

```bash
git remote add origin <REMOTE_URL>
git branch -M main
git push -u origin main
```
