import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type ColorRGBAStruct } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge, rangeAtAge } from '../core/age';
import { hash, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { createGradient, sample, shadeRGBA } from '../core/palette';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    palette,
    ratio,
    shadowGroup,
    size,
} from '../core/schema';
import { Texture } from '../core/Texture';
import { dentsGroup, drawDents, type DentsWear } from './common/dents';
import { dropShadow, scaledOffset } from './common/drop-shadow';
import { fadeColor } from './common/fading';
import { METAL_PALETTE, WOOD_PALETTE } from './common/palettes';
import { defineGenerator } from './define';

/**
 * Parameters of the shield template. The whole patch is the shield, and the swords
 * crossed behind it if any.
 */
export const shieldSchema = z.strictObject({
    size: size().default([24, 32]).describe('own size of the shield, swords included'),
    shape: z
        .enum(['heater', 'round', 'kite'])
        .default('heater')
        .describe(
            'heater: a flat top, sides curving to a point; round: a disc; kite: a rounded top, a long point',
        ),
    field: z
        .strictObject({
            division: z
                .enum(['none', 'pale', 'fess', 'bend', 'quarterly'])
                .default('none')
                .describe(
                    'how the field is split between its two tinctures: pale, left and right halves; fess, top and bottom; bend, along a diagonal; quarterly, in four',
                ),
            tinctures: z
                .tuple([color(), color()])
                .default(['#8c1c1c', '#1e3c7a'])
                .describe('the two colors of the field; a plain field uses the first one'),
        })
        .prefault({})
        .describe('the painted field'),
    charge: z
        .strictObject({
            ordinary: z
                .enum(['none', 'cross', 'saltire', 'chevron', 'bend', 'fess', 'pale'])
                .default('cross')
                .describe('a band painted over the field: a cross, a diagonal cross, a chevron...'),
            color: color().default('#d6b04a').describe('color of the ordinary'),
            width: ratio()
                .default(0.2)
                .describe('width of the ordinary, as a share of the shield width'),
        })
        .prefault({})
        .describe('the ordinary painted over the field'),
    rim: z
        .strictObject({
            width: z
                .number()
                .int()
                .min(0)
                .default(1)
                .describe('width of the metal rim, in pixels; 0 for none')
                .meta(DETAIL),
            palette: palette()
                .default(METAL_PALETTE)
                .describe('metal colors of the rim, the boss and the blades'),
        })
        .prefault({})
        .describe('metal rim around the shield'),
    boss: z.boolean().default(false).describe('a round metal boss in the middle of the shield'),
    swords: z.boolean().default(false).describe('two swords crossed behind the shield, points up'),
    shadow: shadowGroup('shield', 0.45, 1, true),
    age: ageParam(),
    fading: ratio().optional().describe(`paint faded by light, in [0, 1];${FROM_AGE}`),
    flaking: ratio()
        .optional()
        .describe(`paint flaked off, showing the wood, in [0, 1];${FROM_AGE}`),
    dents: dentsGroup(),
});

export type ShieldParams = z.output<typeof shieldSchema>;

/**
 * Wear values of a shield, every one resolved.
 */
export type ShieldWear = { fading: number; flaking: number; dents: DentsWear };

/**
 * Resolves the wear values of a shield: values set in the parameters win, the others are
 * derived from `age`.
 */
export function shieldWear(p: ShieldParams): ShieldWear {
    const a = p.age;
    return {
        fading: p.fading ?? atAge(a, [0, 0.1, 0.5]),
        flaking: p.flaking ?? atAge(a, [0, 0.08, 0.5]),
        dents: {
            density: p.dents.density ?? atAge(a, [0, 1, 5]),
            size:
                p.dents.size ??
                rangeAtAge(a, [
                    [1, 1.5],
                    [1, 2],
                    [1.5, 3],
                ]),
        },
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_DENT = 3;

/** gold of the hilts */
const GOLD = Rainbow.convertToRGBA(Rainbow.parse('#b8902c'));

/** leather of the grips */
const LEATHER = Rainbow.convertToRGBA(Rainbow.parse('#3a2616'));

/**
 * Half width of a shield, as a share of its box width, at a height in its box.
 * @param v from 0 (top) to 1 (bottom)
 */
function halfWidth(shape: ShieldParams['shape'], v: number): number {
    if (shape === 'round') {
        return 0.5 * Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2));
    }
    if (shape === 'kite') {
        return v < 0.3
            ? 0.5 * Math.sqrt(Math.max(0, 1 - ((0.3 - v) / 0.3) ** 2))
            : 0.5 * Math.pow(Math.max(0, 1 - (v - 0.3) / 0.7), 0.8);
    }
    // heater: straight sides, then convex curves meeting at the point
    const t = Math.max(0, (v - 0.45) / 0.55);
    return 0.5 * (1 - t * t);
}

