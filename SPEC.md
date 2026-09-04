# Process Flow

A choice column as a Business Process Flow stage bar.

## What the build disagreed with

**`IOutputs.value` came out as `any`, not as a narrowed optional.** The
type-grouped bound property generates
`value: ComponentFramework.PropertyTypes.Property` and `value?: any`, so the
`null as unknown as undefined` cast that other field controls need here is not
needed — and, more to the point, *nothing in the type system forces the clear to
be correct*. `?? undefined` compiles just as cleanly as `?? null` and means the
opposite. The assertion in `dev/smoke.js` is the only thing holding it.

**`instanceof Element` threw in the Node rig.** The control delegates one
listener on the track and narrows the event target before calling `closest`,
which is ordinary browser code — but `dev/dom.js` did not install the global a
browser has, so the bundle failed with `ReferenceError: Element is not defined`
and it read as a bug in the control. `dom.js` now defines it, and deliberately
does **not** define `HTMLElement`: that file has one element class, and a second
name for it would let an `instanceof HTMLElement` pass here while meaning
something the file does not model. The control drops that narrowing instead.

`dom.js` also gained `closest`, `matches` and `parentElement`. A control with a
single delegated listener cannot be driven at all without the first.

**The connector painted over the circles, and z-index was only half of it.**
The rail is a pseudo-element of each `<li>` reaching back across the previous
step's box — so it comes *after* that step's button in tree order and, at equal
z-index, painted straight through the middle of every marker but the last.
Ranking the buttons above every connector fixes all pairs at once; tree order
cannot, because no element can be both before and after its neighbours. The
same rule had a second bug hiding under it: the rail's `top` left out the
node's own 2px top padding, so it missed the circle's centre by 2px.

**A custom property set on the button could not reach the connector.** The
step's colour was written to the `<button>`, but the rail is a pseudo-element of
the `<li>` above it, and custom properties inherit downward only — so every rail
silently fell back to the default orange. Invisible until an option carried a
colour of its own, at which point the bar had blue and green circles joined by
orange lines. Both the colour and the `is-linked` class now go on the `<li>`.

**A hand-written icon path is not a shortcut.** The first version drew what was
meant to be Fluent's checkmark from memory, at the 16 size, rendered into a 14px
opening. It produced a shape nobody recognised as a tick. The real
`Checkmark12Filled` is one `grep` away in `@fluentui/react-icons`, and the 12
cut is the one that belongs in this box — Fluent redraws each size rather than
scaling one.

All three were found by **looking at the rendered harness**. Every assertion in
`dev/smoke.js` passed throughout: the DOM was correct and the painting was not.
That is the standing limit of this suite, and the argument for keeping
`dev/shot.html` — the published images are captured from the real bundle, so a
regression in any of this shows up in a file somebody reviews.

**A control that only repaints inside `updateView` depends on the host to hand
the write back, and not every host does.** Reported from the published demo:
clicking a stage showed the new value in the outputs panel and the bar did not
move. `getOutputs()` was correct throughout — the DOM simply never got
repainted, because the only thing that repainted it was `updateView`, and
PCFHub's demo harness renders `getOutputs()` beside the control without
re-rendering it.

A model-driven form *does* call back, which is what makes this the shape of bug
that ships: it is correct on the host you develop on, and the local suite missed
it for the same reason — `mount()` calls `updateView` once, so every assertion
ran after one. `paint()` now takes no context and runs from the click as well,
with the data it needs snapshotted as plain fields in `render()`. Holding the
context object instead would be the other bug: the platform hands it over for
the duration of one call.

The assertions that pin it read the DOM with no intervening render, deliberately.


## Platform behaviour worth knowing

**`property.type` cannot tell the two choice column types apart, and
`attributes.Type` can.** Inherited from `pcf-choices-picker`, which observed it
on a real form: a single-select `address1_addresstypecode` column bound through
an `OptionSet | MultiSelectOptionSet` type group reports
`type: "MultiSelectOptionSet"` and `attributes.Type: "picklist"` at the same
time. So the type group's *accepted* types are what `type` carries, not the
resolved member. `dev/host.js` reproduces the lie faithfully — it hardcodes
`type: 'MultiSelectOptionSet'` whatever the column type switch says — so a
control that reaches for it fails locally rather than on somebody's form.

