import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { color, DETAIL, palette, ratio, size } from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { defineGenerator } from './define';
import { metal } from './metal';
import { planks } from './planks';

/**
 * Parameters of the door template. A door fills its whole patch, opaque.
 */
export const doorSchema = z.strictObject({
    size: size().default([64, 128]).describe('own size of the door, in pixels'),
    kind: z
        .enum(['single', 'double', 'lift'])
        .default('single')
        .describe(
            'single: one leaf; double: two leaves opening left and right; lift: a door going up into the ceiling, like in Doom',
        ),
    hinge: z
        .enum(['left', 'right'])
        .default('left')
        .describe('hinge side of a single door; its handle is on the other side'),
    material: z.enum(['wood', 'metal']).default('wood').describe('wood, or full metal plates'),
    style: z
        .enum(['rough', 'solid', 'fancy'])
        .default('solid')
        .describe(
            'wood only: rough, irregular planks; solid, tight planks running the whole height; fancy, a frame with raised panels',
        ),
    panels: z
        .strictObject({
            columns: z.number().int().min(1).default(1).describe('columns of raised panels'),
            rows: z.number().int().min(1).default(3).describe('rows of raised panels'),
        })
        .prefault({})
        .describe('raised panels of each leaf, in the fancy style'),
    wood: z
        .strictObject({
            palette: palette()
                .default(['#3a2412', '#5e3b1f', '#7d5230', '#9c6b40'])
                .describe('wood colors, from darkest to lightest'),
        })
        .prefault({})
        .describe('wood of wooden doors'),
    metal: z
        .strictObject({
            palette: palette()
                .default(['#2b2f33', '#474d53', '#687077', '#8f979e'])
                .describe('metal colors, from darkest to lightest'),
        })
        .prefault({})
        .describe('metal of the plates of metal doors, and of the iron fittings'),
    bands: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(2)
                .describe('number of iron bands across each leaf; 0 for none'),
            width: z
                .number()
                .int()
                .min(1)
                .default(4)
                .describe('band width, in pixels')
                .meta(DETAIL),
            length: ratio()
                .default(0.8)
                .describe(
                    'length of the bands from the hinge side, in fraction of the leaf width: strap hinges with a pointed end; 1 runs across the leaf',
                ),
            nails: z.boolean().default(true).describe('nails along the bands'),
        })
        .prefault({})
        .describe('iron bands reinforcing the door, rusting with age'),
    handle: z
        .strictObject({
            kind: z
                .enum(['ring', 'bar', 'none'])
                .default('ring')
                .describe('ring pull, vertical bar, or none; lift doors have none'),
            keyhole: z.boolean().default(true).describe('a keyhole below the handle'),
            color: color().default('#2a2622').describe('color of the handle'),
        })
        .prefault({})
        .describe('handle, on the opening side'),
    age: ratio()
        .default(0.3)
        .describe(
            'overall weathering, from 0 (new) to 1 (ruined): passed to the wood or the metal, and rusting the iron',
        ),
});

export type DoorParams = z.output<typeof doorSchema>;

/** a leaf of the door, in pixels; its hinges are on its hinge side */
type Leaf = { x: number; w: number; hinge: 'left' | 'right' | 'none' };

// each random decision draws from its own sequence
const SALT_LEAF = 1;
const SALT_RUST = 2;

const RUST = createGradient(['#3a1c0c', '#6b3314', '#9a4e1e', '#bf6e2e']);

/**
 * Surface of a leaf: planks or metal plates, laid out at the leaf's size.
 */
function leafSurface(p: DoorParams, w: number, h: number, seed: number): Texture {
    if (p.material === 'metal') {
        return metal.generate({
            seed,
            size: [w, h],
            rows: { count: Math.max(1, Math.round(h / 32)) },
            blocks: { width: [w, w], bond: 'stack' },
            metal: { palette: p.metal.palette },
            age: p.age,
        });
    }
    const lift = p.kind === 'lift';
    // planks about 14 pixels wide; rough doors get irregular, pieced planks
    const across = lift ? h : w;
    const rough = p.style === 'rough';
    return planks.generate({
        seed,
        size: [w, h],
        direction: lift ? 'horizontal' : 'vertical',
        lines: {
            count: Math.max(2, Math.round(across / (rough ? 18 : 14))),
            widthVariation: rough ? 0.3 : 0.05,
        },
        planks: { length: rough ? [0.5, 1] : [1, 1] },
        wood: { palette: p.wood.palette },
        knots: { ratio: rough ? 0.5 : 0.25 },
        gap: { size: rough ? 2 : 1 },
        nails: { ratio: 0 },
        age: rough ? Math.min(1, p.age + 0.25) : p.age,
    });
}

/**
 * Raised panels of a fancy leaf: a groove around each panel, and a bevel lit from the
 * top-left, over the wood.
 */
