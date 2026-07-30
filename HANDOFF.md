# Fleet RTO — Developer Handoff & Technical Documentation

A mobile-first PWA for tracking Indian RTO compliance documents (Insurance, FC, PUC, Road Tax, Permit, RC) across a vehicle fleet, with FCM push notifications and a daily expiry-check cron.

---

## 1. Architecture & Tech Stack

### Frontend
- **Framework:** React 19 + **TanStack Start v1** (full-stack React on Vite 7). File-based routing via `@tanstack/react-router` (route tree generated to `src/routeTree.gen.ts` — do not edit).
- **Build tool:** Vite 8 (`vite dev`, `vite build`). Target runtime is a Cloudflare Worker / edge (via `@lovable.dev/vite-tanstack-config` + `nitro`).
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`, configured in `src/styles.css` — no `tailwind.config.js`). Utility class merging via `tailwind-merge` + `clsx` (`src/lib/utils.ts`).
- **UI kit:** shadcn/ui (Radix primitives under `src/components/ui/*`) + `lucide-react` icons + `sonner` toasts + `vaul` drawers.
- **Data layer:** `@tanstack/react-query` v5 for server state; forms via `react-hook-form` + `zod` + `@hookform/resolvers`.
- **State:** No global store. Query cache + local `useState` only.

### Backend / Services
- **Supabase (Lovable Cloud):** Postgres + Auth + Edge Functions. Client at `src/integrations/supabase/client.ts` (auto-generated), server admin client at `client.server.ts`. Types at `src/integrations/supabase/types.ts`.
- **Firebase Cloud Messaging (FCM):** Web push. Client SDK `firebase@12` in `src/lib/firebase.ts`; service worker at `public/firebase-messaging-sw.js`.
- **Supabase Edge Function:** `supabase/functions/check-expiries/index.ts` (Deno) — daily digest, signs FCM v1 JWT server-side with the service account.

### Third-party libraries of note
| Purpose | Package |
|---|---|
| Charts | `recharts` |
| Date pickers | `react-day-picker` + `date-fns` |
| Carousel | `embla-carousel-react` |
| OTP input | `input-otp` |
| Command palette | `cmdk` |

---

## 2. File Structure & Routing

```
src/
├── router.tsx                    # createRouter + QueryClient
├── start.ts                      # TanStack Start client entry; registers attachSupabaseAuth middleware
├── server.ts                     # SSR entry
├── styles.css                    # Tailwind v4 + theme tokens
├── routeTree.gen.ts              # AUTO-GENERATED — never edit
├── routes/
│   ├── __root.tsx                # Root layout, manifest/theme-color <head>
│   ├── index.tsx                 # Public landing / redirect
│   ├── auth.tsx                  # Email/password sign in + sign up
│   └── _authenticated/
│       ├── route.tsx             # Auth guard (redirect to /auth if no session)
│       ├── dashboard.tsx         # Fleet list + stats + search + add button
│       └── vehicles.$vehicleId.tsx  # Vehicle detail — per-doc severity
├── components/
│   ├── AppShell.tsx              # Header, nav, notification bell + Alerts drawer, Enable-push CTA
│   ├── VehicleCard.tsx           # Mobile card with color-coded status + issue badges
│   ├── VehicleForm.tsx           # Add/Edit modal, native date inputs, all 6 expiries
│   └── ui/*                      # shadcn components (auto-generated, safe to extend)
├── lib/
│   ├── compliance.ts             # daysUntil, severityFor, overallStatus, issuesFor
│   ├── firebase.ts               # FCM init, permission, token upsert, foreground listener
│   ├── utils.ts                  # cn() helper
│   └── error-capture.ts / error-page.ts / lovable-error-reporting.ts
├── integrations/supabase/
│   ├── client.ts                 # Browser client (RLS applies) — GENERATED
│   ├── client.server.ts          # Service-role admin client — GENERATED
│   ├── auth-middleware.ts        # requireSupabaseAuth for server fns — GENERATED
│   ├── auth-attacher.ts          # Attaches bearer to serverFn calls — GENERATED
│   └── types.ts                  # DB typings — GENERATED
└── hooks/use-mobile.tsx
public/
├── manifest.webmanifest          # PWA manifest
└── firebase-messaging-sw.js      # FCM background handler
supabase/
├── config.toml                   # GENERATED
└── functions/check-expiries/index.ts   # Deno edge function (daily cron)
```

**Routing conventions (TanStack file-based):**
- Dots in filenames = URL slashes. `vehicles.$vehicleId.tsx` → `/vehicles/:vehicleId`.
- `_authenticated/` = pathless layout; the segment is NOT in the URL but IS in `createFileRoute("/_authenticated/...")` strings.
- Auth gate lives in `src/routes/_authenticated/route.tsx` — all protected pages must live under this folder.

**Auth flow:**
1. `auth.tsx` → `supabase.auth.signInWithPassword` / `signUp` (email+password).
2. On signup, DB trigger `handle_new_user` inserts a `profiles` row with default role `Manager`.
3. `_authenticated/route.tsx` `beforeLoad` calls `supabase.auth.getUser()` and redirects to `/auth` if unauthenticated.
4. Session is persisted to `localStorage` via the Supabase JS client (see `client.ts`).

---

## 3. Database Schema & Backend

All tables live in the `public` schema. RLS is **enabled** on every table.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id` (cascade) |
| `full_name` | text | |
| `email` | text | |
| `role` | `app_role` enum (`'Admin' \| 'Manager'`) | default `'Manager'` |
| `created_at` / `updated_at` | timestamptz | |

**Policies (authenticated only):**
- SELECT / INSERT / UPDATE — only when `auth.uid() = id`
- DELETE — denied

**Trigger:** `handle_new_user()` on `auth.users` insert → auto-creates a profile row.

### `vehicles`
| Column | Type |
|---|---|
| `id` | uuid PK |
| `license_plate`, `make_model`, `assigned_driver` | text |
| `insurance_expiry`, `fc_expiry`, `puc_expiry`, `road_tax_expiry`, `permit_expiry`, `rc_expiry` | date |
| `created_by` | uuid |
| `created_at` / `updated_at` | timestamptz |

**Policies:** authenticated users can SELECT/INSERT/UPDATE/DELETE all rows (fleet is shared across all logged-in users).

### `push_tokens`
| Column | Type |
|---|---|
| `id` | uuid PK |
| `user_id` | uuid |
| `token` | text (FCM registration token) |
| `user_agent` | text |
| `created_at` | timestamptz |

**Policies:** users can only CRUD their own tokens (`auth.uid() = user_id`).

### Relationships
- `profiles.id` → `auth.users.id`
- `push_tokens.user_id` → `auth.users.id` (logical; no FK required)
- No FK between `vehicles` and `profiles` (shared fleet).

### Data-fetching pattern
- Every server read uses `useQuery` with a stable key (e.g. `["vehicles"]`, `["vehicle", id]`).
- Mutations use `useMutation` + `queryClient.invalidateQueries` to refresh cards/detail.
- No SSR loaders — the auth-gated routes have `ssr: false`; SSR would 401 without a session.

---

## 4. Security & Vulnerability Audit

### Where secrets live
| Kind | Location | Exposure |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` + bundled into client | Public (anon key, safe — protected by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function env only | **Server-only; never ship to client** |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Supabase secret (Edge Function env) | **Server-only** |
| `GOOGLE_API_KEY` (Firebase web `apiKey`) | Hardcoded in `src/lib/firebase.ts` + `public/firebase-messaging-sw.js` | Publishable by design (restrict by domain + package in Firebase Console) |
| `VAPID_KEY` | Hardcoded in `src/lib/firebase.ts` | Public by design |

**Action items for the auditor:**
1. In Firebase Console, restrict the Web API key to the published + preview domains (HTTP referrer restriction) and to FCM / Identity Toolkit APIs only.
2. Verify no `.env` values with `SUPABASE_SERVICE_ROLE_KEY` or `FIREBASE_SERVICE_ACCOUNT_JSON` are committed. Currently they live only in Supabase secrets — confirm before deploy.

### Authentication
- Email/password via Supabase Auth. **No email confirmation** is currently enforced — configure in Supabase Auth settings if required.
- No password strength/HIBP check enabled — recommend enabling *Leaked Password Protection* in Supabase Auth.
- No password-reset flow implemented (`/reset-password` route missing). Add before production.
- No rate limiting beyond Supabase defaults.
- Roles (`Admin` / `Manager`) are stored on `profiles` but **not yet enforced anywhere** — currently every authenticated user has full CRUD on `vehicles`. If Admin-only mutations are required, move roles to a separate `user_roles` table and use a `has_role()` SECURITY DEFINER function (see standard Supabase role pattern) — never trust client-side role checks.

### RLS status
| Table | RLS | Notes |
|---|---|---|
| `profiles` | ✅ locked to owner | |
| `vehicles` | ✅ enabled; any authenticated user has full CRUD | **Broad by design** — tighten if multi-tenant |
| `push_tokens` | ✅ owner-only | |

Two prior findings were remediated in this handoff cycle:
- `SUPA_rls_policy_always_true` — fixed (removed permissive `USING (true)` policies where not intended).
- `profiles_all_authenticated_read` — fixed (profiles now scoped to `auth.uid() = id`).

### Insecure patterns to review
- `src/integrations/supabase/client.server.ts` (service-role client) must **never** be imported from route files or `*.functions.ts` that ship to the browser — only from `*.server.ts` or dynamically inside handlers. Currently unused; audit if the developer adds server-side admin logic.
- Edge Function `check-expiries` currently expects `Authorization: Bearer <anon key>` for cron calls but does **not** verify a signing secret. If exposed publicly, anyone could trigger a push blast to all registered tokens. **Recommend**: add a `CRON_SECRET` env var and reject requests without it.
- No CSRF concern (token-based auth, same-origin API).
- No file upload surfaces yet.

### Hardcoded values
- Firebase config (public by design) is hardcoded — acceptable.
- `THRESHOLD_DAYS = 30` and doc-field labels are hardcoded in both `src/lib/compliance.ts` and the edge function — keep in sync.

---

## 5. Mobile App Conversion (APK) via Capacitor

The app is a mobile-first PWA and is a good Capacitor candidate. Steps:

```bash
bun add @capacitor/core @capacitor/cli @capacitor/android
bunx cap init "Fleet RTO" com.yourcompany.fleetrto --web-dir=dist
bun run build          # produces dist/
bunx cap add android
bunx cap sync android
bunx cap open android  # opens Android Studio → Build > Generate Signed APK
```

### `capacitor.config.ts` skeleton
```ts
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.yourcompany.fleetrto',
  appName: 'Fleet RTO',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};
export default config;
```

### Router / SSR consideration
This project uses **TanStack Start with SSR**. Capacitor ships static assets — you must build in **client-only / SPA mode**:
- Ensure every route is client-renderable (the auth routes already set `ssr: false`; verify others).
- If the SSR entry produces a server bundle only, adapt the build to emit a static `dist/` (Vite `vite build --mode=production` producing static output; you may need to swap `@lovable.dev/vite-tanstack-config` for a plain Vite/React config OR pre-render all routes). This is the **single biggest conversion risk** — budget time to validate.

### Push notifications on native
Web push via FCM SW **will not work** inside a Capacitor WebView. Replace with:
```bash
bun add @capacitor/push-notifications
```
- Register the device token native-side, upsert into the same `push_tokens` table (add a `platform` column: `web | android | ios`).
- The existing `check-expiries` edge function's FCM v1 send already supports both web and native tokens — just remove the `webpush` block for native sends.

### UI/UX gotchas to fix before APK
| Area | Issue | Fix |
|---|---|---|
| Touch targets | Some icon-only buttons < 44×44 | Ensure `h-11 w-11` minimum |
| Native date pickers | `<input type="date">` renders differently in WebView | Test on device; consider `react-day-picker` fallback |
| Safe areas | No `env(safe-area-inset-*)` padding on header/footer | Add `pt-[env(safe-area-inset-top)]` to `AppShell` |
| Back button | Hardware back not wired | Add `App.addListener('backButton', ...)` from `@capacitor/app` |
| Status bar | No color set | Use `@capacitor/status-bar` |
| Offline | No offline caching / service worker for app shell (only FCM SW) | Add `vite-plugin-pwa` if offline is required — see PWA skill |
| External links | Open in WebView by default | Use `@capacitor/browser` for outbound links |
| Deep links | Not configured | `@capacitor/app` + intent filters for `/vehicles/:id` |

---

## 6. Known Limitations & Next Steps

### Bugs / gaps
1. **No password reset UI** — `resetPasswordForEmail` not wired; `/reset-password` route missing.
2. **Roles unused** — `profiles.role` exists but no UI or RLS enforces Admin vs Manager. If required, migrate to a dedicated `user_roles` table.
3. **Edge Function is unauthenticated** — daily cron endpoint should verify a shared secret before sending pushes.
4. **No email verification** on signup — configurable in Supabase Auth settings.
5. **User count is unlimited** — the old 5-user cap was removed; access is controlled purely by the `approved_emails` allowlist.
6. **Icons**: `manifest.webmanifest` only references `/favicon.ico`. Add proper 192px + 512px PNG icons for install prompts and APK adaptive icons.
7. **Foreground notifications** rely on `sonner` toasts — verify the `onMessage` listener is initialized once in `AppShell` and not duplicated.
8. **No `og:image`** on any route — social preview will fall back to Lovable's screenshot.
9. **`created_by` on vehicles is never set** on insert — populate from `auth.uid()` in `VehicleForm` if you want to track authorship or scope RLS later.
10. **No pagination** on the vehicles list — will degrade past a few hundred rows.

### Technical debt
- Compliance logic is duplicated between `src/lib/compliance.ts` (TS) and the edge function (Deno). Extract to a shared JSON config or generate one from the other.
- Error boundary components (`src/lib/error-page.ts`, `error-capture.ts`) exist but are lightweight — add Sentry/Bugsnag before production.
- No automated tests. Add Vitest for `compliance.ts` (pure functions, easy wins) and Playwright for auth + add-vehicle flow.
- Bundle size not audited — Firebase SDK is heavy (~200 KB gzipped); consider lazy-loading `enablePushNotifications` only when the user opts in (already partially the case).
- Manifest `start_url: "/"` — installed users hit the public index route which redirects. Consider `start_url: "/dashboard"` after auth verification.

### Recommended first tasks for the new developer
1. Enable Supabase email confirmation + HIBP password check.
2. Add `CRON_SECRET` to `check-expiries` and to the pg_cron `net.http_post` header.
3. Add password reset route.
4. Add proper PWA icons (192 / 512 / maskable).
5. Prototype the Capacitor build early to catch the SSR-to-static conversion friction.
6. Decide on the role model (drop `profiles.role` or add a `user_roles` table + `has_role()` RPC).

---

**Contact points**
- Supabase project ref: see `.env` `VITE_SUPABASE_PROJECT_ID`
- Firebase project: `tma-fleet` (VAPID + service account already provisioned)
- Published URL: https://rego-watch-pro.lovable.app

---

## 7. Access Control (Admin + Approved Emails)

- **Admin account:** `tma.fleetrto@gmail.com`. On signup, `public.handle_new_user()`
  assigns it the `Admin` role; every other address gets `Manager` and an Admin can
  promote/demote them from Profile → Users (`src/components/UserRoles.tsx`), which
  rewrites both `user_roles` and the display field `profiles.role`.
- **Admin-only visibility:** the Approved-emails and Users tabs are rendered only
  when `useIsAdmin()` is true, and RLS blocks non-admin reads/writes server-side.
- **Notification schedule:** three pg_cron jobs — `rto-expiry-check-0800ist`,
  `-1300ist`, `-1800ist` (02:30 / 07:30 / 12:30 UTC) all POST to `check-expiries`.
- **Roles table:** `public.user_roles (user_id, role)` — roles are NOT read from
  `profiles` for authorization. Use `public.has_role(uuid, app_role)`
  (SECURITY DEFINER) in policies. A trigger on `profiles` silently reverts
  self-service role changes by non-admins.
- **Allowlist:** `public.approved_emails`. Admin-only read/write via RLS.
  Anonymous visitors can only call `public.is_email_approved(text)`, which returns
  a boolean and never leaks the list.
- **Enforcement:** `src/routes/auth.tsx` blocks sign-in/sign-up for non-approved
  emails; `AppShell` re-checks on every mount and signs out revoked users.
  Admin UI lives in `src/components/ApprovedEmails.tsx` (Profile → Approved emails).

## 8. Building a Fully Independent Android APK (zero subscription)

Goal: an APK that ships its own HTML/JS bundle (no Lovable hosting dependency),
with working push notifications, using only free tiers.

### 8.0 Prerequisites (one time)
- Node 20+ and npm (or bun)
- Android Studio (latest) with **Android SDK Platform 34+** and **Build Tools**
- JDK 17 (bundled with Android Studio: *Settings → Build Tools → Gradle → Gradle JDK*)
- A Firebase project (`tma-fleet`) — already created for this app

### 8.1 Export the code and install
```bash
git clone <your-github-repo> tma-fleet && cd tma-fleet
npm install
```

### 8.2 Produce the static web build
```bash
npm run build            # outputs dist/client
```
All data access is client-side Supabase (`VITE_SUPABASE_*` in `.env`), so the
static bundle is functionally complete offline of Lovable.
Do **not** set `server.url` in `capacitor.config.ts` — that makes the APK depend
on the hosted site.

### 8.3 Add Capacitor
```bash
npm i @capacitor/core @capacitor/android @capacitor/app @capacitor/push-notifications
npm i -D @capacitor/cli
npx cap init "TMA Fleet" com.tma.fleet --web-dir=dist/client
npx cap add android
```
`capacitor.config.ts`:
```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tma.fleet",
  appName: "TMA Fleet",
  webDir: "dist/client",
  android: { allowMixedContent: false },
  plugins: { PushNotifications: { presentationOptions: ["badge", "sound", "alert"] } },
};
export default config;
```
Re-run after **every** web change:
```bash
npm run build && npx cap sync android
```

### 8.4 Native push (free, FCM)
1. Firebase console → *Project settings → Your apps → Add Android app*,
   package name `com.tma.fleet`. Download `google-services.json` into
   `android/app/`.
2. `android/build.gradle` → `classpath 'com.google.gms:google-services:4.4.2'`;
   `android/app/build.gradle` → `apply plugin: 'com.google.gms.google-services'`.
3. In the app, branch on platform (web keeps `src/lib/firebase.ts`):
```ts
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

if (Capacitor.isNativePlatform()) {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive === "granted") await PushNotifications.register();
  PushNotifications.addListener("registration", async ({ value }) => {
    await supabase.from("push_tokens").upsert(
      { user_id: uid, token: value, user_agent: "android" },
      { onConflict: "token" },
    );
  });
}
```
4. Android 13+ requires the runtime permission — Capacitor adds
   `POST_NOTIFICATIONS` to the manifest automatically; the prompt comes from
   `requestPermissions()`.
5. Server side needs no change: the `check-expiries` function already pushes to
   every row in `push_tokens` via the FCM HTTP v1 API, three times a day
   (8:00, 13:00, 18:00 IST via `pg_cron`).

### 8.5 Debug APK (for testing)
```bash
npx cap open android      # Android Studio → Build → Build Bundle(s)/APK(s) → Build APK(s)
# or headless:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```
Install: `adb install -r app-debug.apk`.

### 8.6 Signed release APK (for distribution)
```bash
keytool -genkey -v -keystore tma.jks -alias tma -keyalg RSA -keysize 2048 -validity 10000
```
`android/key.properties` (git-ignored):
```
storeFile=../../tma.jks
storePassword=****
keyAlias=tma
keyPassword=****
```
Wire it in `android/app/build.gradle` under `signingConfigs.release` and
`buildTypes.release.signingConfig`, then:
```bash
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
Keep `tma.jks` backed up — losing it blocks future updates on Play Store.

### 8.7 Release checklist
- [ ] Icons: 192/512 PNG + adaptive icons (`npx @capacitor/assets generate`)
- [ ] Bump `versionCode` / `versionName` in `android/app/build.gradle`
- [ ] Auth deep links: register an App Link/custom scheme and pass it as
      `emailRedirectTo` / password-reset `redirectTo`, otherwise those emails
      open a browser instead of the app
- [ ] `viewport-fit=cover` + safe-area padding; verify `<input type="date">`
      pickers inside the WebView
- [ ] Test offline behaviour (React Query cache is memory-only)
- [ ] Verify a push arrives on a real device after sign-in

### 8.8 Costs — everything used here is free
| Service | Free tier | Notes |
|---|---|---|
| Capacitor + Android Studio | Free | Open source |
| Firebase Cloud Messaging | Free, unmetered | No Blaze plan required for FCM |
| Supabase / Lovable Cloud | Free tier | DB, auth, server functions, pg_cron |
| Sideloaded APK distribution | Free | Play Store listing is a one-time $25, optional |

