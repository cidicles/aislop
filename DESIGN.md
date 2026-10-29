# DESIGN.md — aislop.cloud

The landing page (`server/www/index.html`) is a portfolio of AI-built projects.
Its job is to *experience* first, then *persuade*: make someone want to click
Play, then make it obvious the work is real (source, model, how it's hosted).

## 1. Visual theme & atmosphere

Warm near-black, one loud acid accent, glossy slime. The brand is self-mocking
("slop") but the craft is not: tight type, honest data, nothing decorative that
doesn't carry information. Dense where it informs (timeline, memory budget),
generous around the work itself (thumbnails are the hero of each card).

## 2. Color palette & roles

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg` | `#0c0b09` | `#f5f2e9` | Page |
| `--surface` | `#15130f` | `#fffdf7` | Cards, panels |
| `--line` | `#2a2620` | `#e0d9c8` | 1px borders, grid lines |
| `--ink` | `#f4f0e6` | `#16140f` | Primary text |
| `--muted` | `#a39d90` | `#5d584c` | Secondary text (≥ 4.5:1 on `--bg`) |
| `--slop` | `#c6f432` | `#c6f432` | Accent fills: primary button, goo, focus ring |
| `--slop-text` | `#c6f432` | `#4d6a00` | Accent used *as text* (lime fails contrast on light) |
| `--on-slop` | `#141807` | `#141807` | Text on lime fills |

Model colours are data, not decoration, and are the only other hues on the page:
Opus 5 `--m-opus5`, Fable 5.1 `--m-fable`, Opus 5.5 `--m-opus55`, unrecorded
`--m-none`. They appear on card chips, the timeline and its legend, nowhere else.

## 3. Typography

- Display & UI: **Bricolage Grotesque** (variable, opsz 12–96, wght 400–800).
  Display sizes use `opsz 96`, tracking −0.05em, line-height 0.86.
- Data, labels, dates: **JetBrains Mono** 400/500, 12–13px.
- Scale: hero `clamp(64px, 13vw, 184px)` · h2 `clamp(36px, 5vw, 64px)` ·
  card title 28px · body 16–18px · meta 12–13px mono. Measure ≤ 34em.
- One heading level per section; no skipped levels.

## 4. Components

- **Primary button** — lime fill, `--on-slop` text, 999px radius, 48px tall.
  Exactly one per view (hero: play newest; featured: play).
- **Secondary link** — text + arrow, underline on hover.
- **Card** — `--surface`, 1px `--line`, 20px radius, 16:10 thumbnail on top. The
  whole card opens the project (stretched link); "Source" sits above it as its
  own target. Hover: border goes lime, a cursor-following spotlight, image
  scales 1.04. No nested cards, no icon tiles.
- **Model chip** — coloured dot + model name in mono. Never a filled badge.
- **Filter** — segmented control, `aria-pressed` buttons.

## 5. Layout

12-column grid, max 1280px, gutter `clamp(16px, 4vw, 40px)`. Back catalogue is
an asymmetric bento (7/5, 5/7, 4/4/4) that collapses to uniform columns when a
filter is active and to one column under 760px. Section rhythm 96–160px.

## 6. Depth & elevation

Flat by default. Depth comes from the WebGL goo (specular highlight) and from
hover state only: `0 30px 60px -30px` lime-tinted shadow. No resting shadows.

## 7. Do / don't

Do: real data (dates, models, memory caps from manifests), one primary action,
lazy images with fixed aspect ratios, motion that pauses off-screen.

Don't: eyebrow chips, numbered section labels, gradient text, glassmorphism,
emoji icons, equal-weight metric strips, "Get started" CTAs, italic serif
display type, cards inside cards.

## 8. Responsive

Breakpoints 760px and 1080px. Test at 375, 768, 1024, 1440. Touch targets ≥ 44px.
Timeline labels move above their tracks under 760px. The hero goo renders at
reduced resolution (≤ 0.75 device px) and stops when off-screen, when the tab is
hidden, or (single static frame) under `prefers-reduced-motion`.

## 9. Agent prompt guide

"Build in the aislop.cloud system: warm near-black `#0c0b09`, Bricolage
Grotesque display at opsz 96 with −0.05em tracking, JetBrains Mono for data,
a single acid-lime `#c6f432` accent used for fills and focus only, model colours
only where they encode which model built something. Flat surfaces, 1px warm
borders, 20px card radius. One primary action per view."
