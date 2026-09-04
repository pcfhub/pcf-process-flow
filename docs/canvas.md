---
title: Canvas apps
description: Works, with one thing you have to supply yourself.
order: 4
---

# Canvas apps

The control runs in a canvas app and in a custom page, and there is exactly one
difference that matters.

## Canvas publishes no column metadata

A model-driven form hands a code component the bound column's metadata; a canvas
app hands it none. There is no `attributes` object at all, so there are no
options, no order and no colours to read.

:::callout{type=warning}
**Set the `options` property, or the control has nothing to draw** and renders
"No steps to show." That is not a failure — it is the honest report of a host
that published no option list.
:::

```text
1:Qualify, 2:Develop, 3:Propose, 4:Close
```

or, with colours:

```text
1:Qualify:#E8502A, 2:Develop:#0F6CBD, 3:Propose, 4:Close
```

or the full JSON shape, which is the one to generate from a formula:

```json
[{"Value":1,"Label":"Qualify","Color":"#E8502A"}]
```

## Everything else follows from that

- **Arity is inferred from the value.** With no metadata to say whether the
  column is single- or multi-select, the control reads the value's own shape: an
  array means multi-select, anything else means single. So bind a table of
  choices for the multi-select behaviour and a single choice for the other.
- **Field-level security does not exist in canvas**, so the no-access branch is
  unreachable and the bar is always drawn.
- **There is no theme to follow.** Canvas publishes no Fluent tokens, so the
  control uses its own light palette. `defaultColor` and the per-option colours
  are the levers.

## Clearing the column

An empty selection is written back as `null`, not as "no change" — so a canvas
app can genuinely empty the column. Worth stating because the opposite is a
common bug in code components, and it presents as a control that ignores input
rather than as one returning the wrong value.
