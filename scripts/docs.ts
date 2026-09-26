/**
 * Generates the reference pages of the documentation from the parameter schemas, so that
 * they never drift from the code. Hand-written pages link to them.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
    ashlarWear,
    bannerWear,
    barsWear,
    cobwebWear,
    columnWear,
    type ColumnWear,
    entablatureWear,
    type EntablatureWear,
    shieldWear,
    type ShieldWear,
    chainWear,
    type ChainWear,
    bookshelfWear,
    type BookshelfWear,
    windowWear,
    type WindowWear,
    beamWear,
    fieldstoneWear,
    type BeamWear,
    metalWear,
    type MetalWear,
    type BannerWear,
    type BarsWear,
    type CobwebWear,
    patchDefinitionSchema,
    placementAnchorSchema,
    placementSchema,
    textureDefinitionSchema,
    type AshlarWear,
    parchmentWear,
    type ParchmentWear,
    planksWear,
    type PlanksWear,
    type TextureGenerator,
    loadPatch,
    type Category,
} from '../src';
import { createNodeLoader } from '../src/cli/node-loader';
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

/** plank parameters derived from age, and where they are in the resolved wear */
const PLANK_WEAR_PARAMETERS: [string, (w: PlanksWear) => number | [number, number]][] = [
    ['weathering', (w) => w.weathering],
    ['splits.ratio', (w) => w.splits.ratio],
    ['splits.length', (w) => w.splits.length],
    ['edges.roughness', (w) => w.roughness],
    ['grime', (w) => w.grime],
];

/** parchment parameters derived from age, and where they are in the resolved wear */
const PARCHMENT_WEAR_PARAMETERS: [string, (w: ParchmentWear) => number | [number, number]][] = [
    ['yellowing', (w) => w.yellowing],
    ['foxing.density', (w) => w.foxing.density],
    ['foxing.size', (w) => w.foxing.size],
    ['edges.width', (w) => w.edges.width],
    ['edges.darkness', (w) => w.edges.darkness],
    ['edges.roughness', (w) => w.edges.roughness],
];

/** banner parameters derived from age, and where they are in the resolved wear */
const BANNER_WEAR_PARAMETERS: [string, (w: BannerWear) => number | [number, number]][] = [
    ['fading', (w) => w.fading],
    ['stains', (w) => w.stains],
    ['rips.count', (w) => w.rips.count],
    ['rips.depth', (w) => w.rips.depth],
    ['rips.roughness', (w) => w.rips.roughness],
    ['holes', (w) => w.holes],
];

/** metal parameters derived from age, and where they are in the resolved wear */
const METAL_WEAR_PARAMETERS: [string, (w: MetalWear) => number | [number, number]][] = [
    ['rust.coverage', (w) => w.rust.coverage],
    ['rust.streaks', (w) => w.rust.streaks],
    ['rust.length', (w) => w.rust.length],
    ['dents.density', (w) => w.dents.density],
    ['dents.size', (w) => w.dents.size],
    ['scratches', (w) => w.scratches],
    ['tarnish', (w) => w.tarnish],
];

/** beam parameters derived from age, and where they are in the resolved wear */
const BEAM_WEAR_PARAMETERS: [string, (w: BeamWear) => number | [number, number]][] = [
    ['rust.coverage', (w) => w.rust.coverage],
    ['rust.streaks', (w) => w.rust.streaks],
    ['rust.length', (w) => w.rust.length],
    ['scratches', (w) => w.scratches],
    ['tarnish', (w) => w.tarnish],
];

/** bars parameters derived from age, and where they are in the resolved wear */
const BARS_WEAR_PARAMETERS: [string, (w: BarsWear) => number | [number, number]][] = [
    ['rust.coverage', (w) => w.rust.coverage],
    ['rust.streaks', (w) => w.rust.streaks],
    ['rust.length', (w) => w.rust.length],
    ['tarnish', (w) => w.tarnish],
    ['dents.density', (w) => w.dents.density],
    ['dents.size', (w) => w.dents.size],
    ['bends.ratio', (w) => w.bends.ratio],
    ['bends.amount', (w) => w.bends.amount],
    ['broken.ratio', (w) => w.broken.ratio],
    ['broken.length', (w) => w.broken.length],
];

/** cobweb parameters derived from age, and where they are in the resolved wear */
const COBWEB_WEAR_PARAMETERS: [string, (w: CobwebWear) => number][] = [
    ['torn', (w) => w.torn],
    ['dust', (w) => w.dust],
];

/** window parameters derived from age, and where they are in the resolved wear */
const WINDOW_WEAR_PARAMETERS: [string, (w: WindowWear) => number | [number, number]][] = [
    ['weathering', (w) => w.weathering],
    ['dirt', (w) => w.dirt],
    ['cracked', (w) => w.cracked],
    ['broken', (w) => w.broken],
    ['rust.coverage', (w) => w.rust.coverage],
    ['rust.streaks', (w) => w.rust.streaks],
    ['rust.length', (w) => w.rust.length],
    ['tarnish', (w) => w.tarnish],
];

/** bookshelf parameters derived from age, and where they are in the resolved wear */
const BOOKSHELF_WEAR_PARAMETERS: [string, (w: BookshelfWear) => number][] = [
    ['weathering', (w) => w.weathering],
    ['fading', (w) => w.fading],
    ['dust', (w) => w.dust],
];

