---
title: Overview
description: What Process Flow does, and when to reach for it.
order: 1
---

# Process Flow

Draws a Choice or Multi-Select Choice column as a business process flow stage
bar: circles joined by a coloured rail, ticks behind the record, a ring on the
stage it is at, hollow circles ahead. Clicking a stage writes the column.

::image{src=media/screenshot.png alt="Process Flow on three forms: a plain sales stage bar, per-option colours, and the dark theme with a step hidden" zoom}

## Why this one

The real Business Process Flow is a separate Dataverse construct — its own
table, its own security, its own lifecycle, its own migration story. A lot of
the time what a team actually wants is the *picture*: a status column that reads
as progress rather than as a dropdown.

This is that picture, over a column you already have. There is nothing to
provision and nothing to migrate; point it at the column and it draws it.

## What it works with

:::callout{type=info}
**Model-driven forms** are the host this is built for: the platform publishes
the column's own options, their order and their colours, and the control needs
no configuration at all.

**Canvas apps and custom pages** work too, with one caveat — a canvas app
publishes no column metadata, so the steps have to be supplied through the
`options` property. See [Canvas apps](canvas).
:::

## The two column types read differently

Both are supported through one binding, and the difference is not cosmetic.

- **Multi-Select Choice** — the marks are explicit. Every marked option is a
  completed stage except the last one in option order, which is the current
  one. Clicking toggles.
- **Choice** — the column holds one value, so it cannot express "these three
  are done". The stored option is the current stage and everything *before* it
  in option order is drawn as completed, which is how a native flow reads.
  Clicking moves the record to that stage.

The order of the steps is the order of the options, exactly as they appear in
the choice editor. Reordering the choice reorders the bar.

## Colours

Each circle takes its option's own colour from the choice metadata. Most
options have none — a colour is optional in the choice editor — and those fall
back to the business process flow orange, which the `defaultColor` property can
change.

The tick drawn inside a completed circle switches between black and white based
on the colour behind it, so it stays readable whatever the maker picked.
