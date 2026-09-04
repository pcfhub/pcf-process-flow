/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/ProcessFlow/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'ProcessFlow', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/ProcessFlow. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
const fluent = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    const calls = [];
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, calls });
    const instance = new registration.ctor();

    let notifications = 0;

    /*
     * The third argument is the state a previous mount handed to
     * `mode.setControlState`, and it was hard-coded to `{}` here — which made
     * the *return* half of that API unreachable from a suite. Pass `state` in
     * `options` to mount a control the way the platform remounts one after a
     * form tab switch. `{}` remains the default, because that is a first mount.
     */
    instance.init(context, () => {
        notifications += 1;
    }, options.state || {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** `trackContainerResize` / `setFullScreen` calls the control made. */
        calls: () => calls,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  The control's own decisions.
 *
 *  This is a standard control, so it writes into the container it was handed
 *  and these read the DOM it built. The interesting behaviour is all in
 *  `options.ts` — step order, exclusion, and the done/current/future split —
 *  and it is asserted here through the bundle rather than against the sources,
 *  because webpack, the externals and the manifest all sit between the two.
 * ======================================================================== */

/** The step buttons, in the order they were rendered. */
const nodes = (handle) => handle.container.querySelectorAll('button.ProcessFlow-node');

/**
 * The <li> around each node.
 *
 * The step's colour is written here rather than on the button: the connector is
 * a pseudo-element of the <li>, and a custom property set on the button cannot
 * be read by it — properties inherit downward only. So this is where the colour
 * assertions have to look.
 */
const items = (handle) => handle.container.querySelectorAll('li.ProcessFlow-step');

/** Each step's label text, in render order. */
const labels = (handle) =>
    nodes(handle).map((node) => node.querySelector('span.ProcessFlow-label').textContent);

/** Each step's state, read off the class the stylesheet keys on. */
const states = (handle) =>
    nodes(handle).map((node) => {
        const match = /ProcessFlow-node--(\w+)/.exec(node.className);

        return match === null ? 'none' : match[1];
    });

/** Click a step the way a user does — one delegated listener on the track. */
function clickStep(handle, index) {
    const node = nodes(handle)[index];

    handle.container
        .querySelector('ol.ProcessFlow-track')
        .dispatchEvent({ type: 'click', target: node, preventDefault() {} });
}

/* ------------------------------------------------------- order and states */

/*
 * The order of the steps is the order of the OPTIONS, and nothing else. This is
 * the assertion that pins it: the fixture selects 3, 1 and 2 in that order, so
 * a control reading the selection array's order would render the bar backwards
 * — and it would look perfectly plausible while doing it.
 */
const scrambled = mount({ value: [3, 1, 2] });

check(
    'steps render in option order, not selection order',
    JSON.stringify(labels(scrambled)) === JSON.stringify(['Qualify', 'Develop', 'Propose', 'Close']),
    JSON.stringify(labels(scrambled)),
);

check(
    'the last marked step in option order is the current stage',
    JSON.stringify(states(scrambled)) === JSON.stringify(['done', 'done', 'current', 'future']),
    JSON.stringify(states(scrambled)),
);

const nothing = mount({ value: [] });

check(
    'nothing selected leaves every step in the future',
    states(nothing).every((state) => state === 'future'),
    JSON.stringify(states(nothing)),
);

const everything = mount({ value: [1, 2, 3, 4] });

check(
    'everything selected still leaves exactly one current stage',
    JSON.stringify(states(everything)) === JSON.stringify(['done', 'done', 'done', 'current']),
    JSON.stringify(states(everything)),
);

/*
 * A Choice column holds ONE value, so the marks cannot be explicit — the
 * selected option is the current stage and everything before it in option order
 * is implicitly done. Without this the bar would show a lone ringed circle with
 * plain circles on both sides, which is not a process flow.
 */
const single = mount({ value: 3, columnType: 'picklist' });

check(
    'a single-select column marks everything before the stage as done',
    JSON.stringify(states(single)) === JSON.stringify(['done', 'done', 'current', 'future']),
    JSON.stringify(states(single)),
);

check(
    'and only the stored option reports aria-checked',
    JSON.stringify(nodes(single).map((node) => node.getAttribute('aria-checked')))
        === JSON.stringify(['false', 'false', 'true', 'false']),
    JSON.stringify(nodes(single).map((node) => node.getAttribute('aria-checked'))),
);

/*
 * The shape a single-select column ACTUALLY hands over through this type group,
 * observed on a real form. A control reading only `typeof raw === 'number'`
 * renders an unmarked bar here — it looks like it works, and no step is lit.
 */
const wrapped = mount({ value: { _val: 2, _label: 'Develop', _state: -1 }, columnType: 'picklist' });

check(
    'an object-wrapped single selection resolves to its step',
    JSON.stringify(states(wrapped)) === JSON.stringify(['done', 'current', 'future', 'future']),
    JSON.stringify(states(wrapped)),
);

/* -------------------------------------------------------------- exclusion */

const byLabel = mount({ value: [1], exclude: ' close , DEVELOP ' });

check(
    'excludes by label, trimmed and case-insensitively',
    JSON.stringify(labels(byLabel)) === JSON.stringify(['Qualify', 'Propose']),
    JSON.stringify(labels(byLabel)),
);

const byValue = mount({ value: [1], exclude: '2,4' });

check(
    'excludes by option value',
    JSON.stringify(labels(byValue)) === JSON.stringify(['Qualify', 'Propose']),
    JSON.stringify(labels(byValue)),
);

const mixed = mount({ value: [1], exclude: '2, Close' });

check(
    'accepts values and labels in the same list',
    JSON.stringify(labels(mixed)) === JSON.stringify(['Qualify', 'Propose']),
    JSON.stringify(labels(mixed)),
);

const allGone = mount({ value: [1], exclude: '1,2,3,4' });

check(
    'excluding everything shows the empty state rather than a blank box',
    allGone.container.querySelector('ol.ProcessFlow-track').hidden === true
        && allGone.container.querySelector('p.ProcessFlow-message').textContent === 'resx:ProcessFlow_NoSteps',
    allGone.container.querySelector('p.ProcessFlow-message').textContent,
);

/*
 * The one that costs data if it is wrong.
 *
 * A hidden option the record already holds is a display decision, not a delete.
 * Without `preservedSelection` the first click on any visible step writes back
 * a selection with the hidden value silently missing — and nothing on the form
 * says so.
 */
const preserving = mount({ value: [1, 4], exclude: 'Close' });

check(
    'a hidden option the record holds is not shown',
    JSON.stringify(labels(preserving)) === JSON.stringify(['Qualify', 'Develop', 'Propose']),
    JSON.stringify(labels(preserving)),
);

check(
    'and survives untouched in the outputs',
    JSON.stringify(preserving.outputs().value.slice().sort()) === JSON.stringify([1, 4]),
    JSON.stringify(preserving.outputs().value),
);

clickStep(preserving, 1);

check(
    'and survives a click on a visible step',
    JSON.stringify(preserving.outputs().value.slice().sort()) === JSON.stringify([1, 2, 4]),
    JSON.stringify(preserving.outputs().value),
);

/* ------------------------------------------------------------ interaction */

const toggling = mount({ value: [1, 2] });

clickStep(toggling, 2);

check(
    'clicking an unmarked step marks it',
    JSON.stringify(toggling.outputs().value) === JSON.stringify([1, 2, 3]),
    JSON.stringify(toggling.outputs().value),
);

clickStep(toggling, 0);

check(
    'clicking a marked step unmarks it on a multi-select column',
    JSON.stringify(toggling.outputs().value) === JSON.stringify([2, 3]),
    JSON.stringify(toggling.outputs().value),
);

check(
    'and each of those notified the platform exactly once',
    toggling.notifications() === 2,
    String(toggling.notifications()),
);

const moving = mount({ value: 2, columnType: 'picklist' });

clickStep(moving, 3);

check(
    'a single-select column moves the stage rather than accumulating',
    moving.outputs().value === 4,
    JSON.stringify(moving.outputs().value),
);

const standing = mount({ value: 2, columnType: 'picklist' });

clickStep(standing, 1);

check(
    'and clicking the stage it is already at changes nothing, and notifies nothing',
    standing.outputs().value === 2 && standing.notifications() === 0,
    `${JSON.stringify(standing.outputs().value)} / ${standing.notifications()} notifications`,
);

/*
 * `updateView` runs on every change to any bound value on the form, including
 * the echo of this control's own write — and a render that arrives BEFORE the
 * platform has committed carries the old value. Overwriting the selection there
 * snaps the bar back a frame after the click, which reads as a control that
 * ignores input while the write is in fact working.
 */
const echoing = mount({ value: [1] });

clickStep(echoing, 1);
echoing.update({ value: [1] });

check(
    'a render carrying the pre-write value does not discard the click',
    JSON.stringify(echoing.outputs().value) === JSON.stringify([1, 2]),
    JSON.stringify(echoing.outputs().value),
);

/*
 * The exclude list can change without the column changing, which moves a value
 * between "shown" and "preserved" while the echo guard is skipping the re-read.
 * Splitting only on a fresh value would leave the bar showing a step the maker
 * has just hidden.
 */
const relisted = mount({ value: [1, 2] });

relisted.update({ value: [1, 2], exclude: 'Develop' });

check(
    're-splits the selection when only the exclude list changed',
    JSON.stringify(labels(relisted)) === JSON.stringify(['Qualify', 'Propose', 'Close']),
    JSON.stringify(labels(relisted)),
);

/* -------------------------------------------------------- writing it back */

/*
 * The shape written is the COLUMN's, not the bar's. A multi-select column
 * showing one mark still takes an array; handing it a bare number is a value of
 * the wrong shape for the column.
 */
const oneOfMany = mount({ value: [2] });

check(
    'a multi-select column is written an array even with one mark',
    Array.isArray(oneOfMany.outputs().value),
    JSON.stringify(oneOfMany.outputs().value),
);

check(
    'a single-select column is written a bare number',
    typeof mount({ value: 2, columnType: 'picklist' }).outputs().value === 'number',
    JSON.stringify(mount({ value: 2, columnType: 'picklist' }).outputs().value),
);

/*
 * `undefined` means "no change" to the platform, so a canvas app simply refuses
 * to empty the column and the clear reads as a control ignoring input. Nothing
 * in the type system forces this — the type group makes `IOutputs` `any`.
 */
const emptied = mount({ value: 2, columnType: 'picklist' });

clickStep(emptied, 1);
emptied.update({ value: null, columnType: 'picklist' });

check(
    'an empty single-select column travels back as null, not undefined',
    emptied.outputs().value === null,
    JSON.stringify(emptied.outputs().value),
);

/* ------------------------------------------------------------ the colours */

/*
 * Written as a custom property rather than a colour on the element, so one
 * declaration drives the marker, the tick and the rail segment. The fallback is
 * the case that matters: a colour is optional in the choice editor, so most
 * options carry none.
 */
const coloured = mount({});
const swatches = items(coloured).map((item) => item.style.getPropertyValue('--ProcessFlow-step-color'));

check(
    "an option's own colour reaches the step",
    swatches[0] === '#e8502a' && swatches[1] === '#0f6cbd',
    JSON.stringify(swatches),
);

check(
    'an option with no colour falls back to the business process flow orange',
    swatches[2] === '#e8502a' && swatches[3] === '#e8502a',
    JSON.stringify(swatches),
);

const recoloured = mount({ defaultColor: '#107C10' });

check(
    'and the maker can change what that fallback is',
    items(recoloured)[2].style.getPropertyValue('--ProcessFlow-step-color') === '#107c10',
    items(recoloured)[2].style.getPropertyValue('--ProcessFlow-step-color'),
);

const mistyped = mount({ defaultColor: 'octarine' });

check(
    'a mistyped default colour falls back rather than blanking the step',
    items(mistyped)[2].style.getPropertyValue('--ProcessFlow-step-color') === '#e8502a',
    items(mistyped)[2].style.getPropertyValue('--ProcessFlow-step-color'),
);

/*
 * The tick is drawn on top of the step's own colour, which the maker chose, so
 * a fixed white one disappears on anything pale. Computed from the colour's
 * relative luminance instead.
 */
const contrast = mount({
    options: '[{"Value":1,"Label":"Pale","Color":"#FFF9C4"},{"Value":2,"Label":"Deep","Color":"#1B2A4A"}]',
    value: [1, 2],
});

check(
    'the tick is dark on a pale step and light on a dark one',
    items(contrast)[0].style.getPropertyValue('--ProcessFlow-step-glyph') === '#000000'
        && items(contrast)[1].style.getPropertyValue('--ProcessFlow-step-glyph') === '#ffffff',
    items(contrast).map((item) => item.style.getPropertyValue('--ProcessFlow-step-glyph')).join(' / '),
);

/* -------------------------------------------------- the option list itself */

const shorthand = mount({
    options: '1:Lead, 2:Working:#107C10, 3:Won',
    value: [1],
});

check(
    'the shorthand option list parses, colour optional',
    JSON.stringify(labels(shorthand)) === JSON.stringify(['Lead', 'Working', 'Won'])
        && items(shorthand)[1].style.getPropertyValue('--ProcessFlow-step-color') === '#107c10',
    JSON.stringify(labels(shorthand)),
);

/*
 * A canvas app publishes no column metadata at all, so the input override is
 * the only source of steps there — and it is also the only one PCFHub's demo
 * harness has. A control reading metadata alone renders an empty bar in its own
 * demo.
 */
const onCanvas = mount({ host: 'canvas', value: [1, 2], options: '1:Lead, 2:Working, 3:Won' });

check(
    'a host with no column metadata still renders from the override',
    JSON.stringify(labels(onCanvas)) === JSON.stringify(['Lead', 'Working', 'Won']),
    JSON.stringify(labels(onCanvas)),
);

check(
    'and infers the arity from the value being an array',
    JSON.stringify(states(onCanvas)) === JSON.stringify(['done', 'current', 'future']),
    JSON.stringify(states(onCanvas)),
);

const bareCanvas = mount({ host: 'canvas', value: [1, 2] });

check(
    'a canvas host with no override has nothing to draw and says so',
    bareCanvas.container.querySelector('p.ProcessFlow-message').textContent === 'resx:ProcessFlow_NoSteps',
    bareCanvas.container.querySelector('p.ProcessFlow-message').textContent,
);

/* -------------------------------------------------------- what a form does */

/*
 * Field-level security is NOT the form's read-only state. A user denied read
 * access gets `raw === null`, which is indistinguishable from "no stage
 * reached" unless `security.readable` is checked — so an unchecked control
 * draws an empty bar where "you may not see this" belongs.
 */
const denied = mount({ value: null, security: 'no-access' });

check(
    'a column the user cannot read says so instead of drawing an empty bar',
    denied.container.querySelector('ol.ProcessFlow-track').hidden === true
        && denied.container.querySelector('p.ProcessFlow-message').textContent === 'resx:ProcessFlow_NoAccess',
    denied.container.querySelector('p.ProcessFlow-message').textContent,
);

const readOnly = mount({ value: [1], security: 'read-only' });

clickStep(readOnly, 2);

check(
    'a column the user cannot edit refuses the click',
    JSON.stringify(readOnly.outputs().value) === JSON.stringify([1]) && readOnly.notifications() === 0,
    JSON.stringify(readOnly.outputs().value),
);

check(
    'and every step reports itself disabled',
    nodes(readOnly).every((node) => node.disabled === true),
    JSON.stringify(nodes(readOnly).map((node) => node.disabled)),
);

const lockedForm = mount({ value: [1], disabled: true });

clickStep(lockedForm, 2);

check(
    'a read-only form refuses the click too, for the other reason',
    lockedForm.notifications() === 0,
    String(lockedForm.notifications()),
);

/*
 * The platform's own validation, already localised. A code component that
 * ignores it makes a failing business rule silent: the form is blocked and
 * nothing on screen says why.
 */
const invalid = mount({ value: [1], error: true, errorMessage: 'Pick a later stage.' });

check(
    "renders the platform's validation message and marks the group invalid",
    invalid.container.querySelector('p.ProcessFlow-message').textContent === 'Pick a later stage.'
        && invalid.container.querySelector('ol.ProcessFlow-track').getAttribute('aria-invalid') === 'true',
    invalid.container.querySelector('p.ProcessFlow-message').textContent,
);

/* ----------------------------------------------------------- accessibility */

const multiRoles = mount({ value: [1] });

check(
    'a multi-select column is a group of checkboxes',
    multiRoles.container.querySelector('ol.ProcessFlow-track').getAttribute('role') === 'group'
        && nodes(multiRoles).every((node) => node.getAttribute('role') === 'checkbox'),
    multiRoles.container.querySelector('ol.ProcessFlow-track').getAttribute('role'),
);

const singleRoles = mount({ value: 1, columnType: 'picklist' });

check(
    'a single-select column is a radiogroup of radios',
    singleRoles.container.querySelector('ol.ProcessFlow-track').getAttribute('role') === 'radiogroup'
        && nodes(singleRoles).every((node) => node.getAttribute('role') === 'radio'),
    singleRoles.container.querySelector('ol.ProcessFlow-track').getAttribute('role'),
);

check(
    'the current stage carries aria-current, and only it',
    nodes(scrambled).map((node) => node.getAttribute('aria-current')).join(',') === ',,step,',
    nodes(scrambled).map((node) => node.getAttribute('aria-current')).join(','),
);

/*
 * The three states differ by colour AND by shape, but neither reaches a screen
 * reader. The accessible name is what carries it there — and it has to be a
 * whole localised phrase rather than a label concatenated with a state word,
 * which is unfixable in a language that puts the verb last.
 */
check(
    'each step names its own state',
    nodes(scrambled)[0].getAttribute('aria-label') === 'Qualify — resx:ProcessFlow_StateDone'
        && nodes(scrambled)[2].getAttribute('aria-label') === 'Propose — resx:ProcessFlow_StateCurrent',
    nodes(scrambled)[2].getAttribute('aria-label'),
);

/*
 * One tab stop for the whole bar, landing on the stage the record is at rather
 * than on the first step — a roving tabindex, which is what a radiogroup and a
 * toolbar both owe.
 */
check(
    'the group is a single tab stop, on the current stage',
    JSON.stringify(nodes(scrambled).map((node) => node.tabIndex)) === JSON.stringify([-1, -1, 0, -1]),
    JSON.stringify(nodes(scrambled).map((node) => node.tabIndex)),
);

/*
 * `mode.label` is what the maker called this field on this form, which is a
 * better name than anything shippable in the .resx.
 */
check(
    "the group takes the form's own label for the field",
    scrambled.container.querySelector('ol.ProcessFlow-track').getAttribute('aria-label') === 'Sales stage',
    scrambled.container.querySelector('ol.ProcessFlow-track').getAttribute('aria-label'),
);

const unlabelled = mount({ value: [1], label: '' });

check(
    'and falls back to the resource string when the form gave none',
    unlabelled.container.querySelector('ol.ProcessFlow-track').getAttribute('aria-label') === 'resx:ProcessFlow_Name',
    unlabelled.container.querySelector('ol.ProcessFlow-track').getAttribute('aria-label'),
);

/*
 * A live region should carry events, not state. Wiring one to the value re-reads
 * it on every render, which makes the rest of the form unusable — and a control
 * appearing on a form is not a change to anything, so the first render seeds it
 * silently.
 */
const announcing = mount({ value: [1] });
const announcer = () => announcing.container.querySelector('span.ProcessFlow-announcer').textContent;

check(
    'arriving on the form announces nothing',
    announcer() === '',
    JSON.stringify(announcer()),
);

announcing.update({ value: [1] });

check(
    'and a render that changed nothing announces nothing',
    announcer() === '',
    JSON.stringify(announcer()),
);

announcing.update({ value: [1, 2, 3] });

check(
    'but moving to a new stage announces that stage',
    announcer() === 'Propose',
    JSON.stringify(announcer()),
);

/* ------------------------------------------------------- theme and RTL --- */

check(
    'a host that publishes no theme gets no dark class, rather than a guess',
    mount({ host: 'canvas', options: '1:A' }).container.className.indexOf('ProcessFlow--dark') === -1,
    mount({ host: 'canvas', options: '1:A' }).container.className,
);

check(
    'a host that says it is dark gets the class',
    mount({ value: [1], dark: true }).container.className.indexOf('ProcessFlow--dark') !== -1,
    mount({ value: [1], dark: true }).container.className,
);

check(
    'a right-to-left user gets dir on the container, which reverses the row',
    mount({ value: [1], rtl: true }).container.dir === 'rtl',
    mount({ value: [1], rtl: true }).container.dir,
);

/*
 * Canvas relies on `mode.isVisible`; a model-driven form hides the section
 * itself. One class covers both.
 */
check(
    'an invisible control hides itself',
    mount({ value: [1], visible: false }).container.className.indexOf('ProcessFlow--hidden') !== -1,
    mount({ value: [1], visible: false }).container.className,
);

/* ---------------------------------------------------- what destroy owes */

/*
 * **Keep this when the worked example above goes.** It is written against no
 * particular control and needs no knowledge of what yours takes.
 *
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. The interval
 * keeps firing against a container the platform has already thrown away; the
 * document listener keeps the whole control reachable, so nothing about it is
 * ever collected. On a form somebody leaves open all afternoon, or a subgrid
 * that re-renders its rows, they accumulate.
 *
 * Counting before and after is the whole trick. The scaffolded control takes
 * neither, so both numbers are zero and this passes trivially — which is the
 * point: it starts passing for a real reason the moment somebody adds a timer,
 * and fails the moment they forget the other half.
 */
disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({});

disposable.destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
    `${listenersBefore} → ${Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0)}`,
);

/*
 * The other half, and the leak this shape is famous for. `updateView` runs on
 * every change to any bound value, so a `setInterval` reached from the render
 * path adds a timer per render rather than replacing one.
 */
const rerendered = mount({});
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});
rerendered.update({});

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

report();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
