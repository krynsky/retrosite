# Handoff: Retrosite

A web app for generating **historical timelines of any website** using archived snapshots. The visual identity is a "digital scrapbook" — paper texture, monospace typography, marker underlines, polaroids, pixel icons, and stamp-shadow buttons. The handoff palette is **Roadside Motel · Neon** (cream paper + hot pink + teal).

---

## About these design files

The files in this bundle are **design references created in HTML**. They are prototypes showing the intended look and behavior — not production code to ship verbatim.

Your job is to **recreate these designs in the target codebase's existing environment** (React, Next.js, Vue, SwiftUI, etc.) using its established patterns, component primitives, and routing. If no environment exists yet, choose the most appropriate framework for the project and implement the designs there.

The HTML files use Babel-transformed JSX in the browser purely for fast iteration. In a real codebase you would:
- Replace inline `<script type="text/babel">` with proper components.
- Replace the `tokens.css` + `tokens.motel.css` cascade with your design-token system (Tailwind config, CSS Modules variables, styled-components theme, etc.).
- Replace the `useTweaks` / `TweaksPanel` system entirely — that is a designer-side preview tool, not a production feature.

## Fidelity

**High-fidelity.** Final colors, typography, spacing, hierarchy, and copy are all intended. Recreate pixel-perfectly using the codebase's existing libraries. The only intentional looseness is the polaroid rotation/tape and the marker scribble — both are stylistic and tolerate small variation.

---

## Palette: Roadside Motel · Neon (default)

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#f0e3c8` | Page background (cream) |
| `--paper-2` | `#e3d4b0` | Secondary surfaces, toolbar fills |
| `--ink` | `#161412` | Primary text, borders, hard shadows |
| `--ink-mute` | `#6b6354` | Secondary text |
| `--ink-faint` | `#9a917e` | Placeholder text |
| `--lime` (primary) | `#ff5fa2` | Primary CTA fill (hot motel-sign pink) |
| `--lime-deep` | `#d23a7e` | Primary CTA pressed |
| `--marker-blue` | `#1e8a9a` | Underline strokes, accent rules |
| `--marker-pink` | `#ff5fa2` | Highlight strokes |
| `--ballpoint` | `#0a4a55` | Pen-blue accent text (deep teal) |
| `--sticky` | `#5ed3d8` | Aqua sticker badge |
| `--sticky-yellow` | `#ffe488` | Warm bulb-yellow sticker |
| `--tape` | `rgba(220,210,175,0.72)` | Polaroid tape strip |

> The variable is named `--lime` for legacy reasons — in this palette it's hot pink. In your codebase, **rename it to `--primary`** when porting.

---

## Typography

Imported from Google Fonts (`tokens.css` has the `@import` line):

| Variable | Family | Used for |
|---|---|---|
| `--font-display` | `JetBrains Mono` 800 | Headlines, brand mark, big numbers |
| `--font-mono` | `Geist Mono` 400/500/600 | Body, buttons, labels, form text |
| `--font-pixel` | `VT323` | Pixel-styled tags & meta |
| `--font-hand` | `Caveat` 600/700 | Polaroid captions, marginalia |

**Type scale** (px): `64 / 48 / 36 / 28 / 22 / 18 / 15 / 13 / 11`. Display sizes are mono and tight (`letter-spacing: -0.01em`, `line-height: 1.05`).

---

## Spacing, radius, shadow

- **Spacing scale**: `4, 8, 12, 16, 24, 32, 48, 64` px (`--s-1` … `--s-8`).
- **Radii**: `0, 2, 6, 10` px and `999` (pill). Most cards use `0` (square corners are part of the look).
- **Borders**: `1px / 2px / 3px / 4px` (`--hair / --rule / --bold / --chunk`). Buttons and form fields use `2.5px solid var(--ink)`.
- **Stamp shadow** (signature look): `box-shadow: 3px 3px 0 0 var(--ink)` on buttons; large variant `5px 5px 0 0 var(--ink)`.
- **Paper shadow** (polaroids): `0 1px 0 rgba(0,0,0,.05), 0 14px 30px -14px rgba(80,60,20,.35)`.

---

## Screens

### Home (single screen in this handoff)

**File**: `Retrosite Home.html`

**Purpose**: Landing page. User pastes a domain and clicks **Create Timeline** to generate a visual history of how that site has changed over the years.

**Layout** (1000px content width, centered, `padding: 22px 30px 30px`):

1. **Topbar** (flex row, space-between, `padding-bottom: 18px`, `border-bottom: 1.5px dashed var(--ink)`)
   - Brand cluster (left): `<ComputerLogo>` 48×48 pixel mark + wordmark "Retrosite" (JetBrains Mono 800, 42px, `letter-spacing: -0.025em`) + pink "Demo" sticker rotated -7°.
   - Nav (right): three stamp buttons — **Timelines** (filled `--lime`/pink, primary), **About** (paper fill, uppercase), **GitHub** (paper fill with small ink circle icon).

