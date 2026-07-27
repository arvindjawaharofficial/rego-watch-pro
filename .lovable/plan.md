# TMA Fleet updates

## 1. Rebrand to "TMA Fleet"
- `public/manifest.webmanifest`: `name` → "TMA Fleet · India Compliance", `short_name` → "TMA Fleet".
- `src/components/AppShell.tsx`: header text "Fleet RTO" → "TMA Fleet".
- `src/routes/auth.tsx`: title "Fleet RTO" → "TMA Fleet"; meta title updated.
- `src/routes/index.tsx` + `__root.tsx`: update meta titles to "TMA Fleet".

## 2. Replace truck logo with uploaded TMA image
- Register uploaded image as a Lovable asset:
  `lovable-assets create --file /mnt/user-uploads/Screenshot_20260722_125752_Facebook.jpg --filename tma-logo.jpg > src/assets/tma-logo.jpg.asset.json`
- Import that pointer in `AppShell.tsx` and `auth.tsx`; replace the `<Truck>` icon block with an `<img>` (rounded, same size). Keep Truck icon import removed where unused.
- Favicon: leave default for now (image is not square-cropped for icon rendering); can be addressed later.

## 3. Dashboard label
- `src/routes/_authenticated/dashboard.tsx`: change the "Compliant" stat card label to **"Up to Date"**. Logic unchanged.

## 4. Forgot password
- On `src/routes/auth.tsx` Sign-in tab, add a "Forgot password?" link below the password field. Clicking opens an inline dialog (or toggles a small form) that collects email and calls:
  ```ts
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  ```
- New route `src/routes/reset-password.tsx` (public):
  - Detects Supabase recovery session on mount (listens `onAuthStateChange` for `PASSWORD_RECOVERY`).
  - Shows a "Set new password" form → `supabase.auth.updateUser({ password })`.
  - On success, sign out and redirect to `/auth`.

## 5. Profile section
- Migration: add `phone TEXT` column to `public.profiles` (nullable). Existing RLS (self read/update) already covers it.
- New route `src/routes/_authenticated/profile.tsx`:
  - Loads current user's profile row (`full_name`, `email`, `role`, `phone`).
  - Editable fields: Full name, Mobile number (tel input, India `+91` prefix helper, basic 10-digit validation). Email and role shown read-only.
  - "Save" → updates `profiles` row.
  - "Sign out" button (destructive variant) — moved from AppShell header.
- Nav: in `AppShell.tsx`, replace the header **Sign out** icon button with a **Profile** icon button (`User` from lucide) linking to `/profile`. Keep the notifications bell.

### Mobile OTP verification
Supabase phone/SMS OTP requires a paid SMS provider (Twilio, MessageBird, etc.) — no free tier available through Lovable Cloud. Plan: **store the mobile number without OTP verification**. If you later add a Twilio account, we can wire `supabase.auth.updateUser({ phone })` + `verifyOtp` on top of this field.

## 6. Files touched
- New: `src/routes/reset-password.tsx`, `src/routes/_authenticated/profile.tsx`, `src/assets/tma-logo.jpg.asset.json`.
- Modified: `public/manifest.webmanifest`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/auth.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/components/AppShell.tsx`.
- Migration: add `phone` to `profiles`.

## Open question
OTP is not free — confirm you're OK collecting the mobile number without verification (recommended), or that you'll provide Twilio credentials later so we can enable SMS OTP.
