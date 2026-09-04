# Process Flow

A choice column as a Business Process Flow stage bar.

[![Build](https://github.com/pcfhub/pcf-process-flow/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-process-flow/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-process-flow/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-process-flow/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-process-flow), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Draws a Choice or Multi-Select Choice column as a business process flow stage
bar: circles joined by a coloured rail, ticks behind the record, a ring on the
stage it is at, hollow circles ahead. Clicking a stage writes the column.

The real Business Process Flow is a separate Dataverse construct with its own
table, security and lifecycle. Often what a team wants is only the picture — a
status column that reads as progress rather than as a dropdown — and this is
that picture, over a column that already exists.

Three decisions are worth knowing before reading the code.

**One bound property over a type group, not two.** A field control binds its
*first* bound property to the column it is placed on and renders every
additional one as its own column picker in the configuration pane. Declaring
`OptionSet` and `MultiSelectOptionSet` separately would therefore ask the maker
to choose a second column for a control that attaches to one. The type group
costs the generated type — `raw` is `any`, `attributes` is the base
`Metadata` — and both narrowings live in `ProcessFlow/options.ts` rather than
being repeated.

**The two arities mean different things.** On a Multi-Select column the marks
are explicit: every marked option is completed except the last in option order,
which is current. On a Choice column there is one stored value, so the stage it
names is current and everything before it is drawn as completed — which is how a
native flow reads, and the only rendering that looks like one at all.

**Hidden options are hidden, not deleted.** An option named in `exclude`, or
absent from an `options` override, is kept out of the bar and carried through
every write untouched. Without that, the first click on any visible stage would
silently drop a value from the record.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | OptionSet \| MultiSelectOptionSet | bound, **required** | — | The column the bar reads and writes. Its option order is the step order. |
| `options` | Multiple | input | — | Overrides the column's option list. JSON, or `1:Qualify:#E8502A, 2:Develop`. Required in canvas apps. |
| `exclude` | SingleLine.Text | input | — | Steps to leave off the bar, comma separated. Option values or labels. |
| `defaultColor` | SingleLine.Text | input | `#E8502A` | Colour for an option whose choice metadata carries none. |

A `standard` control, not virtual: the surface is circles, a rail and labels, so
there is no Fluent component being reused and React would buy nothing. The
stylesheet still reads Fluent's design tokens, which a model-driven form
publishes as CSS custom properties whether or not the control is React.

No `feature-usage` entries and `external-service-usage` disabled — so the
control prompts for no permissions at install and is not premium.

The `.resx` files ship English (1033), Spanish (3082), French (1036), German
(1031) and Japanese (1041). **1033 is listed last in the manifest on purpose**
and a new language goes above it: `pcf-start` picks the `.resx` by manifest
order rather than by locale, and appending a sixth file silently hands the local
harness to that language.

## On the hub

`demo.fidelity` is `full`, and it follows from the manifest rather than from
optimism: the control reaches no Web API, no device API and no navigation, so
there is nothing the hub's harness has to fake. Every user-visible path works in
the demo exactly as it does on a form.

The one thing the harness cannot supply is column metadata — its `baseAttributes()`
returns no `Options` — so every preset carries the `options` input, which is
also what a canvas app needs. That is a property a maker sets, not a stub.

The presets cover: the sales-stage bar from a bare column, per-option colours
including a pale one that flips the tick to black, marks made out of sequence on
a multi-select column, an exclude list hiding two terminal states while a record
still holds one, a plain Choice column showing the implicit-completion rule, and
the empty state.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-process-flow/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control has no harness page, and the script says
so rather than serving a 404.

`media/screenshot.png` and `media/logo.png` are **generated, not drawn**, from
`dev/shot.html` — which mounts the real built bundle through the same
`dev/host.js` the smoke suite uses, so the published images cannot drift from
what the control renders. Rebuild, serve, then capture:

```bash
npm run build && node dev/serve.js --port 8792 --no-open &
chrome --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --screenshot=media/screenshot.png --window-size=820,452 \
  http://localhost:8792/dev/shot.html
chrome --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --screenshot=media/logo.png --window-size=512,512 \
  http://localhost:8792/dev/shot.html?logo
```

Regenerate both after any change to the stylesheet or the marker geometry. A
screenshot that no longer matches the control is worse than none, because it is
the first thing a visitor to the hub sees.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `ProcessFlow/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `ProcessFlow/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
