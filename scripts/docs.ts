/**
 * Generates the reference pages of the documentation from the parameter schemas, so that
 * they never drift from the code. Hand-written pages link to them.
 */
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
    ashlar,
    ashlarWear,
    patchDefinitionSchema,
    placementAnchorSchema,
    placementSchema,
    textureDefinitionSchema,
    type AshlarParams,
    type AshlarWear,
    type TextureGenerator,
} from '../src';
import { generators } from '../src/generators';

type JsonSchema = {
    type?: string;
    description?: string;
    default?: unknown;
    scale?: string;
    kind?: string;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    minItems?: number;
    items?: JsonSchema | false;
    prefixItems?: JsonSchema[];
    properties?: Record<string, JsonSchema>;
    anyOf?: JsonSchema[];
};

const DERIVED = '; when unset, derived from age';

function toJson(schema: z.ZodType): JsonSchema {
    return z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
}

/**
 * A readable type: "integer ≥ 1", "number in [0, 1]", "[min, max] of numbers ≥ 0"...
 */
function describeType(node: JsonSchema, plural = false): string {
    if (node.anyOf) {
        return node.anyOf.map((n) => describeType(n, plural)).join(' or ');
    }
    if (node.kind === 'color') {
        return plural ? 'CSS colors' : 'CSS color';
    }
    if (node.type === 'array' && node.prefixItems) {
        const [first, second] = node.prefixItems;
        const pair = node.description?.startsWith('[min, max]')
            ? '[min, max]'
            : node.description?.startsWith('[dx, dy]')
              ? '[dx, dy]'
              : '[width, height]';
        const item = describeType(first, true);
        return JSON.stringify(first) === JSON.stringify(second) ? `${pair} of ${item}` : pair;
    }
    if (node.type === 'array') {
        const items = node.items ? describeType(node.items, true) : 'values';
        return node.minItems ? `array of ${items}, at least ${node.minItems}` : `array of ${items}`;
    }
    if (node.type === 'integer' || node.type === 'number') {
        const name = node.type === 'integer' ? 'integer' : 'number';
        const noun = plural ? `${name}s` : name;
        // Zod bounds integers by the safe integer range: not worth showing
        const max = node.maximum === Number.MAX_SAFE_INTEGER ? undefined : node.maximum;
        const lower =
            node.exclusiveMinimum !== undefined
                ? { value: node.exclusiveMinimum, open: true }
                : node.minimum !== undefined && node.minimum > Number.MIN_SAFE_INTEGER
                  ? { value: node.minimum, open: false }
                  : undefined;
        const upper =
            node.exclusiveMaximum !== undefined
                ? { value: node.exclusiveMaximum, open: true }
                : max !== undefined
                  ? { value: max, open: false }
                  : undefined;
        if (lower && upper) {
            return `${noun} in ${lower.open ? '(' : '['}${lower.value}, ${upper.value}${upper.open ? ')' : ']'}`;
        }
        if (lower) {
            return `${noun} ${lower.open ? '>' : '≥'} ${lower.value}`;
        }
        if (upper) {
            return `${noun} ${upper.open ? '<' : '≤'} ${upper.value}`;
        }
        return noun;
    }
    if (node.type === 'object') {
        return 'object';
    }
    return node.type ? (plural ? `${node.type}s` : node.type) : 'any';
}

function cell(text: string): string {
    return text.replace(/\|/g, '\\|');
}

function describeDefault(node: JsonSchema, derivable: boolean): string {
    if (node.default !== undefined) {
        return `\`${JSON.stringify(node.default).replace(/,/g, ', ')}\``;
    }
    return derivable && node.description?.endsWith(DERIVED) ? 'from `age`' : '—';
}

type Row = { path: string; node: JsonSchema };

/**
 * Leaf properties of an object schema, nested objects as dotted paths.
 */
function leaves(properties: Record<string, JsonSchema>, prefix = ''): Row[] {
    return Object.entries(properties).flatMap(([key, node]) =>
        node.type === 'object' && node.properties
            ? leaves(node.properties, `${prefix}${key}.`)
            : [{ path: prefix + key, node }],
    );
}