/** chain parameters derived from age, and where they are in the resolved wear */
const CHAIN_WEAR_PARAMETERS: [string, (w: ChainWear) => number][] = [
    ['rust', (w) => w.rust.coverage],
    ['tarnish', (w) => w.tarnish],
    ['broken', (w) => w.broken],
];

type WearRow = [string, (params: object) => number | [number, number]];

/**
 * Parameters derived from age by a template, and how to compute them.
 */
/**
 * Rows of an age table: each parameter, and how to get it from the resolved wear.
 * @param wear resolves the wear of a template from its parameters
 */
function rows<W>(
    parameters: [string, (w: W) => number | [number, number]][],
    wear: (params: never) => W,
): WearRow[] {
    return parameters.map(([path, get]) => [path, (params) => get(wear(params as never))]);
}

/** parameters derived from age, by template; the stone walls use {@link WEAR_PARAMETERS} */
const WEAR_ROWS: Record<string, WearRow[]> = {
    fieldstone: rows(
        WEAR_PARAMETERS.filter(
            ([path]) => !path.startsWith('chips.') && path !== 'erosion.corners',
        ),
        fieldstoneWear,
    ),
    beam: rows(BEAM_WEAR_PARAMETERS, beamWear),
    chain: rows(CHAIN_WEAR_PARAMETERS, chainWear),
    bookshelf: rows(BOOKSHELF_WEAR_PARAMETERS, bookshelfWear),
    window: rows(WINDOW_WEAR_PARAMETERS, windowWear),
    cobweb: rows(COBWEB_WEAR_PARAMETERS, cobwebWear),
    bars: rows(BARS_WEAR_PARAMETERS, barsWear),
    metal: rows(METAL_WEAR_PARAMETERS, metalWear),
    banner: rows(BANNER_WEAR_PARAMETERS, bannerWear),
    tapestry: rows(BANNER_WEAR_PARAMETERS, bannerWear),
    parchment: rows(PARCHMENT_WEAR_PARAMETERS, parchmentWear),
    planks: rows(PLANK_WEAR_PARAMETERS, planksWear),
    column: rows(
        [
            ['grime', (w: ColumnWear) => w.grime],
            ['chips', (w: ColumnWear) => w.chips],
            ['broken', (w: ColumnWear) => w.broken],
        ],
        columnWear,
    ),
    entablature: rows(
        [
            ['grime', (w: EntablatureWear) => w.grime],
            ['chips', (w: EntablatureWear) => w.chips],
            ['broken', (w: EntablatureWear) => w.broken],
        ],
        entablatureWear,
    ),
    shield: rows(
        [
            ['fading', (w: ShieldWear) => w.fading],
            ['flaking', (w: ShieldWear) => w.flaking],
            ['dents.density', (w: ShieldWear) => w.dents.density],
            ['dents.size', (w: ShieldWear) => w.dents.size],
        ],
        shieldWear,
    ),
};

/**
 * Parameters derived from age by a template, and how to compute them.
 */
function wearRows(generator: TextureGenerator): WearRow[] {
    return WEAR_ROWS[generator.name] ?? rows(WEAR_PARAMETERS, ashlarWear);
}

function ageTable(generator: TextureGenerator): string {
    const head = `| Parameter | ${AGES.map((a) => `age ${a}`).join(' | ')} |\n| --- |${' --- |'.repeat(AGES.length)}`;
    const rows = wearRows(generator).map(([path, get]) => {
        const values = AGES.map((age) => {
            const v = get({ ...generator.defaults, age });
            return Array.isArray(v) ? `[${v.map(round).join(', ')}]` : round(v);
        });
        return `| \`${path}\` | ${values.join(' | ')} |`;
    });
    return [head, ...rows].join('\n');
}

function isAging(generator: TextureGenerator): boolean {
    return 'age' in generator.defaults;
}

/** templates whose derived pixel sizes follow the height of their stones */
const STONE_WALLS = ['ashlar', 'bricks', 'panel', 'fieldstone'];

function agingSection(generator: TextureGenerator): string {
    const name = generator.name;
    if (name === 'door') {
        return `## Aging

\`age\`, from 0 (new) to 1 (ruined), is passed to the wood (\`planks\`) or to the metal
(\`metal\`) of the door, which weather as described on their pages, and rusts the iron
bands. The rough style adds 0.25 to the age of its wood.

![${name} at age 0, 0.3, 0.6 and 1](../images/${name}-ages.png)`;
    }
    return `## Aging

\`age\`, from 0 (new) to 1 (ruined), sets every wear parameter left unset. Values in
between are interpolated linearly between age 0, 0.3 (the default) and 1. Parameters set
explicitly always win: \`{ "age": 0.8, "stains": { "ratio": 0 } }\` is a ruined wall
without streaks. See [Aging](../concepts.md#aging).

![${name} at age 0, 0.3, 0.6 and 1](../images/${name}-ages.png)

${
    !STONE_WALLS.includes(name)
        ? `With its default parameters, \`${name}\` derives:`
        : `Derived sizes in pixels are proportional to the height of the stones at own size, 16
pixels giving the values of \`ashlar\`. With its default parameters, \`${name}\` derives:`
}

${ageTable(generator)}`;
}

/** extra sections of some template pages, before the aging section */
const EXTRA: Record<string, string> = {
    bricks: `## Bricks and ashlar

