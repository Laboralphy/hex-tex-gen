import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashSeed } from '../core/hash';
import { mixRGBA, sample, createGradient, shade } from '../core/palette';
import { ageParam, color, DETAIL, palette, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { metalWearBase, rustGroup, tarnishParam, type MetalWearBase } from './common/metal-wear';
import { MetalWeathering } from './common/MetalWeathering';
import { METAL_PALETTE } from './common/palettes';
import { defineGenerator } from './define';

/**
 * Parameters of the slot template. The whole patch is the slot: two metal strips and the
 * dark gap between them, running from end to end.
 */
export const slotSchema = z.strictObject({
    size: size()
        .default([10, 64])
        .describe(
            'own size of the slot: [width, length] for a vertical slot, [length, width] for a horizontal one',
        ),
    direction: z
        .enum(['vertical', 'horizontal'])
        .default('vertical')
        .describe(
            'vertical, for doors sliding sideways into the wall; horizontal, for doors lifting into the ceiling',
        ),
    strips: z
        .strictObject({
            width: z
                .number()
                .int()
                .min(1)
                .default(3)
                .describe('width of each metal strip, in pixels: the gap takes the rest')
                .meta(DETAIL),
            palette: palette()
                .default(METAL_PALETTE)
                .describe('metal colors, from darkest to lightest'),
            brushed: ratio().default(0.12).describe('streaks along the strips, in [0, 1]'),
            rivets: z
                .number()
                .int()
                .min(0)
                .default(8)
                .describe(
                    'distance between rivets along each strip, in pixels, adjusted so that the slot tiles; 0 for none',
                )
                .meta(DETAIL),
        })
        .prefault({})
        .describe('metal strips lining both sides of the slot, lit from the top-left'),
    inside: z
        .strictObject({
            color: color().default('#15130f').describe('color of the inside of the slot'),
            light: ratio()
                .default(0.35)
                .describe('light caught by the far side of the slot, facing the light, in [0, 1]'),
        })
        .prefault({})
        .describe('the dark inside of the slot, where the door disappears'),
    age: ageParam(),
    rust: rustGroup('share of the strips rusted'),
    tarnish: tarnishParam(),
});

export type SlotParams = z.output<typeof slotSchema>;

/**
 * Wear values of a slot, every one resolved.
 */
export type SlotWear = Omit<MetalWearBase, 'scratches'>;

/**
 * Resolves the wear values of a slot: values set in the parameters win, the others are
 * derived from `age`.
 */
export function slotWear(p: SlotParams): SlotWear {
    const { rust, tarnish } = metalWearBase(p, {
        coverage: [0, 0.08, 0.5],
        streaks: [0, 0.2, 0.6],
    });
    return { rust, tarnish };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_STREAK = 3;

/** light of the columns of a strip, from its outer edge to the gap */
const LEFT_STRIP = [0.85, 0.6, 0.3];
const RIGHT_STRIP = [0.9, 0.55, 0.35];

/**
 * Brightness of a column of a strip, lit from the left.
 * @param i column, from the outer edge of the strip
 * @param w width of the strip
 * @param right the strip is on the right of the gap: its inner edge faces the light
 */
function stripLight(i: number, w: number, right: boolean): number {
    const tones = right ? RIGHT_STRIP : LEFT_STRIP;
    if (w === 1) {
        return tones[1];
    }
    // the left strip goes from lit (outside) to dark (towards the gap); the right one
    // from lit (towards the gap) to dark (outside)
    const t = right ? 1 - i / (w - 1) : i / (w - 1);
    return t === 0 ? tones[0] : t === 1 ? tones[2] : tones[1];
}

/**
 * The slot drawn vertically, `thickness` pixels across and `length` long.
 */
function renderVertical(p: SlotParams, thickness: number, length: number, seed: number): Texture {
    const texture = new Texture(thickness, length);
    const wear = slotWear(p);
    const metal = createGradient(p.strips.palette);
    const strip = Math.min(p.strips.width, Math.floor((thickness - 1) / 2));
    const gapLeft = strip;
    const gapRight = thickness - strip;
    const brushed = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 0),
        period: [1, Math.max(1, Math.round(length / 12))],
        octaves: 2,
    });

    // the inside: dark, the far side catching some light
    const inside = Rainbow.convertToRGBA(Rainbow.parse(p.inside.color));
    const lit = mixRGBA(inside, { r: 1, g: 1, b: 1, a: 1 }, p.inside.light * 0.35);
    for (let y = 0; y < length; ++y) {
        for (let x = gapLeft; x < gapRight; ++x) {
            const t = gapRight - gapLeft > 1 ? (x - gapLeft) / (gapRight - gapLeft - 1) : 0;
            texture.setPixel(x, y, Rainbow.fromRGBA({ ...mixRGBA(inside, lit, t * t), a: 1 }));
        }
    }

    // the strips, brushed along their length
    const isStrip = (x: number) => x < gapLeft || x >= gapRight;
    for (let y = 0; y < length; ++y) {
        for (let x = 0; x < thickness; ++x) {
            if (!isStrip(x)) {
                continue;
            }
            const right = x >= gapRight;
            const i = right ? thickness - 1 - x : x;
            let tone = stripLight(i, strip, right);
            tone += p.strips.brushed * (brushed.sample(x / thickness, y / length) - 0.5) * 2;
            const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 0.06;
            texture.setPixel(x, y, shade(sample(metal, tone), grain));
        }
    }

    // rivets: evenly spread, so that the slot tiles along its length
    const rivets: { x: number; y: number }[] = [];
    if (p.strips.rivets > 0 && strip >= 2) {
        const count = Math.max(1, Math.round(length / p.strips.rivets));
        for (let k = 0; k < count; ++k) {
            const y = Math.floor(((k + 0.5) * length) / count);
            for (const x of [Math.floor((strip - 1) / 2), thickness - 1 - Math.floor(strip / 2)]) {
                rivets.push({ x, y });
                const base = texture.getPixel(x, y);
                texture.setPixel(x, y, shade(base, 1.6));
                if (x + 1 < thickness && isStrip(x + 1)) {
                    texture.setPixel(x + 1, y + 1, shade(base, 0.45));
                }
            }
        }
    }

    // rust and tarnish on the strips, streaks running down from the rivets
    const rustNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 1),
        period: [1, Math.max(1, Math.round(length / 12))],
        octaves: 3,
    });
    const tarnishNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 2),
        period: 3,
        octaves: 2,
    });
    const weathering = new MetalWeathering(thickness, length, wear, p.rust.palette, tarnishNoise);
    weathering.addStreaks(rivets, seed, SALT_STREAK, (x, y) =>
        y < length && isStrip(x) ? y * thickness + x : -1,
    );
    for (let y = 0; y < length; ++y) {
        for (let x = 0; x < thickness; ++x) {
            if (isStrip(x)) {
                const u = x / thickness;
                const v = y / length;
                const n = rustNoise.sample(u, v);
                texture.setPixel(x, y, weathering.apply(texture.getPixel(x, y), x, y, n, u, v));
            }
        }
    }
    texture.anchors = { gap: [{ x: gapLeft, y: 0 }] };
    return texture;
}

/**
 * A door slot: a dark recess running from end to end between two riveted metal strips,
 * where a sliding door disappears as it opens. Vertical for doors sliding into the wall,
 * horizontal for doors lifting into the ceiling. It rusts with age.
 */
export const slot = defineGenerator({
    name: 'slot',
    description: 'Door slot: a dark recess between metal strips, where a sliding door disappears',
    category: 'architecture',
    schema: slotSchema,
    overlay: true,
    anchors: {
        gap: 'top-left corner of the gap, between the strips',
        center: 'center of the slot',
    },
    render(p, { width, height, seed }) {
        // a horizontal slot is a vertical one, transposed: the lighting stays top-left
        const texture =
            p.direction === 'horizontal'
                ? renderVertical(p, height, width, seed).transposed()
                : renderVertical(p, width, height, seed);
        texture.anchors.center = [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }];
        return texture;
    },
});
