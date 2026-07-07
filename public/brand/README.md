# Marked in Red — logo assets

All wordmark text is **converted to vector path outlines** (extracted from Manrope Semibold).
The SVGs do **not** depend on the Manrope font being installed — no `<text>`, no `@font-face`,
no embedded fonts. Every file is self-contained: correct `viewBox`, no fixed width/height that
blocks scaling, no external references, no raster images, no clip-path or metadata.

The red gesture is a single holed map-pin, used as the tittle of the "i" in "in".
One red element only.

## Colors
- Primary red (light grounds): `#b70011`
- Brighter red (dark grounds): `#dc2626`
- Neutral text: `#1f2733`
- Warm-white text / light ground: `#FAF7F2`

## Type & clear-space rules (unchanged from the spec sheet)
- Manrope Semibold, +3% letter-spacing, sentence case. Secondary text in Inter.
- Clear space around any lockup = the height of the "M". Minimum wordmark width 120px;
  below that use the monogram or the pin alone.
- Flat vector only — no shadows, gradients, glows, or 3D.

## SVG source files

| File | Use | Foreground | Background |
|------|-----|-----------|-----------|
| `wordmark-horizontal.svg` | Primary horizontal lockup | Text `#1f2733`, pin `#b70011` | Transparent |
| `wordmark-horizontal-dark.svg` | Horizontal, dark grounds | Text `#FAF7F2`, pin `#dc2626` | Transparent |
| `wordmark-stacked.svg` | Stacked lockup, light | Text `#1f2733`, pin `#b70011` | Transparent |
| `wordmark-stacked-dark.svg` | Stacked lockup, dark | Text `#FAF7F2`, pin `#dc2626` | Transparent |
| `wordmark-mono.svg` | One-color, any ground | `currentColor` (inherits CSS `color`) | Transparent |
| `monogram.svg` | "i" glyph + pin, standalone mark | Stem `#1f2733`, pin `#b70011` | Transparent |
| `favicon.svg` | Modern SVG favicon (holed pin) | Pin `#b70011` | Transparent |
| `favicon-solid.svg` | Solid pin — source for 16px raster | Pin `#b70011` | Transparent |
| `app-icon-light.svg` | Monogram on rounded square, light | Stem `#1f2733`, pin `#b70011` | Ground `#FAF7F2` |
| `app-icon-dark.svg` | Monogram on rounded square, dark | Stem `#FAF7F2`, pin `#dc2626` | Ground `#1f2733` |

## Raster exports (`raster/`)

| File | Use | Source | Background |
|------|-----|--------|-----------|
| `favicon-16.png` | 16px favicon | `favicon-solid.svg` (no hole) | Transparent |
| `favicon-32.png` | 32px favicon | `favicon.svg` (holed) | Transparent |
| `favicon-48.png` | 48px favicon | `favicon.svg` (holed) | Transparent |
| `apple-touch-icon-180.png` | iOS home-screen icon | `app-icon-light.svg` | Solid ground |
| `icon-192.png` | PWA icon | `app-icon-light.svg` | Solid ground |
| `icon-512.png` | PWA icon | `app-icon-light.svg` | Solid ground |

The `wordmark-mono.svg` inherits its color from CSS, e.g.:

```css
.logo { color: #1f2733; }        /* or #FAF7F2 on dark */
```

## Next.js `<head>` (App Router: place icons in `/public`)

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="icon" href="/favicon-16.png" sizes="16x16" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png" />
```

`_preview.html` in this folder is a visual index of every asset (not a deliverable).