function table(rows: Row[], { scale = true, derivable = false } = {}): string {
    const head = scale
        ? '| Parameter | Type | Default | Scale | Description |\n| --- | --- | --- | --- | --- |'
        : '| Key | Type | Default | Description |\n| --- | --- | --- | --- |';
    const lines = rows.map(({ path, node }) => {
        let description = (node.description ?? '').replace(DERIVED, '');
        let fallback = describeDefault(node, derivable);
        // "...; defaults to the patch seed" goes to the default column
        const implicit = description.match(/;\s*defaults to (.+)$/);
        if (implicit && node.default === undefined) {
            description = description.slice(0, implicit.index);
            fallback = implicit[1];
        }
        const columns = [
            `\`${path}\``,
            describeType(node),
            fallback,
            ...(scale ? [node.scale ?? '—'] : []),
            description,
        ];
        return `| ${columns.map(cell).join(' | ')} |`;
    });
    return [head, ...lines].join('\n');
}

/**
 * Parameters of a template, one table per group.
 */
function parameterSections(generator: TextureGenerator, derivable: boolean): string {
    const properties = toJson(generator.schema).properties ?? {};
    const general = Object.entries(properties).filter(([, node]) => node.type !== 'object');
    const groups = Object.entries(properties).filter(([, node]) => node.type === 'object');
    const sections = [
        `### General\n\n${table(
            general.map(([path, node]) => ({ path, node })),
            { derivable },
        )}`,
        ...groups.map(
            ([name, node]) =>
                `### \`${name}\`\n\n${capitalize(node.description ?? '')}.\n\n${table(
                    leaves(node.properties ?? {}, `${name}.`),
                    { derivable },
                )}`,
        ),
    ];
    return sections.join('\n\n');
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** documented ages of the ashlar wear table */
const AGES = [0, 0.3, 0.6, 1];

/** ashlar parameters derived from age, and where they are in the resolved wear */
const WEAR_PARAMETERS: [string, (w: AshlarWear) => number | [number, number]][] = [
    ['edges.roughness', (w) => w.roughness],
    ['chips.ratio', (w) => w.chips.ratio],
    ['chips.size', (w) => w.chips.size],
    ['cracks.ratio', (w) => w.cracks.ratio],
    ['cracks.length', (w) => w.cracks.length],
    ['stone.grain', (w) => w.grain],
    ['stone.shadeVariation', (w) => w.shadeVariation],
    ['mortar.noise', (w) => w.mortar.noise],
    ['mortar.erosion', (w) => w.mortar.erosion],
    ['erosion.corners', (w) => w.erosion.corners],
    ['erosion.edges', (w) => w.erosion.edges],
    ['stains.ratio', (w) => w.stains.ratio],
    ['stains.length', (w) => w.stains.length],
    ['stains.width', (w) => w.stains.width],
    ['stains.darkness', (w) => w.stains.darkness],
    ['stains.grime', (w) => w.stains.grime],
    ['spalling.ratio', (w) => w.spalling.ratio],
    ['spalling.size', (w) => w.spalling.size],
    ['spalling.depth', (w) => w.spalling.depth],
];

function round(value: number): string {
    return String(Math.round(value * 100) / 100);
}

function ageTable(): string {
    const wear = AGES.map((age) => ashlarWear({ ...ashlar.defaults, age } as AshlarParams));
    const head = `| Parameter | ${AGES.map((a) => `age ${a}`).join(' | ')} |\n| --- |${' --- |'.repeat(AGES.length)}`;
    const rows = WEAR_PARAMETERS.map(([path, get]) => {
        const values = wear.map((w) => {
            const v = get(w);
            return Array.isArray(v) ? `[${v.map(round).join(', ')}]` : round(v);
        });
        return `| \`${path}\` | ${values.join(' | ')} |`;
    });
    return [head, ...rows].join('\n');
}

/** extra sections of some template pages */
const EXTRA: Record<string, string> = {
    ashlar: `## Aging

\`age\`, from 0 (new) to 1 (ruined), sets every wear parameter left unset. Values in
between are interpolated linearly between age 0, 0.3 (the default) and 1. Parameters set
explicitly always win: \`{ "age": 0.8, "stains": { "ratio": 0 } }\` is a ruined wall
without streaks. See [Aging](../concepts.md#aging).

![ashlar at age 0, 0.3, 0.6 and 1](../images/ashlar-ages.png)

${ageTable()}`,
    moss: `## Usage

\`moss\` is an overlay: it is transparent outside the moss, and meant to be anchored under
the joints of a wall, one patch per row of stones:

\`\`\`jsonc
{ "patch": "./patches/moss.json", "anchor": { "to": "wall", "at": "rows" }, "width": 100, "height": 25 }
\`\`\`

As an overlay, it never hides the anchor points of the patches under it. See
[Anchors](../texture-files.md#anchors).`,
};

function templatePage(generator: TextureGenerator): string {
    const derivable = generator.name === 'ashlar';
    const anchors = Object.entries(generator.anchors ?? {});
    return [
        `<!-- generated by "npm run docs" from the template schema: do not edit -->`,
        `# \`${generator.name}\``,
        `${capitalize(generator.description)}.${generator.overlay ? ' This template is an **overlay**: transparent by design, meant to be laid over another patch.' : ''}`,
        `![${generator.name}](../images/${generator.name}.png)`,
        `Own size: ${generator.defaults.size.join(' × ')} pixels. Parameters marked **layout** are expressed at this size and scale with the patch; **detail** parameters are real pixels and never scale. See [Layout and detail](../concepts.md#layout-and-detail).`,
        `## Parameters`,
        parameterSections(generator, derivable),
        anchors.length
            ? `## Anchors\n\n| Anchor | Points |\n| --- | --- |\n${anchors
                  .map(([name, description]) => `| \`${name}\` | ${cell(description)} |`)
                  .join('\n')}`
            : '',
        EXTRA[generator.name] ?? '',
        `## Example\n\n\`\`\`json\n${JSON.stringify(
            {
                $schema: '../../schemas/patch.schema.json',
                template: generator.name,
                size: generator.defaults.size,
            },
            null,
            2,
        )}\n\`\`\``,
    ]
        .filter(Boolean)
        .join('\n\n');
}

