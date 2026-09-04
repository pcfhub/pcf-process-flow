import { IInputs, IOutputs } from './generated/ManifestTypes';
import {
    DEFAULT_COLOR,
    Step,
    boundValue,
    glyphColor,
    nextSelection,
    normaliseColor,
    parseExclusions,
    preservedSelection,
    resolveArity,
    resolveOptions,
    resolveSteps,
    toSelection,
    visibleOptions,
    writesArray,
} from './options';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Fluent's `Checkmark12Filled`, copied verbatim out of the package:
 *
 *     grep -rhoE "^export const Checkmark12Filled = [^;]*" \
 *       node_modules/@fluentui/react-icons/lib/sizedIcons/
 *
 * Inlined rather than depended on — reaching one path string through a React
 * package would put its whole module graph in front of the bundler for a
 * control that uses no React at all.
 *
 * **Take the cut that matches the box.** Fluent redraws each size rather than
 * scaling one, so the 12 is the one to use inside a 14px circle: the 16 cut
 * rendered down has ink about 10px wide, which crowds the ring to its edges and
 * stops reading as a tick. The first version of this control drew a hand-written
 * path at the 16 size and produced a shape nobody recognised — which is the
 * whole argument for copying these rather than writing them.
 */
const CHECK_VIEWBOX = '0 0 12 12';
const CHECK_PATH =
    'M9.76 3.2c.3.29.32.76.04 1.06l-4.25 4.5a.75.75 0 0 1-1.08.02L2.22 6.53a.75.75 0'
    + ' 0 1 1.06-1.06l1.7 1.7L8.7 3.24a.75.75 0 0 1 1.06-.04';

/**
 * A choice column drawn as a business process flow stage bar.
 *
 * Standard rather than virtual on purpose: the whole surface is circles, a
 * connector line and labels, so there is no Fluent component being reused and
 * React would buy nothing. The stylesheet still reads Fluent's design tokens —
 * a model-driven form mounts a `FluentProvider` above every code component, and
 * reading the custom properties it emits needs no React at all.
 *
 * The interesting logic is all in `options.ts`, kept pure so `dev/smoke.js` can
 * drive it directly.
 */
