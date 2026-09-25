/**
 * Generates the reference pages of the documentation from the parameter schemas, so that
 * they never drift from the code. Hand-written pages link to them.
 */
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
    ashlarWear,
    bannerWear,
    beamWear,
    fieldstoneWear,
    type FieldstoneParams,
    type BeamParams,
    type BeamWear,
    metalWear,
    type MetalParams,
    type MetalWear,
    type BannerParams,
    type BannerWear,
    patchDefinitionSchema,
    placementAnchorSchema,
    placementSchema,
    textureDefinitionSchema,
    type AshlarParams,
    type AshlarWear,
    parchmentWear,
    type ParchmentParams,
    type ParchmentWear,
    planksWear,
    type PlanksParams,
    type PlanksWear,
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

type WearRow = [string, (params: object) => number | [number, number]];

/**
 * Parameters derived from age by a template, and how to compute them.
 */
function wearRows(generator: TextureGenerator): WearRow[] {
    if (generator.name === 'fieldstone') {
        return WEAR_PARAMETERS.filter(
            ([path]) => !path.startsWith('chips.') && path !== 'erosion.corners',
        ).map(([path, get]) => [path, (params) => get(fieldstoneWear(params as FieldstoneParams))]);
    }
    if (generator.name === 'beam') {
        return BEAM_WEAR_PARAMETERS.map(([path, get]) => [
            path,
            (params) => get(beamWear(params as BeamParams)),
        ]);
    }
    if (generator.name === 'metal') {
        return METAL_WEAR_PARAMETERS.map(([path, get]) => [
            path,
            (params) => get(metalWear(params as MetalParams)),
        ]);
    }
    if (generator.name === 'banner') {
        return BANNER_WEAR_PARAMETERS.map(([path, get]) => [
            path,
            (params) => get(bannerWear(params as BannerParams)),
        ]);
    }
    if (generator.name === 'parchment') {
        return PARCHMENT_WEAR_PARAMETERS.map(([path, get]) => [
            path,
            (params) => get(parchmentWear(params as ParchmentParams)),
        ]);
    }
    if (generator.name === 'planks') {
        return PLANK_WEAR_PARAMETERS.map(([path, get]) => [
            path,
            (params) => get(planksWear(params as PlanksParams)),
        ]);
    }
    return WEAR_PARAMETERS.map(([path, get]) => [
        path,
        (params) => get(ashlarWear(params as AshlarParams)),
    ]);
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
    ['planks', 'parchment', 'banner', 'metal', 'beam'].includes(name)
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

Patches drawn afterwards fill the hole: windows, bars, fences... Anchor them to
\`opening\` (top-left of the back) or \`openingCenter\`:

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
- As it ages, the fabric fades, gets stains, rips (notches torn into its edges), a frayed
  outline and moth holes, through which the wall shows.
- The \`emblem\` anchor, at the center of the field, and \`field\`, its top-left corner
  inside the border, leave room for a coat of arms.`,
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
