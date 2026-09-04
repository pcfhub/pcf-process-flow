---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control. A hand-written table is wrong the first time somebody adds a
  property and forgets this file, and a reader has no way to tell.

  kind: input | bound | output | dataset | dataset_column
  Omit `kind` to render every property in one table.
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

### `value`

The bound column, accepting either **Choice** (`OptionSet`) or **Multi-Select
Choice** (`MultiSelectOptionSet`) through a type group. The hub renders the type
as `OptionSet | MultiSelectOptionSet` for that reason.

The two arities behave differently, and it is not cosmetic — see
[Overview](overview).

### `options`

Two accepted formats. The platform's own `OptionMetadata` shape as JSON:

```json
[{"Value":1,"Label":"Qualify","Color":"#E8502A"},{"Value":2,"Label":"Develop"}]
```

`Value` must be a number and `Label` a string; `Color` is optional. An entry
missing either required field is skipped rather than throwing, so one typo costs
one step instead of the whole bar.

Or a shorthand, where the colour is optional:

```text
1:Qualify:#E8502A, 2:Develop, 3:Propose
```

When non-empty this **replaces** the column's option list entirely. It is
required in canvas apps, which publish no column metadata.

### `exclude`

Comma separated. An entry that parses as a number is matched against the
option's `Value`; anything else is matched against its `Label`, trimmed and
case-insensitively. Both forms may appear in one list.

A hidden option that a record already holds is preserved through every write.

### `defaultColor`

A hex colour, with or without the leading `#`, in three- or six-digit form.
Anything else falls back to `#E8502A`.

### Outputs

The output shape follows the **column**, not the bar: a Multi-Select Choice
column is always written an array, even when one step is marked. An empty
selection is written as `null` rather than `undefined`, so clearing works in
canvas apps as well as on a form.