/** distance from a point to a segment */
function segmentDistance(
    px: number,
    py: number,
    [ax, ay]: [number, number],
    [bx, by]: [number, number],
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * A heraldic shield: heater, round or kite, its field divided between two tinctures and
 * charged with an ordinary, rimmed with metal, maybe bossed, maybe hung over two crossed
 * swords. Its paint fades and flakes, and it gets dented, with age.
 */
export const shield = defineGenerator({
    name: 'shield',
    description: 'Heraldic shield, maybe over two crossed swords, its paint fading with age',
    category: 'civilized',
    schema: shieldSchema,
    overlay: true,
    anchors: {
        center: 'center of the shield, where its boss or its charge is',
    },
    render(p, { width, height, seed }) {
        const wear = shieldWear(p);
        const sy = height / p.size[1];
        const offset = scaledOffset(p.shadow.offset, sy);
        const room = { w: width - offset, h: height - offset };
        // the shield's box: the patch, or its middle when swords stand around it
        let bw = Math.round(room.w * (p.swords ? 0.56 : 1));
        let bh = Math.round(room.h * (p.swords ? 0.62 : 1));
        if (p.shape === 'round') {
            // a round shield stays a disc, whatever its box
            bw = bh = Math.min(bw, bh);
        }
        const bx = Math.round((room.w - bw) / 2);
        const by = Math.round((room.h - bh) / 2);

        const body = new Texture(width, height);
        const solid = new Uint8Array(width * height);
        const metal = createGradient(p.rim.palette);
        const put = (x: number, y: number, rgba: ColorRGBAStruct) => {
            if (x >= 0 && y >= 0 && x < width && y < height) {
                body.setPixel(x, y, Rainbow.fromRGBA({ ...rgba, a: 1 }));
                solid[y * width + x] = 1;
            }
        };
        const metalAt = (tone: number) => Rainbow.convertToRGBA(sample(metal, tone));

        // swords behind the shield: blades up, crossing over its middle
        if (p.swords) {
            for (const side of [-1, 1]) {
                // from the pommel, low on one side, to the point, high on the other
                const pommel: [number, number] = [room.w / 2 - side * room.w * 0.42, room.h * 0.92];
                const point: [number, number] = [room.w / 2 + side * room.w * 0.42, room.h * 0.04];
                const along = (t: number): [number, number] => [
                    Math.round(pommel[0] + (point[0] - pommel[0]) * t),
                    Math.round(pommel[1] + (point[1] - pommel[1]) * t),
                ];
                const line = (
                    a: number,
                    b: number,
                    dx: number,
                    draw: (x: number, y: number) => void,
                ) => {
                    const [ax, ay] = along(a);
                    const [cx, cy] = along(b);
                    Bresenham.line(ax + dx, ay, cx + dx, cy, (x, y) => {
                        draw(x, y);
                        return true;
                    });
                };
                // the blade, two pixels wide: a lit edge and a dark one
                line(0.22, 1, 0, (x, y) => put(x, y, metalAt(0.9)));
                line(0.22, 0.97, side, (x, y) => put(x, y, metalAt(0.45)));
                // the grip, and the pommel
                line(0.04, 0.2, 0, (x, y) => put(x, y, LEATHER));
                const [px, py] = along(0);
                put(px, py, GOLD);
                put(px + side, py, shadeRGBA(GOLD, 0.7));
                // the crossguard, across the blade
                const [gx, gy] = along(0.21);
                for (let k = -2; k <= 2; ++k) {
                    put(gx + k, gy + side * k, shadeRGBA(GOLD, k < 0 ? 1.15 : 0.85));
                }
            }
        }

        // the shield: its outline, its rim, its field, its ordinary, its boss
        const inShield = (x: number, y: number) => {
            const u = (x + 0.5 - bx) / bw;
            const v = (y + 0.5 - by) / bh;
            return v >= 0 && v <= 1 && Math.abs(u - 0.5) <= halfWidth(p.shape, v);
        };
        const tinctures = p.field.tinctures.map((c) => Rainbow.convertToRGBA(Rainbow.parse(c)));
        const chargeColor = Rainbow.convertToRGBA(Rainbow.parse(p.charge.color));
        const wood = createGradient(WOOD_PALETTE);
        const stripe = Math.max(1, (p.charge.width * bw) / 2);
        // the middle of the ordinaries: a little above the middle of the box
        const mx = bx + bw / 2;
        const my = by + bh * (p.shape === 'round' ? 0.5 : 0.42);
        const flakes = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE),
            period: 4,
            octaves: 3,
        });
        const rim = p.rim.width;
        for (let y = by; y < by + bh; ++y) {
            for (let x = bx; x < bx + bw; ++x) {
                if (!inShield(x, y)) {
                    continue;
                }
                const u = (x + 0.5 - bx) / bw;
                const v = (y + 0.5 - by) / bh;
                // convex: lit from the top-left
                const light = 1.12 - 0.3 * (u * 0.5 + v * 0.5);
                let edge = false;
                for (let dy = -rim; dy <= rim && !edge; ++dy) {
                    for (let dx = -rim; dx <= rim && !edge; ++dx) {
                        edge = (dx !== 0 || dy !== 0) && !inShield(x + dx, y + dy);
                    }
                }
                if (edge) {
                    put(x, y, metalAt(u + v < 1 ? 0.85 : 0.35));
                    continue;
                }
                // the field, divided
                const second =
                    p.field.division === 'pale'
                        ? u >= 0.5
                        : p.field.division === 'fess'
                          ? v >= 0.45
                          : p.field.division === 'bend'
                            ? v > u
                            : p.field.division === 'quarterly'
                              ? u >= 0.5 !== v >= 0.45
                              : false;
                let rgba = tinctures[second ? 1 : 0];
                // the ordinary
                const px = x + 0.5;
                const py = y + 0.5;
                const ordinary = p.charge.ordinary;
                const onCharge =
                    (ordinary === 'cross' &&
                        (Math.abs(px - mx) < stripe || Math.abs(py - my) < stripe)) ||
                    (ordinary === 'pale' && Math.abs(px - mx) < stripe) ||
                    (ordinary === 'fess' && Math.abs(py - my) < stripe) ||
                    (ordinary === 'saltire' &&
                        (segmentDistance(px, py, [bx, by], [bx + bw, by + bh]) < stripe ||
                            segmentDistance(px, py, [bx + bw, by], [bx, by + bh]) < stripe)) ||
                    (ordinary === 'bend' &&
                        segmentDistance(px, py, [bx, by], [bx + bw, by + bh]) < stripe) ||
                    (ordinary === 'chevron' &&
                        (segmentDistance(px, py, [bx, by + bh * 0.85], [mx, by + bh * 0.3]) <
                            stripe ||
                            segmentDistance(
                                px,
                                py,
                                [mx, by + bh * 0.3],
                                [bx + bw, by + bh * 0.85],
                            ) < stripe));
                if (onCharge) {
                    rgba = chargeColor;
                }
                // paint: faded, flaked off down to the wood
                rgba = fadeColor(rgba, wear.fading);
                const n = flakes.sample(x / width, y / height);
                if (wear.flaking > 0 && n > 1 - wear.flaking * 0.8) {
                    rgba = Rainbow.convertToRGBA(sample(wood, 0.35 + 0.4 * n));
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 0.08;
                put(x, y, shadeRGBA(rgba, light * grain));
            }
        }
        if (p.boss) {
            const r = Math.max(1.5, bw * 0.13);
            for (let y = Math.floor(my - r); y <= Math.ceil(my + r); ++y) {
                for (let x = Math.floor(mx - r); x <= Math.ceil(mx + r); ++x) {
                    const dx = x + 0.5 - mx;
                    const dy = y + 0.5 - my;
                    const d = Math.hypot(dx, dy);
                    if (d <= r) {
                        // a dome: lit on its top-left, a highlight near its top
                        const tone = 0.55 - (0.35 * (dx + dy)) / (2 * r) + (d < r * 0.35 ? 0.2 : 0);
                        put(x, y, metalAt(tone));
                    }
                }
            }
        }

        // dents, over the whole shield
        const ids = new Int32Array(width * height).fill(-1);
        for (let i = 0; i < ids.length; ++i) {
            ids[i] = solid[i] ? 0 : -1;
        }
        drawDents(body, ids, wear.dents, seed, SALT_DENT);

        const texture = dropShadow(body, (i) => solid[i] === 1, offset, p.shadow.opacity);
        texture.anchors = { center: [{ x: Math.floor(mx), y: Math.floor(my) }] };
        return texture;
    },
});
