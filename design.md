# Design - Omni Reels

A locked design system for the app. Every app screen should read as one
operations workspace, not as separate themed pages.

## Genre
modern-minimal

## Macrostructure Family
- App pages: Workbench. Dense, split-panel layouts with a persistent client context, compact headers, readiness states, and clear primary actions.
- Legacy pages: Archive table/workbench. Keep older generator, library, and scenario tools available, but visually mark them as legacy production tools.
- Content pages: Long document only for documentation or audit notes.

## Theme
- `--background` oklch(97% 0.01 235)
- `--foreground` oklch(22% 0.03 245)
- `--card` oklch(100% 0 0)
- `--muted` oklch(94% 0.015 230)
- `--border` oklch(88% 0.018 230)
- `--primary` oklch(48% 0.13 205)
- `--secondary` oklch(38% 0.07 245)
- `--accent` oklch(90% 0.08 190)
- `--ring` oklch(58% 0.15 205)

## Typography
- Display: Avenir Next / Segoe UI, weight 650-700.
- Body: Avenir Next / Segoe UI, weight 400-600.
- Mono: ui-monospace.
- No viewport-scaled type. Compact app headings stay compact.

## Spacing
4-point named scale in `ui/src/app/tokens.css`. Screens use named spacing through
Tailwind classes that map to the same rhythm.

## Motion
- Hover: color/background/transform only, 120-180 ms.
- Focus rings show immediately.
- Reduced motion collapses transitions.

## Microinteractions Stance
- Silent success.
- No celebratory toasts for ordinary saves.
- Destructive actions require clear confirmation.
- Disabled states explain missing readiness in nearby UI.

## CTA Voice
- Primary: solid, compact, action verb.
- Secondary: outline or muted surface.
- Icon buttons must have labels or `aria-label`.

## What Screens Must Share
- Left app shell and selected client context.
- Single accent color and restrained use.
- Workbench cards with radius <= 8px.
- Step/readiness language: client, product, avatar, library, scenario, video.

## What May Differ
- Data density per screen.
- Whether legacy tools use archive/table layouts or split panels.
- Empty-state copy, as long as it directs the next real action.
