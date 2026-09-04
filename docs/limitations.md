---
title: Limitations
description: What Process Flow does not do.
order: 7
---

# Limitations

- **It is not a Business Process Flow.** It looks like one and it is not one.
  There are no stage gates, no required fields per stage, no branching, no
  cross-table stages, and no `Active Stage` to report on. It draws a column. If
  you need the enforcement, you need the real thing.

- **No time-in-stage badge.** The native flow shows how long the record has been
  at the current stage — the `(7 D)` in the screenshots people compare this to.
  That needs a date column this control does not bind, and a second bound
  property would make the form designer ask the maker to pick a second column
  for a control that attaches to one. Not planned.

- **Canvas apps need the `options` property set.** A canvas app publishes no
  column metadata, so there is no option list to read. See
  [Canvas apps](canvas).

- **An option's `Color` is used as-is.** The control does not check it against
  the surrounding theme, so an option coloured near-white in the choice editor
  is a near-invisible circle on a light form. Only the tick inside it adapts.
  Pick option colours that work on both themes, or set them per form through
  `options`.

- **Labels truncate, they do not wrap.** The bar is one row and each label is one
  line with an ellipsis. Six or more stages on a narrow form section will clip;
  override `options` with shorter labels rather than expecting a reflow.

- **A single-select column cannot express a gap.** Marking Qualify and Propose
  but not Develop needs a Multi-Select Choice column. On a Choice column
  everything before the stored stage is drawn as completed, because one stored
  value is all the information there is.

- **Clicking the current stage of a Choice column does nothing.** Emptying the
  column is a larger decision than a click on the step already selected should
  carry, so there is no way to clear a Choice column from the bar. A
  Multi-Select column clears by unmarking.

- **Hidden options are hidden, not removed.** A record holding one keeps it, and
  the value survives every write the control makes. That is deliberate — hiding
  a step is a display decision and should never delete data — and it means the
  column can hold a value the bar gives no way to see or clear.
