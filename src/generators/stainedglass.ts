import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { color, DETAIL, palette, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { ARCH_RISE, archDistance } from './common/arch';
import { PowerDiagram } from './common/PowerDiagram';
import { defineGenerator } from './define';

/** the colors of stained glass by default: red, yellow, blue and green */
export const STAINED_GLASS_COLORS = ['#b3202a', '#e0b030', '#2a4fb0', '#2f8a3a'];

/**
 * Parameters of the stained glass template. The whole patch is the window: place it over
 * an opening of the same arch, on its `opening` anchor.
 */
export const stainedglassSchema = z.strictObject({
    size: size()
        .default([32, 48])
        .describe('own size of the patch in pixels; layout values are expressed at this size'),
    arch: z
        .strictObject({
            shape: z
                .enum(['flat', 'round', 'pointed'])
                .default('pointed')
                .describe(
                    'top of the window: flat, a rectangle; round, a semicircular or elliptical arch; pointed, a gothic arch of two arcs meeting at its apex',
                ),
            rise: z
                .number()
                .positive()
                .max(2)
                .optional()
                .describe(
                    'height of the arch above its springing line, as a share of the width of the window; 0.5 for round arches, 0.8 for pointed ones by default',
                ),
        })
        .prefault({})
        .describe('arch closing the top of the window'),
    cells: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(1)
                .default(16)
                .describe('number of pieces of glass across the patch'),
            variation: ratio()
                .default(0.3)
                .describe('spread of the sizes of the pieces, in [0, 1]: 0 for pieces alike'),
        })
        .prefault({})
        .describe('pieces of glass, laid as the cells of a Voronoi diagram'),
    glass: z
        .strictObject({
            colors: palette()
                .default(STAINED_GLASS_COLORS)
                .describe('colors of the pieces, each piece of one of them drawn at random'),
            alpha: ratio()
                .default(0.85)
                .describe('alpha of the glass, in [0, 1]: lower lets more of the back show'),
            shade: ratio()
                .default(0.25)
                .describe('random brightness variation between pieces, in [0, 1]'),
            light: ratio()
                .default(0.3)
                .describe('light coming through the top of the window, in [0, 1]'),
            grain: ratio()
                .default(0.08)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('the colored glass'),
    lead: z
        .strictObject({
            width: z
                .number()
                .min(0)
                .default(1)
                .describe('width of the lead between the pieces, in pixels; 0 for none')
                .meta(DETAIL),
            color: color().default('#1c1a18').describe('color of the lead'),
        })
        .prefault({})
        .describe('the lead holding the pieces'),
    frame: z
        .number()
        .min(0)
        .default(2)
        .describe('width of the lead frame along the outline, in pixels; 0 for none')
        .meta(DETAIL),
    bars: z
        .number()
        .int()
        .min(0)
        .default(2)
        .describe('horizontal iron bars across the window, below its arch'),
});

export type StainedglassParams = z.output<typeof stainedglassSchema>;

// each random decision draws from its own sequence
const SALT_CELLS = 1;
const SALT_COLOR = 2;
const SALT_SHADE = 3;
const SALT_GRAIN = 4;

/**
 * A stained glass window: pieces of colored glass laid as the cells of a Voronoi diagram,
 * held by lead, inside a lead frame following the outline of a pointed, round or flat
 * arch, crossed by horizontal iron bars. The glass is translucent; the patch is
 * transparent outside the window.
 */
export const stainedglass = defineGenerator({
    name: 'stainedglass',
    description: 'Stained glass window: pieces of colored glass held by lead, under an arch',
    category: 'civilized',
    schema: stainedglassSchema,
    overlay: true,
    render(p, { width, height, seed }) {
        const shape = p.arch.shape;
        // the springing line lies the rise of the arch below the top
        const spring =
            shape === 'flat' ? 0 : Math.min(height, (p.arch.rise ?? ARCH_RISE[shape]) * width);
        const diagram = new PowerDiagram(
            hashSeed(seed, SALT_CELLS),
            [width, height],
            p.cells.count,
            p.cells.variation,
        );
        const colors = p.glass.colors.map((c) => Rainbow.convertToRGBA(Rainbow.parse(c)));
        const lead = Rainbow.parse(p.lead.color);
        // the bars, evenly spaced between the springing line and the bottom
        const bars = Array.from(
            { length: p.bars },
            (_, i) => spring + ((height - spring) * (i + 1)) / (p.bars + 1),
        );
        const bar = Math.max(1, p.lead.width);

        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const [wx, wy] = [x + 0.5, y + 0.5];
                // distance to the outline, positive inside
                const arch =
                    shape === 'flat' ? undefined : archDistance(shape, width, spring, wx, wy);
                const d = Math.min(wx, width - wx, height - wy, arch ? arch.d : wy);
                if (d <= 0) {
                    continue;
                }
                if (d <= p.frame || bars.some((b) => Math.abs(wy - b) <= bar / 2)) {
                    texture.setPixel(x, y, lead);
                    continue;
                }
                const cell = diagram.sample(wx, wy);
                if (cell.border <= p.lead.width / 2) {
                    texture.setPixel(x, y, lead);
                    continue;
                }
                const c = colors[Math.floor(hash(seed, SALT_COLOR, cell.cell) * colors.length)];
                const light =
                    (1 + (hash(seed, SALT_SHADE, cell.cell) - 0.5) * 2 * p.glass.shade) *
                    (1 + p.glass.light * (1 - (2 * wy) / height)) *
                    (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.glass.grain);
                texture.setPixel(
                    x,
                    y,
                    Rainbow.fromRGBA({
                        r: clamp(c.r * light),
                        g: clamp(c.g * light),
                        b: clamp(c.b * light),
                        a: c.a * p.glass.alpha,
                    }),
                );
            }
        }
        return texture;
    },
});
