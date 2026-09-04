import { IInputs } from './generated/ManifestTypes';

type OptionMetadata = ComponentFramework.PropertyHelper.OptionMetadata;
type OptionSetMetadata = ComponentFramework.PropertyHelper.FieldPropertyMetadata.OptionSetMetadata;
type BoundProperty = ComponentFramework.PropertyTypes.Property;

/** What the bound column is physically capable of storing. */
export type ColumnArity = 'single' | 'multiple' | 'unknown';

/** How a step reads on the bar. */
export type StepState = 'done' | 'current' | 'future';

export interface Step {
    /** The option's own value, which is what gets written back. */
    value: number;
    label: string;
    /** Already resolved against the fallback — never empty. */
    color: string;
    state: StepState;
}

export interface Exclusions {
    values: Set<number>;
    /** Trimmed and lower-cased, so matching is case-insensitive. */
    labels: Set<string>;
}

/** Dataverse's own default for a business process flow stage. */
export const DEFAULT_COLOR = '#e8502a';

/**
 * The bound property is type-grouped, so pcf-scripts types it as the base
 * `Property` — `raw: any`, `attributes` as the base `Metadata` without
 * `Options`. Both narrowings live here rather than being repeated at each use.
 */
export function boundValue(context: ComponentFramework.Context<IInputs>): BoundProperty {
    return context.parameters.value;
}

/** Dataverse's own attribute type names, as `attributes.Type` reports them. */
const MULTI_ATTRIBUTE_TYPES = new Set(['multiselectpicklist']);
const SINGLE_ATTRIBUTE_TYPES = new Set(['picklist', 'state', 'status']);

/**
 * Dataverse's attribute type for the bound column — `picklist`,
 * `multiselectpicklist`, `state`, `status`.
 *
 * Read off `attributes` even though the declared `Metadata` interface does not
 * include it. The runtime object carries considerably more than the type
 * definitions admit (`Behavior`, `DefaultValue`, `EntityLogicalName`, `Format`,
 * `Options`, `Precision`, `Timestamp`, `Type`), observed directly on a
 * model-driven form. Hence the cast, the `typeof` guard, and callers that still
 * work when it is missing.
 */
function attributeType(property: BoundProperty): string {
    const attributes = property.attributes as { Type?: unknown } | undefined;

    return typeof attributes?.Type === 'string' ? attributes.Type.toLowerCase() : '';
}

/**
 * What the column can hold, from metadata alone.
 *
 * `attributes.Type` is the discriminator, and it is the *only* one that works.
 * Reading `property.type` instead is wrong: on a type-grouped property the
 * platform reports `"MultiSelectOptionSet"` there for **every** binding —
 * observed on a single-select `address1_addresstypecode` column, which reports
 * `attributes.Type: "picklist"` and `type: "MultiSelectOptionSet"` at the same
 * time.
 *
 * `unknown` is a real answer, not a failure: a canvas app publishes no column
 * metadata at all.
 */
export function resolveColumnArity(property: BoundProperty): ColumnArity {
    const type = attributeType(property);

    if (MULTI_ATTRIBUTE_TYPES.has(type)) {
        return 'multiple';
    }

    if (SINGLE_ATTRIBUTE_TYPES.has(type)) {
        return 'single';
    }

    return 'unknown';
}

/**
 * The arity to *render and interact* with, which always has an answer.
 *
 * Metadata first. Failing that, an array `raw` is proof of a multi-select
 * column — only that arity produces one. Failing that, single: the commoner
 * column, and the safer wrong answer, since it marks fewer steps than the
 * column allows rather than more.
 */
export function resolveArity(property: BoundProperty): 'single' | 'multiple' {
    const arity = resolveColumnArity(property);

    if (arity !== 'unknown') {
        return arity;
    }

    return Array.isArray(property.raw) ? 'multiple' : 'single';
}

/**
 * Whether the bound column expects an array written back to it.
 *
 * Deliberately a separate question from how the bar behaves. Metadata is
 * authoritative; with none, the rendered arity is the only available guess.
 */
export function writesArray(property: BoundProperty): boolean {
    const arity = resolveColumnArity(property);

    if (arity !== 'unknown') {
        return arity === 'multiple';
    }

    return resolveArity(property) === 'multiple';
}

/**
 * Normalise either arity to an array of option values, so the rest of the
 * control has one shape to deal with.
 *
 * A bare number is the documented shape, and it is not the only one that
 * arrives. A single-select column bound through this control's type group hands
 * over an object instead — observed on a real form as
 * `{ _label: 'Bill To', _val: 1, _state: -1, ... }`, where `_val` carries the
 * option value. Reading only `typeof raw === 'number'` there yields an empty
 * selection: the bar renders, and no step looks marked.
 *
 * `_val` is a minified internal field and could be renamed by a platform
 * update, which is exactly why it is one candidate among several and why
 * failing to find a value drops that entry instead of throwing.
 */