2. **Hero** (2-col grid `1fr 1fr`, gap 28, `padding: 44px 0 28px`)
   - **Left column**:
     - Headline: JetBrains Mono 800, 42px, line-height 1.2. Reads **"Create a website timeline using the Wayback Machine"** with `the Wayback Machine` underlined by the double marker SVG (`--marker-blue` teal). Linebreaks are explicit — see HTML.
     - Domain block (`margin-top: 38px`, flex row, gap 14):
       - **Field**: 2.5px ink border, `--paper` fill, padding `18px 18px 14px`, min-width 320, with a floating `DOMAIN OR PATH` legend (Geist Mono 800, 12px, letter-spacing `.12em`) in the top-left notch. Input is borderless, 18px, faint placeholder `example.com/path`.
       - **Create Timeline button**: pink `--lime` fill, 2.5px ink border, stamp shadow, 18px Geist Mono 800, with a chunky pixel arrow SVG (4-step right-pointing triangle) at the right.
     - **Inline export note** (margin-top 22, flex row, gap 16, sits directly under the form): 56px pixel disk icon (teal accent) + 2-line label "Export timelines as / html and markdown" (JetBrains Mono 800, 20px, `--ballpoint` deep-teal text, **no underline**).
   - **Right column**:
     - **Polaroid** (rotated -1.2°, 420 wide): 12px paper border, 28px bottom inset, contains the `<MockSite>` (a 2007-era social-app screenshot built from divs — pale blue `#cfe6f4` chrome, Verdana, two-column body with `chirper` brand logo). The polaroid is a static design element; the inner mock is a stylized period-appropriate web layout.
     - **Caption** below polaroid: Caveat 700, 44px, rotated -2°, reads **"2007 Vibes"** with pink marker underline.

3. **Recent Timelines** section (margin-top 48)
   - Section header: dashed bottom rule, with title **"Recent Timelines"** (JetBrains Mono 800, 26px, `letter-spacing: -0.01em`) on the left and a small uppercase meta count `N saved` on the right (Geist Mono, 12px, `letter-spacing: .14em`, `--ink-mute`).
   - **Card grid**: 3 equal columns, gap 22.
   - **Timeline card** styling:
     - Background `#fbf6e6`, 1px `#c9b88a` border, `--shadow-photo` (the polaroid drop shadow), padding `10px 10px 14px`, cursor pointer.
     - Hover: `transform: translateY(-2px)` ~120ms.
     - **Thumbnail**: full-card width, 150px tall, 1px `rgba(0,0,0,.08)` inner border, contains a stylized period-web preview rendered from divs (NOT a real screenshot). Three thumbnail variants exist in the prototype — text-heavy feed, dark-with-vertical-sidebar, and column-based feed. In production these thumbnails should be **real captured snapshots** of the archived site.
     - **Domain line**: JetBrains Mono 800, 20px, `letter-spacing: -0.015em`, `word-break: break-all`, line-height 1.15, margin `12px 4px 6px`.
     - **Status line**: Geist Mono 800, 12px, `letter-spacing: .12em`, color `--marker-pink`. Reads `COMPLETE — READY` (with the em-dash in `--ink`).
     - **Year range**: Geist Mono 700, 13px, `--ink`. e.g. `2007-2015`.
     - **Timestamp**: Geist Mono 400, 12px, `--ink-mute`. e.g. `Apr 30, 7:42 AM`.
   - Sample data shown in the prototype: `friendfeed.com/krynsky · 2007-2015`, `krynsky.com · 1996-2026`, `friendfeed.com · 2007-2024`. **These are placeholders.** In production, the list comes from the user's saved timelines.

### Design system reference

**File**: `Retrosite Design System.html`

A multi-artboard reference of every token, type spec, and component pattern. Open this whenever you're unsure how a primitive should look. It is **not** a screen to ship — it's a styleguide.

---

## Components to build

All defined in `components.jsx`. Reproduce these as first-class components in the target framework:

| Component | Notes |
|---|---|
| `<Logo size>` / `<ComputerLogo>` | 16×16 pixel SVG of a smiling beige PC + wordmark. Two-tone (ink + screen color). Crisp-edges. |
| `<PixelIcon name size>` | Pixel-grid SVG icons. Names: `computer, disk, globe, clock, folder, doc, bookmark, arrow`. Build the grid lookup once; render with `shapeRendering="crispEdges"`. |
| `<StampButton tone size icon>` | Tones: `lime` (primary/pink), `paper`, `ink`, `pink`, `yellow`. 2.5px ink border, 4px radius, `3px 3px 0 0 var(--ink)` shadow. On `mousedown`, translate (2px,2px) and shrink shadow to `1px 1px`. Restore on `mouseup`/`mouseleave`. |
| `<Sticker tone rotate>` | Inline-block, ink border, stamp shadow, uppercase Geist Mono 800/13, rotated. Tones `pink / yellow / lime`. |
| `<Polaroid width rotate caption tape>` | Cream `#fbf6e6` card, 1px `#c9b88a` border, 12px padding, 22px bottom for caption inset, optional tape strip top-center. Inner image area is `width * 0.66` tall. |
| `<DomainField label placeholder>` | The notched-legend input shown in the hero. |
| `<DashedRow>` / `<DashedDivider>` | 1.5px dashed ink rule wrappers. |
| `<MarkerScribble width color>` | Inline SVG of the wavy underline path; reuse for any "marker" decoration. |

