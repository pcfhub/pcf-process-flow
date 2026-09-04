---
title: Examples
description: Configurations worth copying.
order: 6
---

# Examples

## A sales stage bar, with no configuration at all

Place the control on a Choice column whose options are `Qualify`, `Develop`,
`Propose`, `Close`. Leave every property empty.

The steps, their order and their colours all come from the column. A record at
`Propose` draws Qualify and Develop as completed, Propose as the current stage
in its chevron tab, and Close ahead of it.

## Marking several stages independently

Use a **Multi-Select Choice** column instead. Now the marks are explicit rather
than implied by position, which is what you want when the stages are a checklist
rather than a sequence — `Contract signed`, `Deposit received`, `Kit shipped`.

Clicking a circle toggles that one. The last marked stage in option order is
drawn as current.

## Keeping the terminal states off the bar

A status column usually has options that are not stages at all:

| Property | Value |
| --- | --- |
| `exclude` | `On hold, Cancelled, Merged` |

Those three never appear. A record already sitting on one keeps its value — the
control writes it back untouched — so this is safe to switch on for a table
that already holds data.

## Shortening labels for a narrow form

The bar puts labels under the circles and truncates rather than wrapping, so a
four-column form section is tight. Override the list instead of renaming the
choice:

| Property | Value |
| --- | --- |
| `options` | `1:Qualify, 2:Develop, 3:Propose, 4:Close` |

## Matching a themed app

Choice colours are per option, and there is one fallback for everything without
one:

| Property | Value |
| --- | --- |
| `defaultColor` | `#0F6CBD` |

A value that is not a hex colour falls back to the orange rather than blanking
the bar, so a typo costs the colour and not the control.

## In a canvas app

The `options` property is required — see [Canvas apps](canvas). Everything else
is the same.