`attributes.Type` is not on the declared `Metadata` interface. The runtime
object carries considerably more than the type definitions admit, which is why
reading it needs a cast and a `typeof` guard.

**A single-select choice column hands over an object, not a number.** Also
inherited: `{ _label: 'Bill To', _val: 1, _state: -1 }`, where `_val` carries
the value. `_val` is a minified internal name and could be renamed by a platform
update, so `toSelection` tries it as one candidate among several and drops an
entry it cannot read rather than throwing.

**Step order comes from `attributes.Options`, which arrives in the choice
editor's display order.** Read from the platform typings and relied on
throughout. The *selection* array on a multi-select column is in storage order
and carries no meaning, which is why `resolveSteps` reads membership only.

## Design decisions that look like bugs

**A single-select column draws every option before the stored one as
completed.** A Choice column holds one value, so it cannot express "these three
are done" — and a lone ringed circle with plain circles on both sides is not a
process flow. Implicit completion is the only rendering that looks like the
native flow at all, and it is what the native flow means.

**Clicking the current stage of a Choice column does nothing.** Emptying a
column is a larger decision than a click on an already-selected step should
carry, so there is no clear affordance on a single-select column. A multi-select
column clears by unmarking.

**The tick prefers white and switches to black at 3:1, not at maximum
contrast.** A checkmark is a graphical object, so WCAG 1.4.11 Non-text Contrast
is what applies and 3:1 is the bar. Maximising contrast instead sounds stricter
and is worse: it crosses over at a luminance of about 0.18, which puts a **black
tick on the business process flow orange** — legible, unlike any native flow
anyone has seen, and a change nobody asked for. This was caught by looking at
the rendered harness, not by any assertion; the first implementation maximised
contrast and passed every test.

**`lastIncoming` is not touched when the user clicks.** It records what the
*platform* last supplied, so a render arriving before the write is committed
finds that value unchanged and leaves the local selection alone. Clearing it on
click would make the bar snap back a frame after each click, which reads as a
control ignoring input while the write is in fact working.

**The preserved/visible split is recomputed every render, not only when the
column changes.** The exclude list can change without the column changing, which
moves a value between the two halves while the echo guard above is deliberately
skipping the re-read.

## Demo

`fidelity: "full"`, and it follows from the manifest rather than from optimism:
no `feature-usage` entries at all, so no Web API, no `Utility`, no device and no
navigation. Nothing user-visible leaves the browser, and there is nothing for
the harness to fake.

The one thing the harness cannot supply is column metadata — its
`baseAttributes()` returns no `Options` — so every preset carries the `options`
input. That is a property a maker sets rather than a stub, and it is the same
property a canvas app requires, so the demo is showing a real configuration.

## Not verified

Everything below needs a real environment. `npm run smoke` supplies every value
it asserts against, and `dev/harness.html` is a stand-in for a form.

- **The exact native BPF orange.** `#E8502A` is the working default and was
  chosen to match the reference screenshot, not sampled from a live form. Worth
  correcting once against a real business process flow, since it is the colour
  most records will actually show.
- **That the form designer offers this control on the intended columns.** A
  wrong `of-type` does not fail at build or at runtime — it makes the component
  unselectable, and the maker sees an empty list with no way to tell whether the
  control or the column is at fault. The type group should cover both, and
  nothing local can prove it.
- **That a write persists.** The round trip modelled in `dev/harness.js` is this
  repository's guess at the platform's, not the platform's.
- **That `attributes.Type` reports `state` and `status` as expected.** Only
  `picklist` and `multiselectpicklist` have been observed. Both are in
  `SINGLE_ATTRIBUTE_TYPES` on the strength of the documentation.
- **That clearing a Multi-Select Choice column works on a real form.** The
  control writes `[]`; whether the platform wants `[]` or `null` there is
  untested. The single-select clear path is asserted, but only against this
  repository's own harness.
- **That the chevron `clip-path` holds up at narrow form widths and in RTL.**
  Both were read back from `getComputedStyle` in the browser harness, which
  proves the rule applies — not that the result looks right on a real form
  section.
