import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp, mod } from '../core/math';
import { createGradient, sample, shade } from '../core/palette';
import { ageParam, FROM_AGE, LAYOUT, ratio, shadowGroup, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { dropShadow, scaledOffset } from './common/drop-shadow';
import { Marble, marbleGroup } from './common/Marble';
import { defineGenerator } from './define';

/**
 * Parameters of the entablature template. The whole patch is the entablature: a
 * horizontal band of marble, tiling horizontally.
 */
export const entablatureSchema = z.strictObject({
    size: size().default([64, 16]).describe('own size of the entablature'),
    layers: z
        .strictObject({
            cornice: ratio().default(0.3).describe('share of the height of the cornice, on top'),
            frieze: ratio().default(0.45).describe('share of the height of the frieze'),
            architrave: ratio()
                .default(0.25)
                .describe('share of the height of the architrave, at the bottom'),
        })
        .prefault({})
        .describe('bands from top to bottom; their shares are normalized'),
    frieze: z
        .strictObject({
            pattern: z
                .enum(['meander', 'triglyph', 'plain'])
                .default('meander')
                .describe(
                    'meander: running Greek-key hooks on a baseline, or the simple fret, a square wave, when the frieze is too low for hooks; triglyph: grooved blocks between metopes carrying a rosette; plain: none',
                ),
            period: z
                .number()
                .positive()
                .default(10)
                .describe(
                    'length of one motif, in pixels at own size; rounded so that the motifs fill the width',
                )
                .meta(LAYOUT),
        })
        .prefault({})
        .describe('the middle band, carved'),
    dentils: z.boolean().default(true).describe('a row of small blocks under the cornice'),
    marble: marbleGroup(),
    shadow: shadowGroup('entablature', 0.45, 1, true),
    age: ageParam(),
    grime: ratio()
        .optional()
        .describe(`dirt darkening the marble under each projection, in [0, 1];${FROM_AGE}`),
    chips: ratio()
        .optional()
        .describe(`chipped edges, in [0, 1]: share of the outline broken away;${FROM_AGE}`),
    broken: ratio()
        .optional()
        .describe(`chance a chunk has broken away from the bottom edge;${FROM_AGE}`),
});

export type EntablatureParams = z.output<typeof entablatureSchema>;

/**
 * Wear values of an entablature, every one resolved.
 */
export type EntablatureWear = { grime: number; chips: number; broken: number };

/**
 * Resolves the wear values of an entablature: values set in the parameters win, the
 * others are derived from `age`.
 */
export function entablatureWear(p: EntablatureParams): EntablatureWear {
    const a = p.age;
    return {
        grime: p.grime ?? atAge(a, [0, 0.15, 0.6]),
        chips: p.chips ?? atAge(a, [0, 0.04, 0.25]),
        broken: p.broken ?? atAge(a, [0, 0, 0.5]),
    };
}

// each random decision draws from its own sequence
const SALT_MARBLE = 1;
const SALT_NOISE = 2;
const SALT_CHIP = 3;
const SALT_BROKEN = 4;

/** a Greek-key hook in a unit square, rising from the baseline at its bottom */
const HOOK: [number, number][] = [
    [0.1, 1],
    [0.1, 0],
    [0.9, 0],
    [0.9, 0.75],
    [0.4, 0.75],
    [0.4, 0.35],
    [0.65, 0.35],
];

/** the simple fret: a square wave, continuous from one motif to the next */
const FRET: [number, number][] = [
    [0, 1],
    [0, 0],
    [0.5, 0],
    [0.5, 1],
    [1, 1],
];

/** rows a frieze needs, inside its edges, to draw Greek-key hooks; below, a fret */
const HOOK_ROWS = 7;

/**
 * A classical entablature: a cornice over dentils, a carved frieze of meanders or
 * triglyphs, and a stepped architrave, in veined marble. Its motifs fill the width, so
 * that it tiles horizontally; it casts a shadow on the wall below.
 */
export const entablature = defineGenerator({
    name: 'entablature',
    description: 'Classical entablature: cornice, carved frieze and architrave, in marble',
    category: 'architecture',
    schema: entablatureSchema,
    overlay: true,
    anchors: {
        top: 'left end of the top edge, where something may rest',
        bottom: 'left end of the bottom edge, where columns meet it',
    },
    render(p, { width, height, seed }) {
        const wear = entablatureWear(p);
        const sx = width / p.size[0];
        const sy = height / p.size[1];
        // the band, and its shadow on the wall below it, in the last rows of the patch
        const offset = scaledOffset(p.shadow.offset, sy);
        const band = Math.max(3, height - offset);
        // brightness of each pixel, NaN where the entablature is not
        const light = new Float32Array(width * height).fill(NaN);
        light.fill(1, 0, width * band);
        const at = (x: number, y: number) => y * width + mod(x, width);

        // bands: their rows, from their shares
        const shares = [p.layers.cornice, p.layers.frieze, p.layers.architrave];
        const total = shares.reduce((a, b) => a + b, 0) || 1;
        const cornice = Math.max(2, Math.round((shares[0] / total) * band));
        const architrave = Math.max(1, Math.round((shares[2] / total) * band));
        const friezeTop = cornice;
        const friezeBottom = band - architrave;

        // the cornice: a lit top, its face, a soffit in deep shadow, dentils under it
        const dentils = p.dentils && cornice >= 4 ? Math.max(1, Math.round(cornice * 0.35)) : 0;
        const soffit = cornice - dentils - 1;
        for (let y = 0; y < cornice; ++y) {
            for (let x = 0; x < width; ++x) {
                let value: number;
                if (y === 0) {
                    value = 1.15;
                } else if (y < soffit) {
                    value = 0.97;
                } else if (y === soffit) {
                    value = 0.5;
                } else {
                    // dentils: blocks two thirds of their period, shadow between
                    const period = Math.max(3, Math.round(3 * sx));
                    const count = Math.max(1, Math.round(width / period));
                    const s = ((x + 0.5) * count) / width;
                    const inBlock = s % 1 < 0.66;
                    value = inBlock ? (y === soffit + 1 ? 0.9 : 0.8) : 0.45;
                }
                light[at(x, y)] = value;
            }
        }

        // the frieze: a flat face, carved
        for (let y = friezeTop; y < friezeBottom; ++y) {
            for (let x = 0; x < width; ++x) {
                light[at(x, y)] = y === friezeTop ? 0.85 : 0.95;
            }
        }
        const motifs = Math.max(1, Math.round(width / (p.frieze.period * sx)));
        const motif = width / motifs;
        const fh = friezeBottom - friezeTop;
        const carve = (x: number, y: number) => {
            if (y > friezeTop && y < friezeBottom - 1) {
                light[at(x, y)] = 0.5;
                // the lip of a groove catches the light
                if (y + 1 < friezeBottom - 1 && light[at(x + 1, y + 1)] > 0.6) {
                    light[at(x + 1, y + 1)] = 1.12;
                }
            }
        };
        if (p.frieze.pattern === 'meander' && fh >= 5) {
            const inner = { top: friezeTop + 1, height: fh - 3 };
            // Greek-key hooks when there is room for them, else the simple fret
            const hooks = inner.height >= HOOK_ROWS;
            for (let m = 0; m < motifs; ++m) {
                const x0 = m * motif;
                const points = (hooks ? HOOK : FRET).map(([u, v]) => [
                    Math.round(x0 + u * (motif - 1)),
                    Math.round(inner.top + v * inner.height),
                ]);
                for (let i = 0; i + 1 < points.length; ++i) {
                    const [[ax, ay], [bx, by]] = [points[i], points[i + 1]];
                    Bresenham.line(ax, ay, bx, by, (x, y) => {
                        carve(x, y);
                        return true;
                    });
                }
            }
            // the baseline the hooks rise from
            if (hooks) {
                for (let x = 0; x < width; ++x) {
                    carve(x, inner.top + inner.height);
                }
            }
        } else if (p.frieze.pattern === 'triglyph') {
            for (let m = 0; m < motifs; ++m) {
                const x0 = Math.round(m * motif);
                const glyph = Math.max(3, Math.round(motif * 0.4));
                for (let y = friezeTop; y < friezeBottom; ++y) {
                    for (let i = 0; i < glyph; ++i) {
                        // three bars, two grooves between them, lit on the left edge
                        const s = (i + 0.5) / glyph;
                        const groove = Math.abs(s - 1 / 3) < 0.09 || Math.abs(s - 2 / 3) < 0.09;
                        light[at(x0 + i, y)] =
                            i === 0 ? 1.12 : i === glyph - 1 ? 0.7 : groove ? 0.55 : 1;
                    }
                }
                // a rosette in the middle of the metope
                const cx = x0 + glyph + (motif - glyph) / 2;
                const cy = friezeTop + fh / 2;
                const r = Math.min(motif - glyph, fh) * 0.28;
                for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); ++y) {
                    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); ++x) {
                        const dx = x + 0.5 - cx;
                        const dy = y + 0.5 - cy;
                        const d = Math.hypot(dx, dy);
                        if (d <= r && y > friezeTop && y < friezeBottom - 1) {
                            light[at(x, y)] = d > r - 1 ? (dx + dy < 0 ? 1.12 : 0.6) : 0.9;
                        }
                    }
                }
            }
        }

        // the architrave: fasciae stepping out downwards, each lit on its top row
        const fasciae = architrave >= 4 ? 2 : 1;
        for (let y = friezeBottom; y < band; ++y) {
            const band = Math.floor(((y - friezeBottom) * fasciae) / architrave);
            const first = friezeBottom + Math.ceil((band * architrave) / fasciae);
            for (let x = 0; x < width; ++x) {
                light[at(x, y)] = y === first ? 1.1 : y === band - 1 ? 0.75 : 0.93;
            }
        }
        // the shadow of the cornice on the top of the frieze
        for (let x = 0; x < width; ++x) {
            light[at(x, friezeTop)] *= 0.8;
        }

        // wear: a chunk broken from the bottom edge, chipped edges
        if (hash(seed, SALT_BROKEN) < wear.broken) {
            const cx = hash(seed, SALT_BROKEN, 1) * width;
            const half = hashRange(0.08, 0.15, seed, SALT_BROKEN, 2) * width;
            const depth = hashRange(0.3, 0.6, seed, SALT_BROKEN, 3) * band;
            for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); ++x) {
                const t = 1 - Math.abs(x + 0.5 - cx) / half;
                const reach =
                    depth * Math.sqrt(clamp(t)) + (hash(seed, SALT_BROKEN, 4, x) - 0.5) * 2;
                for (let y = band - 1; y >= band - reach; --y) {
                    light[at(x, y)] = NaN;
                }
            }
        }
        if (wear.chips > 0) {
            for (let x = 0; x < width; ++x) {
                for (const y of [0, band - 1]) {
                    if (hash(seed, SALT_CHIP, x, y) < wear.chips) {
                        light[at(x, y)] = NaN;
                    }
                }
            }
        }

        // colors: veined marble, shaded, grimy under the projections
        const marble = new Marble(hashSeed(seed, SALT_MARBLE), width, height, p.marble);
        const colors = createGradient(p.marble.palette);
        const grime = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: [Math.max(1, Math.round(width / 16)), 2],
            octaves: 3,
        });
        const body = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const value = light[y * width + x];
                if (Number.isNaN(value)) {
                    continue;
                }
                // grime gathers under the cornice and at the bottom
                const sheltered = y >= soffit && y < friezeTop + 2 ? 1 : 0.5 + 0.5 * (y / height);
                const dirt =
                    wear.grime * sheltered * clamp(grime.sample(x / width, y / height) * 1.4 - 0.2);
                const color = sample(colors, marble.tone(x, y));
                body.setPixel(x, y, shade(color, value * (1 - 0.6 * dirt)));
            }
        }

        const texture = dropShadow(body, (i) => !Number.isNaN(light[i]), offset, p.shadow.opacity);
        texture.anchors = {
            top: [{ x: 0, y: 0 }],
            bottom: [{ x: 0, y: band - 1 }],
        };
        return texture;
    },
});