export function toSelection(raw: unknown): number[] {
    if (raw === null || raw === undefined) {
        return [];
    }

    return (Array.isArray(raw) ? raw : [raw]).flatMap(toOptionValue);
}

function toOptionValue(entry: unknown): number[] {
    if (typeof entry === 'number') {
        return Number.isFinite(entry) ? [entry] : [];
    }

    if (typeof entry === 'string') {
        const parsed = Number(entry.trim());

        return entry.trim() !== '' && Number.isFinite(parsed) ? [parsed] : [];
    }

    if (entry !== null && typeof entry === 'object') {
        const candidates = entry as Record<string, unknown>;

        for (const key of ['_val', 'Value', 'value', 'val', 'id']) {
            const candidate = candidates[key];

            if (typeof candidate === 'number' && Number.isFinite(candidate)) {
                return [candidate];
            }
        }
    }

    return [];
}

/**
 * Two sources, in priority order: the `options` input property, then the bound
 * column's own metadata.
 *
 * **This is also where the step order comes from.** `attributes.Options`
 * arrives in the display order the maker set in the choice editor, and the
 * override is read in the order it was written, so in both cases the order of
 * the options is the order of the steps.
 *
 * The override wins when set so a maker can relabel, recolour or reorder per
 * form. It is also the only source that exists in a host without column
 * metadata and in PCFHub's demo harness — the harness's `baseAttributes()`
 * returns `DisplayName`, `LogicalName`, `Description`, `IsSecured`,
 * `SourceType` and `RequiredLevel` and no `Options` at all, so a control that
 * read metadata alone would render an empty bar in its own demo.
 */
export function resolveOptions(context: ComponentFramework.Context<IInputs>): OptionMetadata[] {
    const override = parseOptions(context.parameters.options.raw);

    if (override.length > 0) {
        return override;
    }

    const attributes = boundValue(context).attributes as OptionSetMetadata | undefined;

    return attributes?.Options ?? [];
}

/**
 * Accepts the platform's own `OptionMetadata` shape as JSON, or the shorter
 * `1:Qualify:#E8502A, 2:Develop` form that a maker can type by hand. The colour
 * is optional in the shorthand.
 *
 * A malformed entry is skipped rather than thrown: a typo in one option should
 * cost that step, not blank the whole bar.
 */
export function parseOptions(raw: string | null): OptionMetadata[] {
    const text = (raw ?? '').trim();

    if (text === '') {
        return [];
    }

    if (text.startsWith('[')) {
        return parseJsonOptions(text);
    }

    return text.split(',').flatMap((entry) => {
        const parts = entry.split(':');

        if (parts.length < 2) {
            return [];
        }

        const value = Number(parts[0].trim());
        const label = parts[1].trim();
        // Anything past the second colon is the colour, joined rather than
        // indexed so a stray colon in it does not silently truncate.
        const color = parts.slice(2).join(':').trim();

        return Number.isFinite(value) && label !== ''
            ? [{ Value: value, Label: label, Color: color }]
            : [];
    });
}

function parseJsonOptions(text: string): OptionMetadata[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.flatMap((entry) => {
        const record = entry as { Value?: unknown; Label?: unknown; Color?: unknown };

        return typeof record.Value === 'number' && typeof record.Label === 'string'
            ? [{
                Value: record.Value,
                Label: record.Label,
                Color: typeof record.Color === 'string' ? record.Color : '',
            }]
            : [];
    });
}

/**
 * The comma-separated hide list, split into the two things an entry can be.
 *
 * An entry that parses as a finite number is a value; anything else is a label.
 * Both are accepted because makers think in labels and integrators think in
 * values, and the two cannot realistically collide — a Dataverse option label
 * is never a bare integer, and if one were, hiding it by value still works.
 */
export function parseExclusions(raw: string | null): Exclusions {
    const values = new Set<number>();
    const labels = new Set<string>();

    for (const entry of (raw ?? '').split(',')) {
        const trimmed = entry.trim();

        if (trimmed === '') {
            continue;
        }

        const parsed = Number(trimmed);

        if (Number.isFinite(parsed)) {
            values.add(parsed);
        } else {
            labels.add(trimmed.toLowerCase());
        }
    }

    return { values, labels };
}

export function isExcluded(option: OptionMetadata, rules: Exclusions): boolean {
    return rules.values.has(option.Value) || rules.labels.has(option.Label.trim().toLowerCase());
}

/** The steps that get drawn, in option order. */
export function visibleOptions(options: OptionMetadata[], rules: Exclusions): OptionMetadata[] {
    return options.filter((option) => !isExcluded(option, rules));
}

/**
 * Selected values the bar cannot show — excluded, or absent from the option
 * list entirely.
 *
 * These are carried through every write-back untouched. Hiding a step is a
 * display decision, and a maker who hides "Cancelled" is not asking for it to
 * be erased from every record that holds it. Without this, the first click on
 * any visible step silently deletes it.
 */
export function preservedSelection(visible: OptionMetadata[], selected: number[]): number[] {
    const shown = new Set(visible.map((option) => option.Value));

    return selected.filter((value) => !shown.has(value));
}

