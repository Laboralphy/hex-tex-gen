import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashRange } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import { DETAIL, palette, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/** suffix of the descriptions of wear parameters */
const AGE = ' when unset, derived from age';

/**
 * Parameters of the beam template. The whole patch is the beam and its shadow.
 */
export const beamSchema = z.strictObject({
    size: size()
        .default([64, 9])
        .describe(
            'own size of the beam, its shadow included: [length, thickness] for a horizontal beam, [thickness, length] for a vertical one',
        ),
    direction: z
        .enum(['horizontal', 'vertical'])
        .default('horizontal')
        .describe('direction of the beam'),
    profile: z
        .enum(['girder', 'flat'])
        .default('girder')
        .describe(
            'girder: an I-beam seen from the front, flanges along its edges and a recessed web; flat: a flat strap',
        ),
    flange: z
        .number()
        .int()
        .min(1)
        .default(2)
        .describe('thickness of the flanges of a girder, in pixels')
        .meta(DETAIL),
    metal: z
        .strictObject({
            palette: palette()
                .default(['#2b2f33', '#474d53', '#687077', '#8f979e'])
                .describe('metal colors, from darkest to lightest'),
            brushed: ratio().default(0.12).describe('streaks along the beam, in [0, 1]'),
            grain: ratio()
                .default(0.03)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('metal of the beam'),
    rivets: z
        .strictObject({
            enabled: z
                .boolean()
                .default(true)
                .describe('rivets along each flange of a girder, along the middle of a strap'),
            spacing: z
                .number()
                .int()
                .min(2)
                .default(6)
                .describe('distance between rivets, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('rivets, lit from the top-left'),
    shadow: z
        .strictObject({
            offset: z
                .number()
                .int()
                .min(0)
                .default(1)
                .describe('shadow cast on the wall, to the bottom-right, in pixels')
                .meta(DETAIL),
            opacity: ratio().default(0.45).describe('darkness of the shadow, in [0, 1]'),
        })
        .prefault({})
        .describe('shadow of the beam on the wall, the light coming from the top-left'),
    age: ratio()
        .default(0.3)
        .describe(
            'overall weathering, from 0 (new) to 1 (ruined): sets every wear parameter left unset',
        ),
    rust: z
        .strictObject({
            coverage: ratio().optional().describe(`share of the surface rusted;${AGE}`),
            palette: palette()
                .default(['#3a1c0c', '#6b3314', '#9a4e1e', '#bf6e2e'])
                .describe('rust colors, from darkest to lightest'),
            streaks: ratio()
                .optional()
                .describe(`ratio of rivets with a rust streak running down;${AGE}`),
            length: range(z.number().min(0))
                .optional()
                .describe(`[min, max] length of the rust streaks, in pixels;${AGE}`)
                .meta(DETAIL),
        })
        .prefault({})
        .describe('rust'),
    scratches: z.number().min(0).optional().describe(`scratches per 32 × 32 pixels;${AGE}`),
    tarnish: ratio().optional().describe(`dulled, darkened metal, in [0, 1];${AGE}`),
});

export type BeamParams = z.output<typeof beamSchema>;

/**
 * Wear values of a beam, every one resolved.
 */
export type BeamWear = {
    rust: { coverage: number; streaks: number; length: [number, number] };
    scratches: number;
    tarnish: number;
};

/**
 * Resolves the wear values of a beam: values set in the parameters win, the others are
 * derived from `age`.
 */
export function beamWear(p: BeamParams): BeamWear {
    const a = p.age;
    return {
        rust: {
            coverage: p.rust.coverage ?? atAge(a, [0, 0.1, 0.55]),
            streaks: p.rust.streaks ?? atAge(a, [0, 0.2, 0.6]),
            length:
                p.rust.length ??
                rangeAtAge(a, [
                    [2, 4],
                    [3, 8],
                    [6, 18],
                ]),
        },
        scratches: p.scratches ?? atAge(a, [0, 0.5, 2.5]),
        tarnish: p.tarnish ?? atAge(a, [0, 0.1, 0.35]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_SCRATCH = 3;
const SALT_STREAK = 4;

/**
 * The body of a horizontal beam, without shadow, rust streaks nor tarnish, with its rivets
 * as `rivets` anchors.
 */
function renderBody(p: BeamParams, length: number, thickness: number, seed: number): Texture {
    const body = new Texture(length, thickness);
    const metal = createGradient(p.metal.palette);
    const cells = (px: number) => Math.max(1, Math.round(px));
    const brushed = new FractalNoise({
        seed: Math.floor(hash(seed, SALT_NOISE, 0) * 4294967296),
        period: [cells(length / 16), cells(thickness)],
        octaves: 2,
    });
    const flange = Math.min(p.flange, Math.floor(thickness / 2));
    const girder = p.profile === 'girder' && thickness >= 2 * flange + 1;
    for (let y = 0; y < thickness; ++y) {
        // tone of the row: the profile, lit from the top
        let tone: number;
        if (y === 0) {
            tone = 0.9;
        } else if (y === thickness - 1) {
            tone = 0.15;
        } else if (!girder) {
            tone = 0.55;
        } else if (y < flange) {
            tone = 0.72;
        } else if (y >= thickness - flange) {
            tone = 0.42;
        } else {
            // the web, recessed: in the shadow of the upper flange, lighter below
            const t = (y - flange) / Math.max(1, thickness - 2 * flange - 1);
            tone = y === flange ? 0.12 : 0.25 + 0.15 * t;
        }
        for (let x = 0; x < length; ++x) {
            const u = x / length;
            const v = y / thickness;
            let t = tone + p.metal.brushed * (brushed.sample(u, v) - 0.5) * 2;
            // bevelled ends: lit on the left, dark on the right
            if (x === 0) {
                t += 0.2;
            } else if (x === length - 1) {
                t -= 0.25;
            }
            const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.metal.grain;
            body.setPixel(x, y, shade(sample(metal, t), grain));
        }
    }

    // scratches: short bright lines
    const wear = beamWear(p);
    const count = Math.round((wear.scratches * length * thickness) / 1024);
    for (let k = 0; k < count; ++k) {
        const x0 = hash(seed, SALT_SCRATCH, k, 0) * length;
        const y0 = hash(seed, SALT_SCRATCH, k, 1) * thickness;
        const angle = hash(seed, SALT_SCRATCH, k, 2) * Math.PI;
        const l = hashRange(3, 7, seed, SALT_SCRATCH, k, 3);
        Bresenham.line(
            Math.round(x0),
            Math.round(y0),
            Math.round(x0 + Math.cos(angle) * l),
            Math.round(y0 + Math.sin(angle) * l),
            (x, y) => {
                if (x < 0 || y < 0 || x >= length || y >= thickness) {
                    return false;
                }
                body.setPixel(x, y, shade(body.getPixel(x, y), 1.25));
                return true;
            },
        );
    }

    // rivets: along each flange of a girder, along the middle of a strap
    const rivets: { x: number; y: number }[] = [];
    if (p.rivets.enabled) {
        const rows = girder
            ? [Math.floor((flange - 1) / 2), thickness - flange + Math.floor((flange - 1) / 2)]
            : [Math.floor((thickness - 1) / 2)];
        const spacing = p.rivets.spacing;
        for (let x = Math.floor(spacing / 2); x < length - 1; x += spacing) {
            for (const y of rows) {
                rivets.push({ x, y });
                const base = body.getPixel(x, y);
                body.setPixel(x, y, shade(base, 1.6));
                if (x + 1 < length && y + 1 < thickness) {
                    body.setPixel(x + 1, y + 1, shade(base, 0.45));
                }
            }
        }
    }
    body.anchors = { rivets };
    return body;
}

/**
 * A metal support beam, horizontal or vertical: a riveted girder or strap, casting a
 * shadow on the wall, rusting with age. Beams frame alcoves, doors or panels.
 */
export const beam = defineGenerator({
    name: 'beam',
    description: 'Metal support beam, horizontal or vertical: a riveted girder or strap',
    schema: beamSchema,
    overlay: true,
    anchors: {
        start: 'top-left corner of the beam',
        center: 'center of the beam',
    },
    render(p, { width, height, seed }) {
        const wear = beamWear(p);
        const offset = p.shadow.offset;
        const bodyWidth = Math.max(1, width - offset);
        const bodyHeight = Math.max(1, height - offset);
        const vertical = p.direction === 'vertical';
        // a vertical beam is a horizontal one, transposed: the lighting stays top-left
        const body = vertical
            ? renderBody(p, bodyHeight, bodyWidth, seed).transposed()
            : renderBody(p, bodyWidth, bodyHeight, seed);
        const rivets = body.anchors.rivets;

        const texture = new Texture(width, height);
        // the shadow, then the body over it
        if (offset > 0) {
            const shadowColor = Rainbow.fromRGBA({ r: 0, g: 0, b: 0, a: p.shadow.opacity });
            for (let y = 0; y < bodyHeight; ++y) {
                for (let x = 0; x < bodyWidth; ++x) {
                    texture.setPixel(x + offset, y + offset, shadowColor);
                }
            }
        }
        texture.draw(body, 0, 0);

        // rust: patches, and streaks running down from rivets, in the final orientation
        const rust = createGradient(p.rust.palette);
        const rustNoise = new FractalNoise({
            seed: Math.floor(hash(seed, SALT_NOISE, 1) * 4294967296),
            period: [Math.max(1, Math.round(width / 12)), Math.max(1, Math.round(height / 12))],
            octaves: 3,
        });
        const tarnishNoise = new FractalNoise({
            seed: Math.floor(hash(seed, SALT_NOISE, 2) * 4294967296),
            period: 3,
            octaves: 2,
        });
        const streak = new Float32Array(width * height);
        rivets.forEach(({ x, y }, k) => {
            if (hash(seed, SALT_STREAK, k, 0) >= wear.rust.streaks) {
                return;
            }
            const l = hashRange(wear.rust.length[0], wear.rust.length[1], seed, SALT_STREAK, k, 1);
            for (let t = 2; t < l + 2 && y + t < bodyHeight; ++t) {
                streak[(y + t) * width + x] = Math.max(
                    streak[(y + t) * width + x],
                    0.7 * (1 - (t - 2) / l),
                );
            }
        });
        for (let y = 0; y < bodyHeight; ++y) {
            for (let x = 0; x < bodyWidth; ++x) {
                const u = x / width;
                const v = y / height;
                let rgba = Rainbow.convertToRGBA(texture.getPixel(x, y));
                const n = rustNoise.sample(u, v);
                let amount = 0;
                if (wear.rust.coverage > 0) {
                    amount = Math.max(0, Math.min(1, (n - (1 - wear.rust.coverage)) / 0.12));
                }
                amount = Math.max(amount, streak[y * width + x]);
                if (amount > 0) {
                    const r = Rainbow.convertToRGBA(sample(rust, n + 0.1));
                    rgba = {
                        r: rgba.r + (r.r - rgba.r) * amount,
                        g: rgba.g + (r.g - rgba.g) * amount,
                        b: rgba.b + (r.b - rgba.b) * amount,
                        a: 1,
                    };
                }
                if (wear.tarnish > 0) {
                    const f = 1 - wear.tarnish * (0.5 + 0.5 * tarnishNoise.sample(u, v));
                    rgba = { r: rgba.r * f, g: rgba.g * f, b: rgba.b * f, a: 1 };
                }
                texture.setPixel(x, y, Rainbow.fromRGBA(rgba));
            }
        }

        texture.anchors = {
            start: [{ x: 0, y: 0 }],
            center: [{ x: Math.floor(bodyWidth / 2), y: Math.floor(bodyHeight / 2) }],
        };
        return texture;
    },
});