function raisePanels(texture: Texture, leaf: Leaf, p: DoorParams, height: number): void {
    const stile = Math.max(3, Math.round(leaf.w * 0.14));
    const { columns, rows } = p.panels;
    const innerW = leaf.w - 2 * stile;
    const innerH = height - 2 * stile;
    const cellW = (innerW - (columns - 1) * stile) / columns;
    const cellH = (innerH - (rows - 1) * stile) / rows;
    if (cellW < 4 || cellH < 4) {
        return;
    }
    for (let c = 0; c < columns; ++c) {
        for (let r = 0; r < rows; ++r) {
            const x0 = Math.round(leaf.x + stile + c * (cellW + stile));
            const y0 = Math.round(stile + r * (cellH + stile));
            const x1 = Math.round(leaf.x + stile + c * (cellW + stile) + cellW);
            const y1 = Math.round(stile + r * (cellH + stile) + cellH);
            for (let y = y0; y < y1; ++y) {
                for (let x = x0; x < x1; ++x) {
                    const d = Math.min(x - x0, y - y0, x1 - 1 - x, y1 - 1 - y);
                    let f = 1.06;
                    if (d === 0) {
                        // the groove around the panel
                        f = 0.5;
                    } else if (d <= 2) {
                        const topLeft = Math.min(x - x0, y - y0) === d;
                        f = topLeft ? 1.25 : 0.75;
                    }
                    texture.setPixel(x, y, shade(texture.getPixel(x, y), f));
                }
            }
        }
    }
}

/**
 * The edges of a leaf: a dark gap, and a bevel lit from the top-left.
 */
function leafEdges(texture: Texture, leaf: Leaf, height: number): void {
    for (let y = 0; y < height; ++y) {
        for (let x = leaf.x; x < leaf.x + leaf.w; ++x) {
            const lx = x - leaf.x;
            const d = Math.min(lx, y, leaf.w - 1 - lx, height - 1 - y);
            if (d === 0) {
                texture.setPixel(x, y, shade(texture.getPixel(x, y), 0.4));
            } else if (d === 1) {
                const topLeft = Math.min(lx, y) === 1;
                texture.setPixel(x, y, shade(texture.getPixel(x, y), topLeft ? 1.2 : 0.8));
            }
        }
    }
}

/**
 * Iron color of a fitting: lit on its top rows, rusted with age.
 */
function iron(
    ironPalette: number[],
    tone: number,
    age: number,
    seed: number,
    x: number,
    y: number,
): number {
    const base = sample(ironPalette, tone);
    // rust spreads slowly, then fast: 5% of the iron at the default age, 60% when ruined
    if (hash(seed, SALT_RUST, x, y) < age * age * 0.6) {
        return sample(RUST, hash(seed, SALT_RUST, x, y, 1));
    }
    return base;
}

/**
 * Iron bands across the leaves: strap hinges from the hinge side with a pointed end, or
 * across the whole leaf; nailed, with the knuckle of the hinge on the hinge edge.
 */
function drawBands(
    texture: Texture,
    leaves: Leaf[],
    p: DoorParams,
    height: number,
    seed: number,
    ironPalette: number[],
): void {
    const { count, width: bandWidth, length } = p.bands;
    for (let b = 0; b < count; ++b) {
        const center = (height * (b + 1)) / (count + 1);
        const y0 = Math.round(center - bandWidth / 2);
        for (const leaf of leaves) {
            const full = leaf.hinge === 'none' || length >= 1;
            const span = full ? leaf.w : Math.max(bandWidth, Math.round(leaf.w * length));
            const fromLeft = leaf.hinge !== 'right';
            for (let k = 0; k < span; ++k) {
                const x = fromLeft ? leaf.x + k : leaf.x + leaf.w - 1 - k;
                // pointed end: the band narrows over its last pixels
                const toEnd = span - 1 - k;
                const half = full ? bandWidth / 2 : Math.min(bandWidth / 2, (toEnd + 1) / 2);
                for (let j = 0; j < bandWidth; ++j) {
                    const offset = Math.abs(j + 0.5 - bandWidth / 2);
                    if (offset > half) {
                        continue;
                    }
                    // lit on its top row, dark on its bottom row
                    const tone = j === 0 ? 0.85 : j === bandWidth - 1 ? 0.15 : 0.45;
                    texture.setPixel(x, y0 + j, iron(ironPalette, tone, p.age, seed, x, y0 + j));
                }
                // nails along the middle of the band
                if (p.bands.nails && k % 6 === 3 && toEnd > 3 && bandWidth >= 3) {
                    const ny = y0 + Math.floor(bandWidth / 2) - 1;
                    texture.setPixel(x, ny, sample(ironPalette, 1));
                    texture.setPixel(x + 1, ny + 1, sample(ironPalette, 0));
                }
            }
            // the knuckle of the hinge, on the hinge edge
            if (leaf.hinge !== 'none') {
                const kx = leaf.hinge === 'left' ? leaf.x : leaf.x + leaf.w - 2;
                for (let y = y0 - 1; y < y0 + bandWidth + 1; ++y) {
                    texture.setPixel(kx, y, iron(ironPalette, 0.8, p.age, seed, kx, y));
                    texture.setPixel(kx + 1, y, iron(ironPalette, 0.3, p.age, seed, kx + 1, y));
                }
            }
        }
    }
}