/**
 * The bar, in option order, with each step's state resolved.
 *
 * The two arities mean genuinely different things, and both reproduce the
 * native flow's done / current / future reading:
 *
 * - **multiple** — the marks are explicit. Every marked step is done except the
 *   last one in option order, which is the stage the record is at.
 * - **single** — the column holds one value, so the marks cannot be explicit.
 *   The selected option is the current stage and everything *before* it in
 *   option order is done, which is how a business process flow reads: being at
 *   Propose means Qualify and Develop are behind you.
 *
 * With nothing selected every step is future, on either arity.
 *
 * Note that `selected` is not read in order — only membership matters. The
 * order of a multi-select column's stored array is storage order and carries no
 * meaning; step order comes from `options` alone.
 */
export function resolveSteps(
    options: OptionMetadata[],
    selected: number[],
    arity: 'single' | 'multiple',
    fallbackColor: string,
): Step[] {
    const marked = new Set(selected);

    let currentIndex = -1;

    options.forEach((option, index) => {
        if (marked.has(option.Value)) {
            currentIndex = index;
        }
    });

    return options.map((option, index) => ({
        value: option.Value,
        label: option.Label,
        color: resolveColor(option.Color, fallbackColor),
        state: stateFor(index, currentIndex, marked.has(option.Value), arity),
    }));
}

function stateFor(
    index: number,
    currentIndex: number,
    isMarked: boolean,
    arity: 'single' | 'multiple',
): StepState {
    if (index === currentIndex) {
        return 'current';
    }

    if (arity === 'single') {
        // Implicit: everything ahead of the stage the record is at.
        return currentIndex >= 0 && index < currentIndex ? 'done' : 'future';
    }

    return isMarked ? 'done' : 'future';
}

/**
 * What the visible selection becomes when the user activates `value`, or `null`
 * when the control should refuse the interaction and change nothing.
 *
 * - **multiple** — a plain toggle. Marking and unmarking steps is the point.
 * - **single** — activating a different step moves the stage there. Activating
 *   the stage the record is already at does nothing: a Choice column holds one
 *   value, and emptying the column is a bigger decision than a click on the
 *   step that is already current should carry.
 */
export function nextSelection(
    arity: 'single' | 'multiple',
    selected: number[],
    value: number,
): number[] | null {
    const isSelected = selected.includes(value);

    if (arity === 'multiple') {
        return isSelected ? selected.filter((entry) => entry !== value) : [...selected, value];
    }

    return isSelected ? null : [value];
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * An option's own colour, or the fallback.
 *
 * A colour is optional in the choice editor, so most options carry an empty
 * string — which is the case the orange exists for. A malformed value is
 * treated the same as an absent one rather than passed through to CSS, where it
 * would resolve to nothing and leave an invisible step.
 */
export function resolveColor(raw: string | null | undefined, fallback: string): string {
    return normaliseColor(raw) ?? normaliseColor(fallback) ?? DEFAULT_COLOR;
}

/** A hex colour, expanded and lower-cased, or `null` if it was not one. */
export function normaliseColor(raw: string | null | undefined): string | null {
    const match = HEX.exec((raw ?? '').trim());

    return match === null ? null : expand(match[1]);
}

function expand(digits: string): string {
    const full = digits.length === 3
        ? digits.split('').map((digit) => digit + digit).join('')
        : digits;

    return `#${full.toLowerCase()}`;
}

/**
 * White for the tick drawn on top of a step's colour, unless the step is pale
 * enough that white would fail.
 *
 * Not a constant: an option can be any colour the maker picked, and a white
 * tick on a pale yellow step is invisible.
 *
 * **The threshold is 3:1, not 4.5:1, and it is not "whichever contrasts more".**
 * The tick is a graphical object rather than text, so WCAG 1.4.11 Non-text
 * Contrast is what applies and 3:1 is what it asks for. Maximising contrast
 * instead sounds stricter and is worse here: it crosses over at a luminance of
 * about 0.18, which puts a black tick on the business process flow orange —
 * comfortably legible, unlike every native flow anyone has seen, and a change
 * nobody asked for. Preferring white down to the point where it genuinely stops
 * being readable keeps the familiar look and still refuses the unreadable case.
 *
 * White at 3:1 holds up to L = 1.05 / 3 - 0.05.
 */
export function glyphColor(hex: string): string {
    const digits = (normaliseColor(hex) ?? DEFAULT_COLOR).slice(1);

    const channels = [0, 2, 4].map((offset) => {
        const srgb = parseInt(digits.slice(offset, offset + 2), 16) / 255;

        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });

    const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

    // Contrast against white is 1.05 / (L + 0.05), so it holds 3:1 while
    // L <= 1.05 / 3 - 0.05. Past that, black — which on any colour that pale
    // is far above 3:1 anyway.
    return luminance > 1.05 / 3 - 0.05 ? '#000000' : '#ffffff';
}
