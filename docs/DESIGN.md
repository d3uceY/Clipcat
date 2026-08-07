# Clipcat Docs — Design System ("The Desk")

> Recorded from the built world. Warm & physical: ink on paper, one signature
> accent — Clipcat Green. Direction pinned by the user ("warm & physical,
> keeps Clipcat's personality, elevated"), executed at award-level craft.

## Concept

Clipcat is a clipboard manager — a quiet, tactile desk companion you reach for
without thinking. The docs surface is built as a **desk**: warm paper ground,
ink hairlines, physical depth from soft layered shadows, and motion that
"clips" and settles like a physical object. It refuses the sterile
developer-tool look and refuses Comic-Sans energy.

## Palette

Warm neutrals throughout — never pure black or white. One accent carries the
whole surface: **Clipcat Green**, taken from the brand mark.

| Token | Value |
|---|---|
| `--cc-paper` (page) | `#F4EEE2` |
| `--cc-surface` (cards) | `#FBF7EE` |
| `--cc-raised` (frames) | `#FFFCF4` |
| `--cc-ink` (text) | `#211A10` |
| `--cc-muted` | `#6E6049` |
| `--cc-faint` | `#97886E` |
| `--cc-line` (hairline) | `#E4D9C0` |
| `--cc-green` (accent) | `#2E9E45` |
| `--cc-green-deep` | `#1F7A33` |

The accent owns whole regions (the marquee strip, primary buttons), never just
scattered details. The site is **light only**: the theme switch is disabled and
the site never renders a dark mode.

## Typography

- **Display & body:** Bricolage Grotesque (variable 200–800), Google Fonts.
  Characterful, warm, premium — never Inter/Roboto.
- **Data/mono:** Fragment Mono — reserved for keys (`kbd`), versions, labels,
  paths. Never used as a "technical costume".
- **Scale:** hero display up to `6rem` with `-0.03em` tracking and `0.98`
  leading; section heads `clamp(2rem → 3.1rem)`; body `1rem` at 1.7 line
  height, ~70ch measure. Body text ≥ 4.5:1 contrast.
- **Emphasis** comes from weight and size (italic green accent words), never
  gradient text.

## Components & Materials

- **Cards:** 14–16px radius, hairline border at rest, soft shadow only on
  hover lift (border *or* shadow, never both at rest).
- **Buttons:** 12px radius; primary = deep green with paper text; ghost =
  surface + hairline; hover raises 2px with `cubic-bezier(0.16,1,0.3,1)`.
- **Keycaps:** Fragment Mono, warm surface, 1px border + 3px bottom edge
  (tactile "press"). Hover presses the key down.
- **Hero clipboard:** the app screenshot sits in a raised frame with a
  paperclip and a mono version caption; revealed via `clip-path` unfold.
- **Icons:** authored 24px SVG set, 1.5px stroke, round caps, one weight.
  No emoji, no icon fonts.
- **Dark chapter:** the shortcuts section is an ink ground with green glow and
  tactile key rows — a deliberate contrast beat.

## Motion (GSAP)

- One authored moment: the **hero load choreography** — masked title lines
  slide up (expo-out), subtitle, CTAs, then the clipboard frame unfolds via
  `clip-path` with a slight scale settle.
- **Marquee:** continuous `xPercent -50` loop on the green strip; pauses on
  hover.
- Restraint elsewhere: features rise gently (y 26, no clip-path), polaroids
  settle with a springy `back.out`, shortcuts/CTA stay quiet with hover
  micro-interactions only.
- All motion gated behind `prefers-reduced-motion: no-preference` via
  `gsap.matchMedia()`; content is always visible by default.
- GPU-friendly: transforms, opacity, `clip-path` only.

## Files

- `src/css/custom.css` — global theme (tokens, navbar, footer, docs
  typography, tables, admonitions, keycaps).
- `src/pages/index.tsx` + `index.module.css` — homepage.
- `src/pages/download.tsx` + `download.module.css` — download page.
- `src/theme/Root.tsx` — carries the design-direction contract as an HTML
  comment that survives the build.
- Dependencies: `gsap`, `@gsap/react` only.