export class ProcessFlow implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private track!: HTMLOListElement;
    private message!: HTMLParagraphElement;
    private announcer!: HTMLSpanElement;
    private notifyOutputChanged!: () => void;
    private resources!: ComponentFramework.Resources;

    /** The steps currently drawn, parallel to `nodes` and `items`. */
    private steps: Step[] = [];
    private nodes: HTMLButtonElement[] = [];

    /**
     * The `<li>` around each node.
     *
     * Kept because the step's colour is written here rather than on the button:
     * the connector is a pseudo-element of the `<li>`, and a custom property set
     * on the button cannot reach it — properties inherit downward only. Setting
     * it here reaches both, since the button inherits.
     */
    private items: HTMLLIElement[] = [];

    /** Everything the column holds, hidden values included. */
    private selected: number[] = [];

    /**
     * The two halves of `selected`, re-split on every render because the
     * exclude list can change without the column changing.
     *
     * `preserved` is what the bar cannot show — excluded, or missing from the
     * option list — and it is carried through every write-back untouched, so
     * hiding a step never deletes data.
     */
    private preserved: number[] = [];
    private visibleSelection: number[] = [];

    /** The column's shape, so `getOutputs` writes what the column takes. */
    private wantsArray = false;
    private arity: 'single' | 'multiple' = 'single';

    /**
     * The last value the platform handed down, so the control can tell a real
     * change from an echo of its own write. `undefined` means nothing yet.
     */
    private lastIncoming: string | undefined = undefined;

    /** Which step holds the group's single tab stop. */
    private focusIndex = 0;

    private interactive = true;

    /** The signature of the last bar built, so `updateView` can skip rebuilding. */
    private lastShape = '';

    /** Seeded silently on first render, so arriving on a form announces nothing. */
    private lastAnnounced: string | undefined = undefined;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.notifyOutputChanged = notifyOutputChanged;
        this.resources = context.resources;

        this.track = document.createElement('ol');
        this.track.className = 'ProcessFlow-track';
        this.track.addEventListener('click', this.onClick);
        this.track.addEventListener('keydown', this.onKeyDown);

        // The platform's own validation message, and the empty state. Without
        // somewhere to put it, a failing business rule is silent inside a code
        // component.
        this.message = document.createElement('p');
        this.message.className = 'ProcessFlow-message';

        // Carries state *transitions*, not the state itself — see `announce`.
        this.announcer = document.createElement('span');
        this.announcer.className = 'ProcessFlow-announcer';
        this.announcer.setAttribute('aria-live', 'polite');

        this.container.classList.add('ProcessFlow');
        this.container.append(this.track, this.message, this.announcer);

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.render(context);
    }

    /**
     * Every bound property, on every call.
     *
     * Two things here are easy to get wrong and both fail silently.
     *
     * The value written is the shape the *column* takes rather than the shape
     * the bar has, so a multi-select column showing one mark still gets an
     * array — writing it a bare number hands the platform a value of the wrong
     * shape for the column.
     *
     * And an empty selection is emitted as `null`, never `undefined`.
     * `undefined` means "no change" to the platform, so a canvas app simply
     * refuses to empty the column and the clear reads as a control that ignores
     * input. Nothing here forces the point — the type group makes `IOutputs`
     * `any`, so `?? undefined` would compile just as cleanly as the correct
     * version — which is exactly why it is worth stating.
     */
    public getOutputs(): IOutputs {
        if (this.wantsArray) {
            return { value: this.selected };
        }

        return { value: this.selected.length > 0 ? this.selected[this.selected.length - 1] : null };
    }

    public destroy(): void {
        this.track.removeEventListener('click', this.onClick);
        this.track.removeEventListener('keydown', this.onKeyDown);
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        const parameter = boundValue(context);

        // Before the visibility guard, so the no-access message is themed too.
        this.applyTheme(context);

        // Canvas relies on this; a model-driven form hides the section itself.
        this.container.classList.toggle('ProcessFlow--hidden', !context.mode.isVisible);

        if (!context.mode.isVisible) {
            return;
        }

        this.container.dir = context.userSettings.isRTL ? 'rtl' : 'ltr';

        // Field-level security is NOT the form's read-only state, and
        // conflating them is a real information bug. A user denied read access
        // gets `raw === null` — indistinguishable from "no stage reached"
        // unless `security.readable` is checked, so an unchecked control draws
        // an empty bar where the truth is "not allowed to see it".
        const security = parameter.security;

        if (security !== undefined && !security.readable) {
            this.track.hidden = true;
            this.message.hidden = false;
            this.message.textContent = this.resources.getString('ProcessFlow_NoAccess');

            return;
        }

        this.interactive =
            !context.mode.isControlDisabled && (security === undefined || security.editable);
        this.container.classList.toggle('ProcessFlow--disabled', !this.interactive);

        this.arity = resolveArity(parameter);
        this.wantsArray = writesArray(parameter);

        const options = resolveOptions(context);
        const rules = parseExclusions(context.parameters.exclude.raw);
        const visible = visibleOptions(options, rules);

        // Guarded rather than assigned unconditionally: `updateView` runs on
        // every change to any bound value on the form, including the echo of
        // this control's own write, and overwriting the selection there would
        // discard a click the platform has not yet handed back.
        const incoming = JSON.stringify(parameter.raw ?? null);

        if (incoming !== this.lastIncoming) {
            this.lastIncoming = incoming;
            this.selected = toSelection(parameter.raw);
        }

        // Re-split every render, not only when the column changed: the maker can
        // edit the exclude list, which moves a value between the two halves
        // without the column moving at all.
        this.preserved = preservedSelection(visible, this.selected);

        const hidden = new Set(this.preserved);

        this.visibleSelection = this.selected.filter((value) => !hidden.has(value));

        if (visible.length === 0) {
            this.track.hidden = true;
            this.message.hidden = false;
            this.message.textContent = this.resources.getString('ProcessFlow_NoSteps');
            this.container.classList.remove('ProcessFlow--invalid');

            return;
        }

        this.track.hidden = false;
        this.steps = resolveSteps(
            visible,
            this.visibleSelection,
            this.arity,
            normaliseColor(context.parameters.defaultColor.raw) ?? DEFAULT_COLOR,
        );

        // Rebuilding the DOM on every render would throw away focus mid-tab and
        // re-run the layout for nothing, and `updateView` runs constantly. The
        // element list only has to change when the steps themselves do.
        const shape = this.steps.map((step) => `${step.value}:${step.label}:${step.color}`).join('|');

        if (shape !== this.lastShape) {
            this.lastShape = shape;
            this.build();
        }

        this.paint(context);
    }

    /** Rebuild the step elements. Only called when the step list itself changed. */
    private build(): void {
        this.track.textContent = '';
        this.items = [];
        this.nodes = this.steps.map((step, index) => {
            const node = document.createElement('button');

            node.type = 'button';
            node.className = 'ProcessFlow-node';
            node.dataset.index = String(index);

            const marker = document.createElement('span');

            marker.className = 'ProcessFlow-marker';
            marker.append(checkGlyph());

            const label = document.createElement('span');

            label.className = 'ProcessFlow-label';
            label.textContent = step.label;

            node.append(marker, label);

            const item = document.createElement('li');

            item.className = 'ProcessFlow-step';
            item.append(node);
            this.track.append(item);
            this.items.push(item);

            return node;
        });

        this.focusIndex = Math.min(this.focusIndex, this.nodes.length - 1);
    }

    /** Re-apply everything that changes without the step list changing. */
    private paint(context: ComponentFramework.Context<IInputs>): void {
        const parameter = boundValue(context);

        // A multi-select column is a set of independent toggles; a Choice
        // column is one-of-N. Real semantics rather than clickable divs, so the
        // arity is announced rather than merely looking different.
        this.track.setAttribute('role', this.arity === 'multiple' ? 'group' : 'radiogroup');

        // `mode.label` is the label the maker gave the field on this form, which
        // is a better accessible name than anything shipped in the .resx. The
        // resource string is the fallback, not the default.
        this.track.setAttribute(
            'aria-label',
            context.mode.label || this.resources.getString('ProcessFlow_Name'),
        );

        // The current stage is the one worth landing on when tabbing in.
        const current = this.steps.findIndex((step) => step.state === 'current');

        if (current >= 0 && !this.nodes.some((node) => node === document.activeElement)) {
            this.focusIndex = current;
        }

        this.steps.forEach((step, index) => {
            const node = this.nodes[index];
            const item = this.items[index];
            const marked = step.state !== 'future';

            node.className = `ProcessFlow-node ProcessFlow-node--${step.state}`;

            // On the <li>, not the button. The connector into this step is a
            // pseudo-element of the <li>, and custom properties inherit
            // downward only — set on the button, the rail could not read it and
            // fell back to the default orange, which is invisible until an
            // option carries a colour of its own.
            item.style.setProperty('--ProcessFlow-step-color', step.color);
            item.style.setProperty('--ProcessFlow-step-glyph', glyphColor(step.color));
            node.setAttribute('role', this.arity === 'multiple' ? 'checkbox' : 'radio');
            node.setAttribute('aria-checked', String(this.visibleSelection.includes(step.value)));
            node.tabIndex = index === this.focusIndex ? 0 : -1;
            node.disabled = !this.interactive;

            // Colour alone cannot carry the state — forced-colours mode
            // collapses every tint, and a screen reader never saw it. The tick,
            // the ring and the hollow circle carry it visually; the name carries
            // it to anything that reads text.
            node.title = `${step.label} — ${this.stateLabel(step.state)}`;
            node.setAttribute('aria-label', node.title);

            // `aria-current="step"` is the standard way to say which one of a
            // sequence is the one in progress.
            if (step.state === 'current') {
                node.setAttribute('aria-current', 'step');
            } else {
                node.removeAttribute('aria-current');
            }

            // The connector before a step is filled when that step is reached.
            item.classList.toggle('is-linked', marked);
        });

        this.container.classList.toggle('ProcessFlow--invalid', parameter.error);
        this.track.setAttribute('aria-invalid', String(parameter.error));

        this.message.hidden = !parameter.error;
        this.message.textContent = parameter.error ? parameter.errorMessage : '';

        this.announce();
    }

    private stateLabel(state: Step['state']): string {
        const keys = {
            done: 'ProcessFlow_StateDone',
            current: 'ProcessFlow_StateCurrent',
            future: 'ProcessFlow_StateFuture',
        };

        return this.resources.getString(keys[state]);
    }

    /**
     * Announce the stage the record is at, and only when it changes.
     *
     * A live region should carry events rather than state: wiring one to a
     * value re-reads it to a screen-reader user on every render, which makes
     * the rest of the form unusable. Seeded silently on the first pass, because
     * a control appearing on a form is not a change to anything.
     */
    private announce(): void {
        const current = this.steps.find((step) => step.state === 'current');
        const text = current === undefined
            ? this.resources.getString('ProcessFlow_NoStage')
            : current.label;

        if (this.lastAnnounced === undefined) {
            this.lastAnnounced = text;

            return;
        }

        if (this.lastAnnounced !== text) {
            this.lastAnnounced = text;
            this.announcer.textContent = text;
        }
    }

    /**
     * Picks which set of colour fallbacks the stylesheet uses.
     *
     * Only the fallbacks. Where the host publishes Fluent's design tokens — a
     * model-driven form does — the CSS reads them straight through `var()` and
     * this changes nothing, which is what stops the control fighting a host
     * that knows its own theme better than this code does.
     *
     * `@media (prefers-color-scheme: dark)` is the obvious hook and the wrong
     * question: a model-driven app carries its own theme and the OS setting
     * says nothing about it. Absent means absent — no class, light fallbacks,
     * the same guess the host made by not saying.
     */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('ProcessFlow--dark', isDarkTheme);
    }

    private onClick = (event: MouseEvent): void => {
        const index = this.indexOf(event.target);

        if (index !== null) {
            this.focusIndex = index;
            this.activate(index);
        }
    };

    private onKeyDown = (event: KeyboardEvent): void => {
        const index = this.indexOf(event.target);

        if (index === null || this.nodes.length === 0) {
            return;
        }

        // Under RTL the arrows swap: the step to the visual right of this one is
        // the *previous* step. Invisible to an LTR reviewer and wrong for every
        // right-to-left user.
        const back = this.container.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        const forward = this.container.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';

        let next: number | null = null;

        if (event.key === back || event.key === 'ArrowUp') {
            next = Math.max(0, index - 1);
        } else if (event.key === forward || event.key === 'ArrowDown') {
            next = Math.min(this.nodes.length - 1, index + 1);
        } else if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = this.nodes.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        this.focusIndex = next;
        this.nodes.forEach((node, position) => {
            node.tabIndex = position === next ? 0 : -1;
        });
        this.nodes[next].focus();
    };

    /** The step index for an event target, or `null` if it was not on a step. */
    private indexOf(target: EventTarget | null): number | null {
        // `closest` already proves this is one of the buttons `build()` made,
        // so there is nothing an `instanceof HTMLElement` would add beyond a
        // second global to depend on.
        const node = target instanceof Element
            ? (target.closest('.ProcessFlow-node') as HTMLElement | null)
            : null;

        if (node === null) {
            return null;
        }

        const index = Number(node.dataset.index);

        return Number.isInteger(index) && index >= 0 && index < this.steps.length ? index : null;
    }

    private activate(index: number): void {
        if (!this.interactive) {
            return;
        }

        const next = nextSelection(this.arity, this.visibleSelection, this.steps[index].value);

        if (next === null) {
            return;
        }

        this.visibleSelection = next;
        this.selected = [...this.preserved, ...next];

        // `lastIncoming` is deliberately NOT touched here. It records what the
        // *platform* last supplied, so a render that arrives before the write
        // has been committed finds that value unchanged and leaves this
        // selection alone — rather than snapping the bar back a frame after the
        // click, which reads as a control that ignores input even though the
        // write is working and OnChange is firing.
        this.notifyOutputChanged();
    }
}

/** Fluent's checkmark, built in the SVG namespace. */
function checkGlyph(): SVGSVGElement {
    // `document.createElement('svg')` returns an HTMLUnknownElement that parses,
    // appends, takes no space and draws nothing — the failure looks like CSS for
    // as long as you let it.
    const svg = document.createElementNS(SVG_NS, 'svg');

    // `className` on an SVG element is a read-only SVGAnimatedString; assigning
    // to it silently does nothing.
    svg.classList.add('ProcessFlow-check');
    svg.setAttribute('viewBox', CHECK_VIEWBOX);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NS, 'path');

    path.setAttribute('d', CHECK_PATH);
    svg.append(path);

    return svg;
}
