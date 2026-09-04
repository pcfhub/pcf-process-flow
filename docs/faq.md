---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## The component does not appear when I add it to a form

The form designer only offers components whose declared type matches the
selected column. This control binds a **Choice** or **Multi-Select Choice**
column, so an empty list means the selected column is something else — most
often a text column holding status words, or a Yes/No.

## Why is the bar empty in my canvas app?

Canvas publishes no column metadata, so there is no option list to read. Set the
`options` property. See [Canvas apps](canvas).

## Can I reorder the steps without reordering the choice?

Yes — set `options` with the steps in the order you want. The bar renders that
list in the order it is written.

## Why is the last step I marked the current one?

On a Multi-Select Choice column the marks are explicit, and the bar has to pick
one to draw as in progress. The last in **option order** — not the order they
were clicked — is the one furthest along the process, which is the useful
answer. Selection order is storage order and carries no meaning.

## I hid an option and now a record shows fewer stages than it has

That is intended, and the hidden value is still on the record. The control
carries it through every write, so nothing has been lost. Clear the `exclude`
list to see it again.

## Can a user clear a Choice column from the bar?

No. Clicking the stage the record is already at does nothing, deliberately:
emptying a column is a bigger decision than a click on an already-selected step
should carry. A Multi-Select Choice column clears by unmarking every stage.

## Why do some circles use my option colours and others are orange?

A colour is optional in the choice editor and most options do not have one.
Those fall back to the business process flow orange. Set `defaultColor` to
change what they fall back to, or give the options colours.

## Does it work with `state` and `status` columns?

They are Choice columns as far as the platform is concerned, and the control
treats them as single-select. Note that Dataverse enforces its own rules about
which status values are valid for which state, so a write the bar makes can
still be rejected — the rejection appears as the platform's own message under
the bar.

## Is it premium?

No. `external-service-usage` is disabled and no `feature-usage` entries are
declared, so it prompts for no permissions at install and does not change what
licences an app's users need.