\`bricks\` is the [\`ashlar\`](ashlar.md) engine with brick defaults: it has exactly the same
parameters, anchors and aging. Its bricks are equal and laid in running bond
(\`blocks.bond\`): each row is offset by half a brick. With \`"bond": "stack"\`, the joints
are aligned; with \`"bond": "random"\`, bricks get random widths, like ashlar stones.

In regular bonds, each row holds as many equal bricks as the mean of \`blocks.width\` fits
in the width, and \`blocks.minJointOffset\` is not used. A running bond needs an even
\`rows.count\`, so that the texture tiles vertically.`,
    panel: `## The slab

\`panel\` is the [\`ashlar\`](ashlar.md) engine with its slab enabled: a large stone surrounded
by mortar, the joints of the wall stopping at its border and the stones around it cut to
fit. Every wall has the \`panel\` parameters: \`{ "panel": { "enabled": true } }\` adds a slab
to \`ashlar\` or [\`bricks\`](bricks.md) too.

- \`panel.x\`, \`panel.y\`, \`panel.width\` and \`panel.height\` are layout values, mortar
  included: they scale with the patch. Without \`x\` or \`y\`, the slab is centered on that
  axis.
- \`panel.snap\` (on by default) moves the top and the bottom of the slab to the nearest row
  joints, so that no row is cut into a thin strip: the slab height may change to match
  whole rows. Set it to \`false\` to keep the exact height.
- The slab ages with the wall: \`age\` chips its corners, cracks it and stains it.

## Usage

The slab leaves room for an inscription, a switch or a sign, placed with the \`panel\` or
\`panelCenter\` anchors. An anchor places the top-left corner of each copy on its point:
to center a 16 × 16 switch on the slab of a 64 × 64 texture, shift it by half its size:

\`\`\`jsonc
{
  "size": [64, 64],
  "patches": [
    { "id": "wall", "patch": { "template": "panel" }, "width": 100, "height": 100 },
    {
      "patch": "./patches/switch.json",
      "anchor": { "to": "wall", "at": "panelCenter", "offset": [-8, -8] },
      "width": 25,
      "height": 25
    }
  ]
}
\`\`\``,
    planks: `## Layout

Planks are laid in **lines**: columns of vertical planks, or rows of horizontal ones with
\`"direction": "horizontal"\`.

- \`lines.count\` sets the number of lines across the patch, or \`lines.width\` a plank width,
  the lines being then as many as this width fits. \`lines.widthVariation\` gives the lines
  random widths; together they always fill the patch exactly, so the texture tiles.
- \`planks.length\` is the \`[min, max]\` length of the planks, in **fraction of the patch
  size along the planks**: its height for vertical planks, its width for horizontal ones.
  Each line is filled with planks of random length, the last one cut to fit, and shifted
  at random so that the plank ends of neighbour lines do not line up. Planks crossing an
  edge continue on the opposite one, so the texture tiles in both directions.
- \`[1, 1]\` gives planks running across the whole patch, without any end. A line that
  happens to hold a single plank has no end either.

Nails are only placed at plank ends. Knots bend the grain around them. Horizontal planks
are rendered like vertical ones, transposed: the lighting still comes from the top-left.

## Moss on planks

Anchor moss to \`planks\` to hang it under the plank ends, one patch as wide as a plank
(25% for 4 lines), with fewer vines, as a narrow moss patch keeps its vine count:

\`\`\`json
{
  "patch": { "template": "moss", "vines": { "count": 3, "length": [2, 10] } },
  "anchor": { "to": "wall", "at": "planks", "ratio": 0.6 },
  "width": 25,
  "height": 25
}
\`\`\`

Planks running across the whole patch have no end, and no \`planks\` anchor: anchor to
\`lines\` to hang moss from the top of the columns, or from each row of horizontal planks
(with \`"width": 100\`). See [\`examples/plank-variants\`](../../examples/plank-variants).`,
    opening: `## Usage

\`opening\` is an overlay placed over a wall: the whole patch is the opening, placed and
sized like any patch, or anchored, on a \`panel\` slab for instance. It draws:

- **reveals**, the inner faces of the cut, \`depth\` pixels wide: the wall below, darkened
  or lightened (\`reveals.*\`, from -1 to 1), so that they are made of the wall's own
  material. With the light coming from the top-left, the top and left reveals are in
  shadow, the right and bottom ones lit;
- a **back**, depending on \`back.mode\`: \`cut\` erases the wall, leaving the texture
  transparent there (the PNG keeps its alpha, like the masked textures of Doom);
  \`shade\` darkens the wall for a shallow niche; \`color\` fills it with an opaque color.

\`open\` lists the sides without a reveal, where the opening runs to the edge of the patch:
\`["bottom"]\` for a doorway or an arch reaching the floor.

\`arch.shape\` closes the top with an arch: \`round\`, a semicircle, or an ellipse when
\`arch.rise\` is not 0.5; \`pointed\`, a gothic arch of two arcs meeting at an apex. The
reveals follow the curve, their shading turning from the top reveal to the side ones.
Under an arch, \`corners\` holds the bottom corners only, and \`spring\` marks the left end
of the springing line, where the arch starts: anchor rectangular overlays, such as
[\`bars\`](bars.md) or a [\`window\`](window.md), on it to fill the opening below the
arch.

Patches drawn afterwards fill the hole: windows, bars, fences... Anchor them to
\`opening\` (top-left of the back) or \`openingCenter\`. The \`corners\` of the back are
corner points: with \`"mirror": true\`, a [\`cobweb\`](cobweb.md) anchored on them grows
into each corner, see [Anchors](../texture-files.md#anchors):

\`\`\`json
{
  "size": [64, 128],
  "patches": [
    { "id": "wall", "patch": { "template": "bricks", "size": [64, 128], "rows": { "count": 16 } } },
    {
      "id": "door",
      "patch": { "template": "opening", "depth": 5, "open": ["bottom"] },
      "x": 18.75,
      "y": 25,
      "width": 62.5,
      "height": 75
    },
    {
      "patch": "./patches/bars.json",
      "anchor": { "to": "door", "at": "opening" }
    }
  ]
}
\`\`\``,
    parchment: `## Usage

\`parchment\` is an overlay: a sheet pinned on a wall, placed and sized like any patch, or
anchored, on a \`panel\` slab for instance. The whole patch is the sheet and its shadow:
\`shadow.offset\` pixels are kept at the bottom and on the right for the shadow cast on the
wall, the light coming from the top-left.

The sheet is blank at \`"age": 0\`; as it ages, it yellows, gets foxing spots, darker
edges and a torn outline. \`folds\` adds the creases of a folded sheet, \`pins\` the pins
holding it.

It leaves room for decals, placed with its anchors: \`sheet\`, the top-left corner of the
writing area, inside the \`margin\`, and \`sheetCenter\`:

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "id": "wall", "patch": { "template": "panel" }, "width": 100, "height": 100 },
    {
      "id": "notice",
      "patch": { "template": "parchment", "size": [24, 20], "age": 0.6 },
      "anchor": { "to": "wall", "at": "panelCenter", "offset": [-12, -10] },
      "width": 37.5,
      "height": 31.25
    },
    { "patch": "./patches/decal.json", "anchor": { "to": "notice", "at": "sheet" } }
  ]
}
\`\`\``,
    banner: `## Usage

\`banner\` is an overlay: a banner of fabric hanging from a rod, placed a few percent from
the top of a wall, and hanging down to its own height. The whole patch is the banner, its
rod and its shadow:

\`\`\`json
{
  "size": [64, 128],
  "patches": [
    { "patch": { "template": "ashlar", "size": [64, 128], "rows": { "count": 8 } } },
    {
      "id": "banner",
      "patch": {
        "template": "banner",
        "shape": { "base": "swallowtail", "depth": 0.3 },
        "fabric": { "color": "#b01818" },
        "border": { "stripes": [{ "color": "#e8c34a", "width": 1 }, { "color": "#2a1a0a", "width": 1 }] }
      },
      "x": 31.25,
      "y": 3,
      "width": 37.5,
      "height": 43.75
    }
  ]
}
\`\`\`

- \`shape.base\` shapes the lower end: \`flat\`, \`point\` (a triangle), \`swallowtail\` (forked,
  like the oriflamme) or \`tails\` (\`shape.tails\` points, like a gonfalon);
  \`shape.depth\` is its height, in fraction of the banner height.
- \`border.stripes\` lists the stripes along the sides and the lower end, from the edge
  inwards; they follow the intact outline, so that tears cut through them.
- \`pattern\` weaves a pattern into the field, and \`fringe\` hangs a fringe from a flat
  lower end: see [\`tapestry\`](tapestry.md), a banner with other defaults.
- As it ages, the fabric fades, gets stains, rips (notches torn into its edges), a frayed
  outline and moth holes, through which the wall shows.
- The \`emblem\` anchor, at the center of the field, and \`field\`, its top-left corner
  inside the border, leave room for a coat of arms.`,
    tapestry: `## Usage

\`tapestry\` is a [\`banner\`](banner.md) with the defaults of a tapestry: wide, flat,
patterned and fringed. Every banner parameter applies, and it ages the same way.

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    { "patch": { "template": "tapestry" }, "x": 6, "y": 8, "width": 88, "height": 62.5 }
  ]
}
\`\`\`

- \`pattern.kind\` weaves the field: \`lozenge\`, a lattice of diamonds dotted in their
  middle; \`checky\`, a checkerboard; \`semy\`, small crosses strewn on a staggered grid;
  \`stripes\`, vertical bands; \`none\`. \`pattern.colors\` are its two colors, and
  \`pattern.period\` the size of one repeat, which scales with the tapestry.
- \`fringe\` threads hang every other pixel from the flat lower end, where the fabric above
  is whole; \`border.stripes\` frame the field, the first one giving the fringe its color.`,
    metal: `## Plates, rivets and panel

\`metal\` lays plates like the stone walls lay stones: \`rows\` and \`blocks\` work the same
way, with a stack bond by default (\`blocks.bond\`: \`stack\`, \`running\` or \`random\`), and
thin seams (\`seam.size\`). Each plate has a soft sheen, lighter towards the top-left, and
brushed horizontal streaks.

Rivets are placed along the edges of every plate, every \`rivets.spacing\` pixels, and at
its corners. Like the other walls, \`metal\` has a \`panel\`: a larger plate, with its own
rivets, reported by the \`panel\` and \`panelCenter\` anchors.

As it ages, rust grows from the seams (\`rust.coverage\`) and runs down from rivets
(\`rust.streaks\`), the plates get dents, shaded against the light, and scratches, and the
metal dulls (\`tarnish\`). \`rust.palette\` sets the rust colors, \`metal.palette\` the metal
ones: a bronze or copper palette works too.`,
    door: `## Kinds, materials and fittings

A door fills its whole texture, and is always opaque.

- \`kind\`: \`single\`, one leaf opening from its \`hinge\` side (\`left\` or \`right\`);
  \`double\`, two leaves opening left and right; \`lift\`, a door going up into the
  ceiling like in Doom: horizontal planks, bands across, no handle.
- \`material\`: \`wood\`, drawn with the [\`planks\`](planks.md) engine, or \`metal\`, full
  metal plates drawn with the [\`metal\`](metal.md) engine.
- \`style\`, for wood: \`rough\`, irregular planks with wide gaps; \`solid\`, tight planks
  running the whole height; \`fancy\`, a frame with \`panels.columns\` × \`panels.rows\` raised
  panels on each leaf.
- \`bands\`: iron bands reinforcing the leaves. They start from the hinge side as strap
  hinges with a pointed end, \`bands.length\` of the leaf wide, with the knuckle of the
  hinge on the hinge edge; \`"length": 1\` runs them across the leaf, \`"count": 0\` removes
  them. They are nailed, and rust with age.
- \`handle\`: a \`ring\` pull or a vertical \`bar\` on the opening side, near the middle of a
  double door, with a \`keyhole\` below it.

\`\`\`json
{ "template": "door", "kind": "double", "style": "fancy", "panels": { "rows": 4 }, "bands": { "count": 0 } }
\`\`\``,
    column: `## Usage

\`column\` is an overlay: a marble column, the whole patch being the column, capital and
base included, casting a shadow on the wall behind. Place it like a
[\`beam\`](beam.md), usually in pairs framing a doorway or an alcove, under an
[\`entablature\`](entablature.md):

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    { "patch": { "template": "column", "order": "ionic" }, "x": 6, "width": 25, "height": 100 },
    { "patch": { "template": "column", "order": "ionic" }, "x": 69, "width": 25, "height": 100 }
  ]
}
\`\`\`

- \`order\` sets the capital: \`doric\`, a flared echinus under a square slab; \`ionic\`, a
  thin slab over two volutes; \`tuscan\`, a plain collar. \`shaft.flutes\` grooves the
  shaft, 0 for a plain one, and \`shaft.taper\` narrows it towards its top.
- The marble is veined (\`marble.veins\`, \`marble.contrast\`), and the shaft is lit from
  the left like a cylinder.
- Its shadow offset, like the chain's, is expressed at own size and scales with the column.
- As it ages, grime rises from its foot, its edges chip, and it may be broken: its capital
  gone, its shaft ending in a jagged top, for ruins.`,
    entablature: `## Usage

\`entablature\` is an overlay: a horizontal band of marble, the whole patch being the band
and, in its last rows, its shadow on the wall below. Lay it across the top of a wall, or
over a pair of [\`column\`](column.md)s for a portico:

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    { "patch": { "template": "entablature" }, "y": 6, "width": 100, "height": 25 },
    { "patch": { "template": "column" }, "x": 6, "y": 31, "width": 22, "height": 69 },
    { "patch": { "template": "column" }, "x": 72, "y": 31, "width": 22, "height": 69 }
  ]
}
\`\`\`

- From top to bottom: a cornice, lit on its top, over a soffit in deep shadow and a row
  of \`dentils\`; the frieze; the architrave, in steps. \`layers\` sets their shares of
  the height.
- \`frieze.pattern\` carves the frieze: \`meander\`, Greek-key hooks running on a
  baseline; \`triglyph\`, grooved blocks between metopes carrying a rosette; \`plain\`.
  The motifs, \`frieze.period\` long, fill the width exactly, so that the band tiles
  horizontally: placed across a whole texture, it runs on from one tile to the next.
- As it ages, grime gathers under the cornice, its edges chip, and a chunk may have
  broken away from its bottom edge (\`broken\`).`,
    shield: `## Usage

\`shield\` is an overlay: a heraldic shield hung on a wall, the whole patch being the
shield, the swords crossed behind it if any, and its shadow.

\`\`\`json
{
  "size": [48, 48],
  "patches": [
    { "patch": { "template": "ashlar", "size": [48, 48], "rows": { "count": 3 } } },
    {
      "patch": {
        "template": "shield",
        "size": [32, 40],
        "swords": true,
        "field": { "division": "pale" },
        "charge": { "ordinary": "saltire" }
      },
      "x": 16.7, "y": 8.3, "width": 66.7, "height": 83.3
    }
  ]
}
\`\`\`

- \`shape\`: \`heater\`, a flat top and sides curving to a point; \`round\`, a disc, whatever
  the box; \`kite\`, a rounded top over a long point.
- \`field.division\` splits the field between its two \`tinctures\`: \`pale\` (left and
  right), \`fess\` (top and bottom), \`bend\` (along a diagonal) or \`quarterly\`.
  \`charge.ordinary\` paints a band over it in \`charge.color\`: \`cross\`, \`saltire\`,
  \`chevron\`, \`bend\`, \`fess\` or \`pale\`.
- A metal rim runs around it, \`boss\` adds a round boss in its middle, and \`swords\`
  crosses two swords behind it, points up: the shield then shrinks to leave them room.
- As it ages, its paint fades and flakes off down to the wood, and it gets dented.`,
    chain: `## Usage

\`chain\` is an overlay: one iron chain, hanging from a plate bolted to the wall at the
top of the patch, centered. Place one patch per chain, with its own seed, wherever the
chains hang:

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    { "patch": { "template": "chain" }, "x": 20, "y": 8, "width": 18.75, "height": 75, "seed": 1 },
    { "patch": { "template": "chain" }, "x": 60, "y": 8, "width": 18.75, "height": 75, "seed": 2 }
  ]
}
\`\`\`

- The chain drops a random share of the height below its plate, within \`length\`: its
  links, \`link.width\` by \`link.length\` pixels, are alternately seen face on, open in
  their middle, and edge on.
- \`cuff\` is the chance that it ends with a manacle, twice as wide as a link.
- It casts a shadow on the wall. As it ages, it rusts and tarnishes, and may have snapped
  (\`broken\`): shorter, ending with an open link, its manacle lost.
- The \`fixture\` anchor is the center of the plate, \`end\` the bottom of the chain.`,
    bookshelf: `## Usage

\`bookshelf\` is a wooden bookcase filling the patch, but for a transparent \`margin\`
showing the wall below: place it over a wall, at full size.

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    { "patch": { "template": "bookshelf", "books": { "fill": 0.7 } }, "width": 100, "height": 100 }
  ]
}
\`\`\`

- The case, \`frame\` pixels wide, holds \`shelves.count\` shelves, and
  \`columns.count\` compartments side by side. Its back panel is in the shadow of the
  boards above and of the side on the left, the light coming from the top-left.
- Books stand on the shelves, spines of \`books.width\` and heights of \`books.height\`,
  tinted with \`books.colors\`, some with gilt bands. \`books.fill\` sets how many: 0 for
  none, 1 for no space left. Books go missing in runs, as on a real shelf, and raising the
  fill only adds books, so that it can be tuned without the others moving. A book standing
  next to a gap leans into it (\`books.lean\`).
- As it ages, the wood weathers, the books fade, and dust settles on the shelves and the
  tops of the books.
- \`compartments\` anchors the top-left corner of each compartment, \`corners\` its corners,
  as corner points: a [\`cobweb\`](cobweb.md) anchored on them with \`mirror\` grows in the
  corners of the shelves.`,
    window: `## Usage

\`window\` is an overlay: a glazed window, the whole patch being the window and its frame.
Lay it over an [\`opening\`](opening.md), anchored on the back of the opening, like
[\`bars\`](bars.md):

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    {
      "id": "hole",
      "patch": { "template": "opening", "depth": 3 },
      "x": 25, "y": 18.75, "width": 50, "height": 56.25
    },
    {
      "patch": { "template": "window", "size": [26, 30] },
      "anchor": { "to": "hole", "at": "opening" },
      "width": 40.6, "height": 46.9
    }
  ]
}
\`\`\`

- The frame, \`frame.width\` pixels around the window and \`frame.bars\` between the panes,
  is \`wood\` or \`metal\`: its stiles run the whole height, its rails and transoms cross
  between them, the grain following each member, and its edges are lit from the top-left.
  \`panes.columns\` × \`panes.rows\` panes fill it, 2 × 2 by default.
- The glass is translucent: \`glass.alpha\`, 15% by default, crossed by
  \`glass.streaks.count\` bright reflections per pane, blurred diagonal streaks at 35%.
  Over a cut-out opening, whose back is transparent, the glass stays translucent pixels in
  the texture, showing what the engine draws behind it; the images of this page use an
  opening with a dark back instead, so that the glass shows.
- As it ages, a wooden frame weathers silver-grey and a metal one rusts, streaks running
  down from the joints; the glass gets dirty, more opaque and brownish towards the corners
  of the panes; panes crack (\`cracked\`), or break (\`broken\`): their glass is gone but
  for jagged shards along the frame.
- \`panes\` anchors the top-left corner of each pane, \`corners\` the corners of each pane,
  as corner points: a [\`cobweb\`](cobweb.md) anchored on them with \`mirror\` grows in the
  corners of the panes.`,
    cobweb: `## Usage

\`cobweb\` is an overlay: a spider web radiating from the top-left corner of the patch,
transparent elsewhere. Anchor it on the \`corners\` of an [\`opening\`](opening.md), with
\`mirror\`, so that one placement fills any corner, each web growing into its own:

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    {
      "id": "window",
      "patch": { "template": "opening", "depth": 3 },
      "x": 18.75, "y": 18.75, "width": 62.5, "height": 62.5
    },
    {
      "patch": { "template": "cobweb", "age": 0.6 },
      "anchor": { "to": "window", "at": "corners", "ratio": 0.75, "mirror": true },
      "width": 25, "height": 25
    }
  ]
}
\`\`\`

\`only: [0, 1]\` keeps the two top corners, \`ratio\` a random share of them.

- \`spokes.count\` threads radiate from the corner, between the two walls, and
  \`rings.count\` threads run around it, from wall to wall, sagging towards the corner
  between two spokes (\`rings.sag\`). Threads are one pixel thick at any size: a larger web
  has more room between its threads.
- The threads are opaque by default, so that they stay crisp over a cut-out opening, whose
  back is transparent; a \`thread.alpha\` below 1 makes them translucent pixels.
- As it ages, the web tears (\`torn\`: threads missing, spokes stopping short) and gathers
  \`dust\`: greyer threads, and a matted sheet filling the apex.`,
    bars: `## Usage

\`bars\` is an overlay: vertical metal bars held by horizontal rails, the whole patch being
the barred area. Lay it over an [\`opening\`](opening.md), anchored on the back of the
opening, for a prison window or a grate:

\`\`\`json
{
  "size": [64, 64],
  "patches": [
    { "patch": { "template": "ashlar" }, "width": 100, "height": 100 },
    {
      "id": "hole",
      "patch": { "template": "opening", "depth": 3 },
      "x": 25, "y": 18.75, "width": 50, "height": 56.25
    },
    {
      "patch": { "template": "bars", "size": [26, 30], "bars": { "count": 4 } },
      "anchor": { "to": "hole", "at": "opening" },
      "width": 40.6, "height": 46.9
    }
  ]
}
\`\`\`

- The bars run from the top to the bottom of the patch, \`bars.count\` of them evenly
  spaced, so that the patch tiles horizontally: placed across a whole texture, it makes a
  fence or a masked texture of bars. \`bars.profile\` draws \`round\` rods or \`square\` bars.
- \`rails.count\` flat rails cross them, evenly spaced, with a rivet at each crossing.
- The opening cuts the wall out, so the space between the bars is transparent (alpha 0),
  like the masked textures Doom uses for bars and fences. Over an opening whose back is
  shaded or colored instead, give the bars a shadow on it with \`shadow.offset\`: they
  cast none by default, since a cut-out back has nothing to cast it on.
- As they age, the bars rust, rust streaks running down from the crossings, get tarnish and
  dents, bulge sideways between two rails (\`bends\`), and break (\`broken\`): a part of a
  bar is missing between two rails, its jagged ends rusting first, or the bar is gone down
  to the top or the bottom of the patch. Rails never break.`,
    beam: `## Usage

\`beam\` is an overlay: a metal support beam laid over a wall, the whole patch being the
beam and its shadow. Several beams frame an alcove, a door or a panel, or reinforce a
plank wall:

\`\`\`json
{
  "size": [64, 128],
  "patches": [
    { "patch": { "template": "bricks", "size": [64, 128], "rows": { "count": 16 } } },
    {
      "patch": { "template": "opening", "back": { "mode": "shade" }, "open": ["bottom"] },
      "x": 25, "y": 31.25, "width": 50, "height": 68.75
    },
    {
      "patch": { "template": "beam", "direction": "vertical", "size": [9, 96] },
      "x": 14, "y": 25, "width": 14.06, "height": 75
    },
    {
      "patch": { "template": "beam", "direction": "vertical", "size": [9, 96] },
      "x": 72, "y": 25, "width": 14.06, "height": 75
    },
    {
      "patch": { "template": "beam", "size": [64, 10] },
      "x": 12.5, "y": 23.4, "width": 76, "height": 7.8
    }
  ]
}
\`\`\`

- \`direction\`: a vertical beam is a horizontal one transposed, so that its lighting stays
  top-left; give it a \`[thickness, length]\` size.
- \`profile\`: \`girder\`, an I-beam seen from the front, with lit flanges along its edges
  (\`flange\` pixels thick) and a recessed web in their shadow; \`flat\`, a flat strap.
- Rivets run along each flange of a girder, or along the middle of a strap, every
  \`rivets.spacing\` pixels. As it ages, the beam rusts, its rivets bleed rust streaks
  running down, whatever its direction, and it gets scratches and tarnish.`,
    fieldstone: `## Voronoi stones

\`fieldstone\` lays natural stones of irregular shapes: the cells of a Voronoi diagram, from
the \`Voronoi\` class of [@laboralphy/algorithms](https://www.npmjs.com/package/@laboralphy/algorithms).

- \`stones.cells\` sets the number of stones across the patch, \`[columns, rows]\`: their
  centers lie on a jittered grid. \`stones.jitter\` moves them inside their grid cell: 0
  gives a regular grid, 1 the most irregular stones. \`stones.stagger\` shifts every other
  row: with no jitter, a stagger of 0.5 gives hexagons.
- The diagram is computed on a torus, its distances wrapping around the patch: stones
  crossing an edge continue on the opposite one, and the texture tiles seamlessly.
- The mortar follows the exact perpendicular distance to the cell borders, so that the
  joints have a constant width.

Everything else is the engine of the other walls: the stone surface, the bevel lit from
the top-left, cracks, worn edges, spalling, stains, hollowed joints, \`age\`, and the panel.
Chips and rounded corners, which need the corners of rectangular stones, do not apply.

\`moss.coverage\` grows moss along the top edges of the stones, following their shape,
with vines hanging down their faces: see [Moss on stone walls](../concepts.md#moss-on-stone-walls).

The \`stones\` anchor reports the top-left corner of the bounding box of each stone face,
\`centers\` the center of each stone, and \`tops\` the top edge of each stone, straight
above its center. See [\`examples/fieldstone-variants\`](../../examples/fieldstone-variants).`,
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
    const derivable = isAging(generator);
    const anchors = Object.entries(generator.anchors ?? {});
    return [
        `<!-- generated by "npm run docs" from the template schema: do not edit -->`,
        `# \`${generator.name}\``,
        `${capitalize(generator.description)}.${generator.overlay ? ' This template is an **overlay**: transparent by design, meant to be laid over another patch.' : ''}`,
        `![${generator.name}](../images/${generator.name}.png)`,
        `Category: [${CATALOG[generator.category].title.toLowerCase()}](../catalog.md#${CATALOG[generator.category].title.toLowerCase()}).`,
        `Own size: ${generator.defaults.size.join(' × ')} pixels. Parameters marked **layout** are expressed at this size and scale with the patch; **detail** parameters are real pixels and never scale. See [Layout and detail](../concepts.md#layout-and-detail).`,
        `## Parameters`,
        parameterSections(generator, derivable),
        anchors.length
            ? `## Anchors\n\n| Anchor | Points |\n| --- | --- |\n${anchors
                  .map(([name, description]) => `| \`${name}\` | ${cell(description)} |`)
                  .join('\n')}`
            : '',
        EXTRA[generator.name] ?? '',
        isAging(generator) ? agingSection(generator) : '',
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

/** the sections of the catalog, in order, and what they gather */
const CATALOG: Record<Category, { title: string; text: string; ideas: string[] }> = {
    natural: {
        title: 'Natural',
        text: 'What grows, spreads and settles on walls left alone.',
        ideas: [
            'ivy and creepers',
            'roots breaking through',
            'mushrooms',
            'lichen patches',
            'water seeping down',
            'icicles',
        ],
    },
    civilized: {
        title: 'Civilized',
        text: 'Signs of people living there: furniture, decorations, openings to the outside.',
        ideas: [
            'paintings and portraits',
            'candles and candelabra',
            'weapon racks',
            'statues in niches',
            'amphorae',
            'notice boards',
            'stained glass',
        ],
    },
    dungeon: {
        title: 'Dungeon',
        text: 'Prisons, cellars and torture chambers.',
        ideas: [
            'shackles on a short bar',
            'skulls and bones',
            'blood stains',
            'sewer grates',
            'tally marks scratched in the stone',
        ],
    },
    architecture: {
        title: 'Architecture',
        text: 'Pieces of the building itself, cut into or laid over any wall, whatever the ambiance.',
        ideas: [
            'keystones and voussoirs around arches',
            'pilasters',
            'pediments',
            'pipes',
            'vent grilles',
        ],
    },
    surface: {
        title: 'Surfaces',
        text: 'Base textures, the walls every decoration above is laid over. They suit any ambiance: their palette, their age and their moss make them a castle, a cellar or a ruin.',
        ideas: [
            'cobblestone floors',
            'plaster over stone',
            'wattle and daub',
            'marble slabs',
            'mosaics',
        ],
    },
};

/** order of the catalog: decorations first, then the surfaces they are laid over */
const CATALOG_ORDER: Category[] = ['natural', 'civilized', 'dungeon', 'architecture', 'surface'];

/** examples listed for a template in the catalog, the others counted */
const CATALOG_EXAMPLES = 6;

/**
 * Example textures using each template, as paths from the repository root; a template
 * used through a patch file, or its \`extends\` chain, counts too.
 */
function examplesByTemplate(dir = 'examples'): Map<string, string[]> {
    const files = (d: string): string[] =>
        readdirSync(d, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory()
                ? entry.name === 'patches'
                    ? []
                    : files(join(d, entry.name))
                : entry.name.endsWith('.json')
                  ? [join(d, entry.name)]
                  : [],
        );
    const loader = createNodeLoader();
    const found = new Map<string, string[]>();
    for (const file of files(dir).sort()) {
        const texture = loader.read(loader.resolve(undefined, file)) as {
            patches: { patch: string | object }[];
        };
        const templates = new Set(
            texture.patches.map(
                ({ patch }) =>
                    loadPatch(patch as string, loader, loader.resolve(undefined, file)).template,
            ),
        );
        for (const template of templates) {
            found.set(template, [...(found.get(template) ?? []), file]);
        }
    }
    return found;
}

function catalogPage(): string {
    const examples = examplesByTemplate();
    const link = (file: string) =>
        `[${relative('examples', file).replace(/\.json$/, '')}](../${file})`;
    const section = (category: Category) => {
        const { title, text, ideas } = CATALOG[category];
        const templates = Object.values(generators).filter((g) => g.category === category);
        const rows = templates.map((g) => {
            const used = examples.get(g.name) ?? [];
            const listed = used.slice(0, CATALOG_EXAMPLES).map(link).join(', ');
            const more =
                used.length > CATALOG_EXAMPLES
                    ? `, and ${used.length - CATALOG_EXAMPLES} more`
                    : '';
            return `| [\`${g.name}\`](templates/${g.name}.md) | <img src="images/${g.name}.png" width="96" alt="${g.name}"> | ${cell(capitalize(g.description))} | ${listed ? listed + more : '—'} |`;
        });
        return [
            `## ${title}`,
            text,
            rows.length
                ? `| Template | Preview | Description | Example textures |\n| --- | --- | --- | --- |\n${rows.join('\n')}`
                : '_No template yet._',
            `**Ideas, not made yet:** ${ideas.join(', ')}.`,
        ].join('\n\n');
    };
    return [
        `<!-- generated by "npm run docs" from the template categories: do not edit -->`,
        `# Catalog`,
        `Every template, by category, with the example textures using it, and ideas of patches still to make. Decorations come first, grouped by the ambiance they belong to; the surfaces they are laid over come last, as they suit any ambiance.`,
        CATALOG_ORDER.map(
            (category) =>
                `- [${CATALOG[category].title}](#${CATALOG[category].title.toLowerCase()})`,
        ).join('\n'),
        ...CATALOG_ORDER.map(section),
    ].join('\n\n');
}

function templatesIndex(): string {
    return [
        `<!-- generated by "npm run docs" from the template schemas: do not edit -->`,
        `# Templates`,
        `A template is a generator: a patch file names it in \`template\` and sets its parameters.`,
        `Templates are grouped by category in the [catalog](../catalog.md).`,
        `| Template | Category | Description | Own size | Overlay | Anchors |\n| --- | --- | --- | --- | --- | --- |\n${Object.values(
            generators,
        )
            .map(
                (g) =>
                    `| [\`${g.name}\`](${g.name}.md) | [${g.category}](../catalog.md#${CATALOG[g.category].title.toLowerCase()}) | ${g.description} | ${g.defaults.size.join(' × ')} | ${g.overlay ? 'yes' : 'no'} | ${
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
        'documentation/catalog.md': catalogPage(),
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
