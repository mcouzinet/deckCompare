---
name: Deck Compare — The Table
description: A Magic deck comparison read on the mat it would be played on, under one overhead light.
colors:
  felt: "#17120d"
  felt-lit: "#201a13"
  felt-deep: "#0d0a06"
  raised: "#2a221a"
  raised-hi: "#33291f"
  warn-hi: "#ffc933"
  ink: "#f4eee3"
  ink-2: "#c9bfad"
  ink-3: "#9a8f7c"
  side-a: "#e3a24f"
  side-b: "#56b6c9"
  shared: "#74bd84"
  warn: "#e6b54e"
  brand: "#e0654a"
  brand-btn: "#b8402c"
  brand-btn-hi: "#c74a33"
  brand-wash: "rgba(224,101,74,0.15)"
  stitch: "rgba(244,238,227,0.13)"
  rule: "rgba(244,238,227,0.07)"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
  deck-name:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "clamp(18px, 2.6vw, 24px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  zone-name:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.16em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  measurement:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  hair: "2px"
  xs: "3px"
  sm: "4px"
  md: "5px"
  lg: "6px"
  pill: "999px"
spacing:
  unit: "8px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  mat-btn:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  mat-btn-hover:
    backgroundColor: "{colors.raised-hi}"
    textColor: "{colors.ink}"
  mat-btn-go:
    backgroundColor: "{colors.brand-btn}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  mat-btn-go-hover:
    backgroundColor: "{colors.brand-btn-hi}"
    textColor: "#ffffff"
  mat-btn-flat:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  mat-field:
    backgroundColor: "{colors.felt-deep}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px 13px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.xs}"
    padding: "9px 14px"
  segment-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  card-slot:
    backgroundColor: "{colors.felt-deep}"
    rounded: "{rounded.md}"
---

# Design System: Deck Compare — The Table

## Overview

The surface is a playmat seen from directly above, under one overhead light. Everything
in the system is a consequence of that premise rather than a decoration applied to it:
the ground is warm felt, elevation is a real downward shadow, and an area of the mat is
silkscreened onto it with a printed rule and a printed name.

The direction was chosen by roll (seed `009366bf`, candidate 3 of 7 by resonance) over
six catalogue challengers. None won, and four donated a discipline that was raised into
the built world — the grid everything snaps to, the monumental figure, labelled states,
the ban on enclosure, and the single light source.

`theme.css` is the world. The three extension pages link it. `inject-button.js` mirrors
its values inside a shadow root, where a stylesheet link cannot reach; that copy is the
one place the shared file cannot own, and it is marked at its declaration.

## Colors

Three grounds and three inks, plus the locked brand encoding.

- **Grounds.** `felt` is the mat. `felt-lit` is where the overhead light falls — used for
  objects resting on the mat. `felt-deep` is what is pressed *into* the mat. `raised` is a
  chip lying on top of it. The grounds are warm; blue-black is off-world.
- **Inks.** `ink` for what must be read first, `ink-2` for body, `ink-3` for what a reader
  can skip. All three clear WCAG AA on every ground: `ink-3` measures 4.91:1 at its worst
  (on `raised`) and 5.84:1 on the felt.
- **The two sides.** `side-a` orange and `side-b` teal are the deck-1/deck-2 encoding,
  locked as a brand commitment. They are the two players' sides of the table, not accents:
  a side's zone name, its counts, its stitched edge and its quantities all take its ink.
  `shared` green is the ground the two sides have in common.
- **The red.** A lacquer red at hue 9–12°, in the same light as the felt and side-A. The
  world's first version kept the old crimson at hue 351° and it read as imported from a
  cooler palette. `brand` is text-only (5.43:1 on felt); filled buttons take `brand-btn`
  (5.51:1 with white) and hover to `brand-btn-hi` (4.71:1). It stays clear of side-A
  orange by 25° of hue as well as by saturation and lightness.

## Typography

Bricolage Grotesque is the display voice (locked by the wordmark); Geist carries the UI;
Geist Mono carries measurement — quantities, deltas, counts, coordinates — never as a
costume for "technical".

The ramp is seven named steps: 11 / 12 / 13 / 15 / 18 / 24 / 34px, an amplitude of 3.1:1.
It replaced eighteen ad-hoc sizes of which seventy-six declarations out of a hundred and
seventeen sat between 10 and 13px. 11px is a floor, not a step to go below.

The popup uses only the first five steps. A 400px surface has nowhere to put display type,
and forcing a 24px title there truncates real deck names — the compressed range is honest,
not an oversight.

## Layout

One unit: 8px. Zones, cards, counters and gutters are multiples of it.

The results page is a single mat, not a card on a background: `mat-edge` at the top, the
matchup, the seam, the controls, then a two-column table with the held card in a sticky
rail. The rail drops below 1080px; the two sides stack below 760px, where the hero also
stacks with the counter first.

The popup is 400px of the same mat — your side, the seam, the opponent's side — and must
stay under Chrome's 600px popup ceiling in its tallest state.

## Elevation & Depth

There is one light and it is overhead. Every shadow therefore has a downward offset and a
soft blur, and no element carries a coloured halo of its own. Three lifts and one press:

- `lift-1` — resting on the mat (cards, chips, buttons).
- `lift-2` — picked up (hover on a button, the held card, the compare-another panel).
- `lift-3` — held above the table (a card under the pointer, an open dropdown).
- `press` — an inset shadow for what is pressed *into* the felt: the similarity well, the
  seam bar, input fields, the selected segment.

A zero-offset coloured glow is off-world. Eleven of them were removed when this world
replaced the previous one.

## Shapes

Small radii throughout: 2–6px, with `pill` reserved for the seam bar and the injected
button. `hair` is for a 2px rule end — the stitched deck edge and the legend swatches. Cards keep the 488/680 ratio of the real object.

## Components

- **`mat-btn`** is the only button. Four variants — default, `--go` (the filled red
  primary), `--flat` (no lift until reached for), `--icon`. It replaced nine separate
  treatments invented across three files.
- **`zone`** is an area of the mat: a `zone-mark` carrying a printed name, an optional
  note, and a right-aligned count, over a hairline rule. It has no fill, no border box and
  no rounded corners, and **zones never nest**. Two zones side by side are peers, not a
  stack, so the vertical gap between stacked zones is scoped away in that case.
- **`segments`** carry selection by being pressed into the felt plus `aria-pressed`, so
  the control still reads with colour removed.
- **`card-slot`** lies on the mat and lifts on hover, focus or click. It is focusable and
  labelled; the preview it opens is reachable by pointer, keyboard and touch.
- **Browser surfaces are themed**: selection, caret, accent colour, scrollbars, focus ring,
  underline offset, and tabular numerals on every measurement.

## Do's and Don'ts

- **Do** derive every new element from the premise: is it printed on the mat, resting on
  it, or pressed into it? That answers its ground, its shadow and its radius.
- **Do** give a state a printed label as well as its colour.
- **Don't** put a label above a heading. The heading carries its own weight — the one
  place this information survived (pool's main-commander role) sits *below* the name.
- **Don't** enclose. No panel inside a panel, no card inside a card; use a zone.
- **Don't** add a coloured `border-left` accent stripe, a glow, or a backdrop blur.
- **Don't** hardcode a pixel value that the `--unit` or type ramp already names. The static
  detector cannot resolve `calc(var(--unit) * n)` and will report cramped padding and
  monotonous spacing that the computed values disprove; read the computed values.