function templatesIndex(): string {
    return [
        `<!-- generated by "npm run docs" from the template schemas: do not edit -->`,
        `# Templates`,
        `A template is a generator: a patch file names it in \`template\` and sets its parameters.`,
        `| Template | Description | Own size | Overlay | Anchors |\n| --- | --- | --- | --- | --- |\n${Object.values(
            generators,
        )
            .map(
                (g) =>
                    `| [\`${g.name}\`](${g.name}.md) | ${g.description} | ${g.defaults.size.join(' × ')} | ${g.overlay ? 'yes' : 'no'} | ${
                        Object.keys(g.anchors ?? {})
                            .map((a) => `\`${a}\``)
                            .join(', ') || '—'
                    } |`,
            )
            .join('\n')}`,
    ].join('\n\n');
}

function fileReference(): string {
    const texture = toJson(textureDefinitionSchema).properties ?? {};
    const placement = toJson(placementSchema).properties ?? {};
    const anchor = toJson(placementAnchorSchema).properties ?? {};
    const patch = toJson(patchDefinitionSchema).properties ?? {};
    const rows = (properties: Record<string, JsonSchema>) =>
        Object.entries(properties).map(([path, node]) => ({ path, node }));
    // the patch of a placement is a path or an inline definition: describe it plainly
    placement.patch = { ...placement.patch, anyOf: undefined, type: 'file path or patch' };
    return [
        `<!-- generated by "npm run docs" from the file schemas: do not edit -->`,
        `# File reference`,
        `Every key of texture and patch files. See [Texture files](../texture-files.md) and [Patch files](../patch-files.md) for how they work together.`,
        `## Texture file\n\n${table(rows(texture), { scale: false })}`,
        `## Placement\n\nAn item of \`patches\` in a texture file.\n\n${table(rows(placement), { scale: false })}`,
        `## Anchor\n\nThe \`anchor\` of a placement.\n\n${table(rows(anchor), { scale: false })}`,
        `## Patch file\n\nThe keys every patch file can have; the other keys are the parameters of its \`template\`, see [Templates](../templates/README.md).\n\n${table(rows(patch), { scale: false })}`,
    ].join('\n\n');
}

/**
 * Generated documentation pages, formatted with the project's Prettier settings.
 * @returns page contents, indexed by path relative to the repository root
 */
export async function renderDocs(): Promise<Record<string, string>> {
    const pages: Record<string, string> = {
        'documentation/templates/README.md': templatesIndex(),
        'documentation/reference/file-reference.md': fileReference(),
    };
    for (const g of Object.values(generators)) {
        pages[`documentation/templates/${g.name}.md`] = templatePage(g);
    }
    const formatted: Record<string, string> = {};
    for (const [path, content] of Object.entries(pages)) {
        const options = (await resolveConfig(path)) ?? {};
        formatted[path] = await format(content + '\n', { ...options, filepath: path });
    }
    return formatted;
}
