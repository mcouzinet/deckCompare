---
name: Deck Compare — The Memo
description: A Magic deck comparison read as a one-page brief on cream paper, in daylight.
colors:
  paper: "#f8f5f2"
  paper-well: "#efe9e3"
  sheet: "#ffffff"
  ink: "#241c18"
  ink-soft: "#5e524b"
  ink-mute: "#7a6d64"
  hairline: "#e8dfd8"
  hairline-strong: "#d6c9bf"
  side-a: "#a8540f"
  side-b: "#137083"
  shared: "#1e7a4c"
  side-a-wash: "rgba(168,84,15,0.10)"
  side-b-wash: "rgba(19,112,131,0.10)"
  shared-wash: "rgba(30,122,76,0.10)"
  action: "#8a1f16"
  action-deep: "#701810"
  action-wash: "rgba(138,31,22,0.10)"
typography:
  display:
    fontFamily: "Beleren, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(40px, 6vw, 80px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Beleren, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(22px, 2.8vw, 36px)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Beleren, Iowan Old Style, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, Helvetica, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, Helvetica, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.14em"
  measurement:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Bricolage Grotesque, Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  unit: "8px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  gutter: "clamp(20px, 4vw, 48px)"
components:
  mat-btn:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  mat-btn-go:
    backgroundColor: "{colors.action}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  mat-btn-go-hover:
    backgroundColor: "{colors.action-deep}"
    textColor: "#ffffff"
  mat-btn-flat:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  mat-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  segment:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.pill}"
    padding: "7px 14px"
  segment-selected:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
  chip:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Deck Compare — The Memo

## Overview

**Creative North Star: "The Memo"**

The surface is a one-page brief read at a desk in daylight. The ground is cream paper,
the ink is warm and near-black, and everything that groups information is a white sheet
laid on the paper with a hairline edge. Controls are pills. One deep red is the action.
The figures that decide something — the similarity percentage, the commander's name, the
two deck names, the counts — are set in a serif, large; everything else is the sheet's
sans. Nothing glows, nothing blurs, nothing is embossed: paper is flat and light falls on
it from above.

The world was pinned by the maintainer on 2026-09-03 from an investment one-pager
(memos.sourceventures.vc) and replaced "The Table", the dark felt world lit in amber. The
amber accent is gone: the deck colours — warm card, cool card, green in between — are the
icon's own encoding, deepened until they read on paper, and they are roles, never accents.
The icon and the wordmark ("Deck" + bold "Compare" in Bricolage Grotesque) are unchanged.
The two buttons injected into the deck sites keep their own black-on-site treatment inside
a shadow root; they sit on other people's pages and are not this world.

**Key Characteristics:**
- Cream paper, white sheets, one hairline weight, warm ink in three strengths.
- Pill controls; the selected one is inked, the primary one is red and casts the page's only coloured shadow.
- Serif for the figures that decide; sans for everything you scan; mono for what you count.
- Depth is a sheet resting on a desk: soft, wide, downward shadows in three lifts.
- Side A, side B and shared are functional colours and appear only where they mean something.

## Colors

A restrained palette: paper and ink, one action red, and three role colours that carry meaning rather than mood.