### Marker underline implementation

The hand-drawn underline is a `background-image` URL-encoded SVG path applied to inline text, with `background-position: 0 100%`, `background-size: 100% 0.4em`, `background-repeat: no-repeat`. See `tokens.css` (`.u-marker`, `.u-marker-pink`, `.u-marker-double`). When porting, expose it as a utility class or a `<MarkerText color="blue|pink|double">` component.

---

## Interactions & behavior

- **Stamp button press**: `transform: translate(2px,2px); box-shadow: 1px 1px 0 0 var(--ink)` on press, restored on release. ~80ms ease.
- **Domain submit**: pressing **Create Timeline** with a valid domain navigates to a generated timeline view (out of scope for this handoff — design TBD).
- **Polaroid**: static decoration on the home screen. No hover behavior.
- **Form validation**: trim and require a non-empty domain string; accept `example.com`, `www.example.com`, `https://example.com/path` (normalize before submit).
- **Responsive**: the 1000px page is desktop-first. Below ~720px, the hero should stack to a single column, and the feature row should stack vertically. Specific mobile spec is **not** in this handoff — design as a follow-up.

---

## State management

The home screen is essentially stateless. Local component state is enough:

- `domain: string` — controlled input.
- `submitting: boolean` — disables the button while routing.

No remote data is fetched on this screen.

---

## Files in this bundle

| File | What it is | Ship it? |
|---|---|---|
| `README.md` | This document. | No |
| `tokens.css` | Base design tokens (color, type, spacing, radii, shadows) and utility classes. The `--paper`, `--lime`, etc. defaults are the original "scrapbook" palette. | Port the *values* into your token system; don't ship the file as-is. |
| `tokens.motel.css` | Override file that re-points the tokens to the **Roadside Motel · Neon** palette. **This is the palette to ship.** Load after `tokens.css`. | Port into your token system as the active theme. |
| `components.jsx` | Reference implementations of `Logo`, `PixelIcon`, `StampButton`, `Sticker`, `Polaroid`, `DomainField`, etc. Ported to your framework. | No — port the components. |
| `tweaks-panel.jsx` | Designer-only preview controls. **Do not ship.** | No — strip entirely. |
| `Retrosite Home.html` | The home screen prototype. Open in a browser to see the intended result. | No — recreate in your framework. |
| `Retrosite Design System.html` | Full styleguide artboards (colors, type, components, layouts). Reference for any spec not covered in this README. | No — reference only. |

The bundled HTML uses a built-in tweaks panel that lets you swap palettes live. In production, drop the panel; just lock the Motel palette in.

---

## Assets

- **Fonts**: JetBrains Mono, Geist Mono, VT323, Caveat — all Google Fonts. Bring them in via your codebase's font-loading mechanism (`next/font`, `@font-face`, etc.). Don't keep the runtime `@import` from `tokens.css` in production.
- **Icons**: hand-built pixel grids in `components.jsx` (`ICONS` map). Ship as inline SVG components — no external icon library is needed for the hero.
- **Logo**: pixel SVG in `components.jsx` (`<Logo>` / `<ComputerLogo>`). Ships as a component.
- **Polaroid mock content** (the "chirper" 2007 screenshot inside the polaroid): an original stylized period-web layout built from divs. It is purely decorative and is **not** a real product.
- **Paper texture** (`.paper-bg`): pure CSS — radial-gradient flecks + 1px horizontal grain repeating-linear-gradient. No raster asset needed.

---

## Open questions for the next iteration

1. **Timeline view** (post-submit screen) — design not in this bundle.
2. **Mobile layouts** — desktop-only here; needs a follow-up.
3. **Empty / loading / error states** for the domain submission.
4. **Empty state for Recent Timelines** when the user has no saved timelines — not designed.
5. **Real thumbnail generation** — prototype thumbs are stylized div mocks; production needs a snapshotting pipeline.
6. **Auth surface** (the GitHub button in the nav implies sign-in) — not designed.
7. **Headline copy** — currently mentions a third-party archive service. If the implementation uses a different data source, update accordingly.

---

## Quickstart for the implementer

1. Open `Retrosite Home.html` and `Retrosite Design System.html` in a browser to see the target visuals.
2. Pull color/type/spacing values from this README into your design-token system.
3. Build the component primitives (`StampButton`, `Polaroid`, `PixelIcon`, `MarkerText`, `DomainField`) first — every screen depends on them.
4. Compose the home screen.
5. Drop the tweaks panel; lock the Motel palette as the only theme until product asks for more.
