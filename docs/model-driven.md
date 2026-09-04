---
title: Model-driven forms
description: The host the control is built for, and the one that needs no configuration.
order: 3
---

# Model-driven forms

This is the host where the control needs nothing configured. The platform hands
down the bound column's metadata, and everything the bar draws comes from it:

| The bar | Comes from |
| --- | --- |
| Which steps exist | `attributes.Options` |
| The order they appear in | the same list, in the choice editor's display order |
| Each circle's colour | that option's `Color` |

So the normal configuration is: place the control on the column, save, publish.

## Changing the steps without changing the column

Set the `options` property and it wins over the column's metadata. That is how
to relabel a stage for one form, shorten a long label so the bar fits, or give
the stages colours the choice editor does not have.

It takes either the platform's own shape as JSON:

```json
[{"Value":1,"Label":"Qualify","Color":"#E8502A"},{"Value":2,"Label":"Develop"}]
```

or a shorthand where the colour is optional:

```text
1:Qualify:#E8502A, 2:Develop, 3:Propose
```

:::callout{type=warning}
An override replaces the list entirely. An option in the column but not in the
override is not drawn — and, like an excluded one, is preserved rather than
erased if a record holds it.
:::

## Hiding steps

`exclude` takes a comma-separated list of option **values or labels**:

```text
On hold, Cancelled
```
```text
100000004, 100000005
```

Labels are matched trimmed and case-insensitively. Values are matched exactly.
Both forms can appear in the same list.

Hiding is a display decision and never a delete. A record that already holds a
hidden option keeps it: the value is carried through every write the control
makes, so clicking a visible stage does not quietly drop it.

## Field-level security

Both flags are honoured, and they are not the same as the form's read-only
state:

- **No read access** — the bar is replaced by a message saying so. This matters
  because a column the user cannot read arrives as an empty value, which would
  otherwise draw as "no stage reached".
- **Read but no write** — the bar is drawn and every stage refuses the click.

A form-level read-only setting does the second of those for its own reason.

## Business rules

If a rule fails on the column, the platform's own message is rendered under the
bar and the group is marked invalid. A control that ignored this would leave a
blocked form with nothing on screen saying why.

## Themes

The control reads Fluent's design tokens from the provider the form already
mounts, so it follows the app's theme — including a custom brand colour — with
no configuration. Dark mode comes from the app's theme rather than from the
operating system, which is the correct signal: a model-driven app carries its
own theme and the OS setting says nothing about it.