/**
 * A handle: a ring hanging from a plate, or a vertical bar; and a keyhole below it.
 */
function drawHandle(
    texture: Texture,
    p: DoorParams,
    hx: number,
    hy: number,
    keyhole: boolean,
): void {
    const handle = Rainbow.parse(p.handle.color);
    const lit = shade(handle, 2.2);
    const dark = shade(handle, 0.5);
    if (p.handle.kind === 'ring') {
        // the plate
        for (let y = hy - 1; y <= hy + 1; ++y) {
            for (let x = hx - 1; x <= hx + 1; ++x) {
                texture.setPixel(x, y, x + y < hx + hy ? lit : handle);
            }
        }
        // the ring, lit on its top-left
        const cx = hx + 0.5;
        const cy = hy + 4.5;
        for (let y = hy + 1; y <= hy + 8; ++y) {
            for (let x = hx - 3; x <= hx + 4; ++x) {
                const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                if (Math.abs(d - 3) < 0.7) {
                    const topLeft = x + 0.5 - cx + (y + 0.5 - cy) < 0;
                    texture.setPixel(x, y, topLeft ? lit : dark);
                }
            }
        }
    } else if (p.handle.kind === 'bar') {
        for (let y = hy - 5; y <= hy + 5; ++y) {
            texture.setPixel(hx, y, lit);
            texture.setPixel(hx + 1, y, dark);
        }
    }
    if (keyhole) {
        const ky = hy + (p.handle.kind === 'ring' ? 11 : 8);
        // an escutcheon plate, and the black keyhole
        for (let y = ky - 1; y <= ky + 4; ++y) {
            for (let x = hx - 1; x <= hx + 2; ++x) {
                texture.setPixel(x, y, x === hx - 1 || y === ky - 1 ? lit : handle);
            }
        }
        texture.setPixel(hx, ky, 0x000000ff);
        texture.setPixel(hx + 1, ky, 0x000000ff);
        texture.setPixel(hx, ky + 1, 0x000000ff);
        texture.setPixel(hx + 1, ky + 1, 0x000000ff);
        texture.setPixel(hx, ky + 2, 0x000000ff);
    }
}

/**
 * A door: single, double or lifting; wooden (rough, solid or fancy) or full metal;
 * reinforced with iron bands, with a handle. Doors are always opaque.
 */
export const door = defineGenerator({
    name: 'door',
    description: 'Door: single, double or lifting; wooden or metal, with iron bands and a handle',
    schema: doorSchema,
    anchors: {
        leaves: 'top-left corner of each leaf',
        handles: 'plate of each handle',
        center: 'center of the door',
    },
    render(p, { width, height, seed }) {
        const texture = new Texture(width, height);
        const half = Math.floor(width / 2);
        const leaves: Leaf[] =
            p.kind === 'double'
                ? [
                      { x: 0, w: half, hinge: 'left' },
                      { x: half, w: width - half, hinge: 'right' },
                  ]
                : [{ x: 0, w: width, hinge: p.kind === 'lift' ? 'none' : p.hinge }];

        leaves.forEach((leaf, k) => {
            const leafSeed = Math.floor(hash(seed, SALT_LEAF, k) * 4294967296);
            texture.draw(leafSurface(p, leaf.w, height, leafSeed), leaf.x, 0);
            if (p.material === 'wood' && p.style === 'fancy') {
                raisePanels(texture, leaf, p, height);
            }
            leafEdges(texture, leaf, height);
        });

        const ironPalette = createGradient(p.metal.palette);
        drawBands(texture, leaves, p, height, seed, ironPalette);

        // handles on the opening side: near the middle of a double door
        const handles: AnchorPoint[] = [];
        if (p.kind !== 'lift' && p.handle.kind !== 'none') {
            const hy = Math.round(height * 0.52);
            for (const leaf of leaves) {
                const opensRight = leaf.hinge === 'left';
                const hx = opensRight
                    ? leaf.x + leaf.w - (p.kind === 'double' ? 6 : 9)
                    : leaf.x + (p.kind === 'double' ? 5 : 8);
                handles.push({ x: hx, y: hy });
            }
            handles.forEach((h, k) =>
                // a double door has a single keyhole, on its right leaf
                drawHandle(
                    texture,
                    p,
                    h.x,
                    h.y,
                    p.handle.keyhole && (p.kind !== 'double' || k === 1),
                ),
            );
        }

        texture.anchors = {
            leaves: leaves.map((leaf) => ({ x: leaf.x, y: 0 })),
            handles,
            center: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