### Primary
- **Action Red** (#8a1f16): the one action colour. Fills the primary pill (`.mat-btn--go`) with white text, and is the text colour of anything that needs attention — an error, an excluded deck's chip, a quantity mismatch. Hovers to **Action Deep** (#701810). 8:1 on paper, 8.7:1 with white.

### Secondary
- **Side A, warm card** (#a8540f): deck 1's name, its counts, its quantities, its zone name. Never a button, never a border.
- **Side B, cool card** (#137083): deck 2, the same way.
- **Shared Green** (#1e7a4c): the ground the two decks have in common — the shared zone, the "shared cards" count, the "with this card" filter chip, the live "Detected" dot.

Each role has a wash (`--a-wash`, `--b-wash`, `--match-wash`, 10% alpha) for the tinted chips and edges that name a side without shouting.

### Neutral
- **Paper** (#f8f5f2): the desk. Painted on `html`, never on a component.
- **Paper Well** (#efe9e3): what is pressed into the paper — bar tracks, quiet fills, hover on white, the empty card stage.
- **Sheet** (#ffffff): a sheet laid on the paper — every panel, list, popup card, held card.
- **Ink** (#241c18) for what must be read first; **Ink Soft** (#5e524b) for body; **Ink Mute** (#7a6d64) for labels and what a reader can skip (4.6:1 on paper, 5.0:1 on a sheet).
- **Hairline** (#e8dfd8) for sheet edges and rules; **Hairline Strong** (#d6c9bf) for control edges (pills, fields, chips).

### Named Rules
**The One Red Rule.** Red is the action and the alarm, and nothing else. It never decorates, never marks a side, never appears in a chart.

**The Roles Not Accents Rule.** Side A orange, side B teal and shared green appear only on the thing they mean — a name, a count, a bar segment, a swatch. No headers, no buttons, no backgrounds take them.

**The Gold Is Gone Rule.** The amber of the previous world (#e3a24f, #e6b54e) is not a UI colour. It survives only inside the icon and the injected button's icon.

## Typography

**Display Font:** Beleren — the Magic card face, bundled in `fonts/` (with Iowan Old Style, Georgia, serif)
**Body Font:** Archivo (with system-ui, -apple-system, Segoe UI, Helvetica, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace, SFMono-Regular, monospace)
**Wordmark:** Bricolage Grotesque 700/800 — the wordmark only, locked by the brand.

**Character:** A memo's pairing with the game's own lettering — Beleren, the face printed on every card, for the few things set large; a plain workhorse grotesque for the tool; a mono where numbers must line up. Beleren ships in one bold weight and is never faux-bolded; it is spent, not sprinkled.

### Hierarchy
- **Display** (400, clamp(40px, 6vw, 80px), 1, -0.01em): the similarity figure alone. The `%` inside it is 0.42em in Ink Mute.
- **Headline** (400, clamp(22px, 2.8vw, 36px), 1.1, -0.01em): the two deck names in the matchup, the commander's name in the pool hero, the pool page's title. Deck names take their side's ink.
- **Stat** (400, 30px, 1, -0.01em, Beleren): the pool hero counts; "shared cards" takes Shared Green.
- **Title** (400, 17–19px, 1.15–1.25, 0, Beleren): the held card's name, the popup's detected deck name.
- **Body** (400, 13px, 1.5, Archivo): every row, hint and control; 15px on the pool page's reading text.
- **Label** (600, 11px, 0.14em, uppercase, Archivo): zone names, section titles, field labels, source names, stat captions. 11px is a floor.
- **Measurement** (600, 13px / 11px, Geist Mono, tabular): quantities, deltas, percentages, counts, deck numbers.

### Named Rules
**The Figures Decide Rule.** The serif appears only on the figures and names a reader decides by; a serif on a label, a control or a row is a lapse.

**The Ramp Rule.** Eight named sizes — 11 / 12 / 13 / 15 / 18 / 24 / 34 / 56 (plus the two display clamps). Nothing below 11px; nothing in between.

## Layout

One unit: 8px. Gutters are `clamp(20px, 4vw, 48px)`; content is capped at 1280px and centred.

The results page is one sheet of paper: a top edge carrying the wordmark and the actions, the matchup (deck A left, the figure centred, deck B right), the overlap bar, the controls, then the two sides as zones over a shared table, with the held card in a sticky rail at 300px. The rail drops under the content below 1080px and the empty stage folds to its hint; the matchup stacks below 760px with the figure first.

The pool page is the same paper with a 320px rail on the right: the deck list (capped at ~7 rows, scrolling on its own), the held card, the mana curve, the sideboard. The rail is capped to the viewport and scrolls as a whole; nothing inside it is squeezed. It hides below 1000px.

The popup is 400px of the same paper: the wordmark, your deck as a sheet under its side's label, the rule ("versus"), the second deck's field with the red pill, and stays under Chrome's 600px ceiling.

Spacing rhythm: 8px inside a row, 16px between related blocks, 24px between sections, 40–56px around the matchup. More space above a section title than below it.

## Elevation & Depth

Sheets on a desk, lit from above. Every shadow has a downward offset and a soft, wide blur; there are no glows, no halos, no inset embossing. Three lifts and one press.

### Shadow Vocabulary
- **lift-1** (`0 1px 2px rgba(36,28,24,.06), 0 2px 6px rgba(36,28,24,.04)`): a sheet at rest — sections, the deck list, the detected deck, a hovered pill.
- **lift-2** (`0 2px 4px rgba(36,28,24,.05), 0 10px 28px rgba(36,28,24,.08)`): a sheet picked up — the held card, the hero art.
- **lift-3** (`0 6px 12px rgba(36,28,24,.06), 0 24px 56px rgba(36,28,24,.14)`): above the desk — a hovered card, an open dropdown, the floating selection bar.
- **press** (`inset 0 1px 2px rgba(36,28,24,.06)`): reserved; the built world presses nothing in.
- **action lift** (`0 2px 10px rgba(138,31,22,.28)`): the red pill's own shadow, the only coloured one.

### Named Rules
**The Paper Does Not Blur Rule.** No backdrop-filter, no glass. A sticky bar is opaque paper with a hairline.

**The One Sheet Rule.** A sheet rests on the paper, never on another sheet. Rows inside a sheet are separated by hairlines, not by more sheets.

## Shapes

Pills for anything you press or select (999px). Sheets are rounded like paper: 14px for a list or section, 18px for the held card, 10px for a field, an image or a hero art, 6px for a small tag or a focus ring. Cards keep the real object's 488/680 ratio and are clipped at the card's own corner radius (4.7% / 3.4%), so the white or black corner fill of a Scryfall JPG never shows. Hairlines are 1px in `--line` (sheets) or `--line-strong` (controls); nothing carries a 2px border except a field in focus.

## Components

### Buttons
- **Shape:** pill (999px), 13px/600, 10px 18px.
- **Default (`.mat-btn`):** white with a Hairline Strong edge; hover lifts 1px, takes lift-1 and an Ink Mute edge.
- **Primary (`.mat-btn--go`):** Action Red, white text, the action lift; hover to Action Deep.
- **Flat (`.mat-btn--flat`):** no edge until reached for; hover fills Paper Well.
- **Icon (`.mat-btn--icon`):** the same pill at 10px padding — the popup's settings gear, the pool's close.
- **Dashed (`.add-toggle`, `.hint-configure`):** a dashed Hairline Strong pill or sheet for "add" affordances.

### Segments
- **Style:** a white pill group with a Hairline edge and 3px padding.
- **State:** the selected segment is inked (Ink fill, white text) and carries `aria-pressed`; the rest are Ink Mute, hovering to Paper Well. The pool's category pills follow the same rule as standalone pills.

### Chips
- **Style:** white pill, Hairline Strong edge, 12px text; the deck-source chip is a Paper Well pill in 11px tracked caps.
- **State:** a filter chip prefixes its rule in Shared Green ("with") or Action Red ("without") and carries its own ×.

### Sheets
- **Corner Style:** 14px (18px for the held card).
- **Background:** Sheet white on Paper.
- **Shadow Strategy:** lift-1 at rest, lift-2 when it is the thing you are holding.
- **Border:** 1px Hairline.
- **Internal Padding:** 16px; list rows 8px 16px with hairlines between them, hovering to Paper.

### Inputs / Fields
- **Style:** white, Hairline Strong edge, 10px radius, 10px 14px; mono for pasted decklists.
- **Focus:** the edge turns Ink and doubles (inset 1px Ink), no glow.
- **Error:** the message under it in Action Red.

### Navigation
- The top edge: wordmark left, actions right as pills, one Hairline under it. Opaque paper; sticky on the pool page.

### The Overlap Bar
An 8px pill track in Paper Well with three segments — side A, shared, side B — and a legend of swatch, name and mono count. It is the page's one authored motion: the segments draw in once, left to right (`scaleX` from 0, 0.9s, `cubic-bezier(.22,1,.36,1)`, staggered 120ms), the instant the result is revealed.

### The Card
A Scryfall image on a 10px sheet corner, lift-1 at rest, lifted 3px to lift-3 on hover or focus; a quantity badge in the top-left corner (mono, white on 82% Ink). Cards without an image become a dashed proxy carrying the name.

## Do's and Don'ts

### Do:
- **Do** paint the ground on `html` as Paper and put every grouping on one Sheet with a Hairline; rows inside it are hairlines apart.
- **Do** set a side's name, count and quantities in that side's ink, and nothing else in it.
- **Do** put a label *under* a headline (source under the deck name, "Commander" under the commander) — the headline carries its own weight.
- **Do** keep numbers in Geist Mono with tabular figures, right-aligned in their column.
- **Do** honour `prefers-reduced-motion`: the overlap bar's draw-in is the only authored motion and it collapses to nothing.

### Don't:
- **Don't** use amber, gold or the old felt greys anywhere in the pages.
- **Don't** blur, glow, emboss or halo; no backdrop-filter, no zero-offset coloured shadow, no inset relief.
- **Don't** put a sheet inside a sheet, or a coloured stripe on a card, row or callout.
- **Don't** set anything in the serif except the figures and names a reader decides by.
- **Don't** add a required host permission or touch the injected buttons' black-on-site treatment from this world.
