# Self-hosted Montserrat (variable)

Used by `next/font/local` in `app/layout.tsx` so Docker/`next build` does **not**
call `fonts.googleapis.com` (that often fails on VPS).

Source: Google Fonts → fonts.gstatic.com (OFL).
Weights: 100–900. Subsets: latin, latin-ext, cyrillic, cyrillic-ext.
