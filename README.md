# Marked in Red

Marked in Red is a free, public awareness website mapping Missing and Murdered Indigenous Women (MMIW) cases across the US and Canada.

This project is awareness-first and non-commercial. It does not include monetization.

## Stack

- Next.js
- Supabase
- Leaflet
- Vercel (free tier)

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your local environment file from the example:
   ```bash
   cp .env.local.example .env.local
   ```
3. Populate `.env.local` with the required values from `.env.local.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `NEXT_PUBLIC_SITE_URL` (defaults to `http://localhost:3000`)
4. Start the development server:
   ```bash
   npm run dev
   ```

## Project status

Early scaffold. Design spec is complete, and the project is awaiting implementation planning.
