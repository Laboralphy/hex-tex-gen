import { FractalNoise } from '@laboralphy/algorithms';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { createGradient, sample, shade } from '../core/palette';
import {
    ageParam,
    DETAIL,
    FROM_AGE,
    palette,
    range,
    ratio,
    shadowGroup,
    size,
} from '../core/schema';
import { Texture } from '../core/Texture';
import { dropShadow, scaledOffset } from './common/drop-shadow';
import { metalWearBase, tarnishParam, type MetalWearBase } from './common/metal-wear';
import { MetalWeathering } from './common/MetalWeathering';
import { METAL_PALETTE, RUST_PALETTE } from './common/palettes';
import { defineGenerator } from './define';

/**
 * Parameters of the chain template. A patch is one chain: its fixture at the top of the
 * patch, the chain hanging down, centered.
 */
export const chainSchema = z.strictObject({
    size: size()
        .default([12, 48])
        .describe('own size of the patch: the chain hangs from its top, centered'),
    fixture: z
        .strictObject({
            size: z
                .number()
                .int()
                .min(3)
                .default(5)
                .describe('side of the wall plate, in pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('metal plate bolted to the wall, with an eye ring the chain hangs from'),
    link: z
        .strictObject({
            width: z
                .number()
                .int()
                .min(2)
                .default(3)
                .describe('width of a link seen face on, in pixels')
                .meta(DETAIL),
            length: z
                .number()
                .int()
                .min(3)
                .default(5)
                .describe('length of a link, in pixels; links overlap by 2 pixels')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('links, alternately seen face on and edge on'),
    length: range(ratio())
        .default([0.4, 1])
        .describe(
            '[min, max] share of the height below the fixture the chain drops, picked at random',
        ),
    cuff: ratio().default(0.4).describe('chance of a manacle at the end of the chain, in [0, 1]'),
    metal: z
        .strictObject({
            palette: palette()
                .default(METAL_PALETTE)
                .describe('metal colors, from darkest to lightest'),
            grain: ratio()
                .default(0.05)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('iron of the chain, lit from the top-left'),
    // a shadow close to the chain, about 2% of its height down and to the right
    shadow: shadowGroup('chain', 0.45, 1, true),
    age: ageParam(),
    rust: ratio().optional().describe(`share of the chain rusted, in [0, 1];${FROM_AGE}`),
    tarnish: tarnishParam(),
    broken: ratio()
        .optional()
        .describe(
            `chance the chain has snapped: shorter, ending with an open link, its manacle lost;${FROM_AGE}`,
        ),
});

export type ChainParams = z.output<typeof chainSchema>;

/**
 * Wear values of a chain, every one resolved.
 */
export type ChainWear = Pick<MetalWearBase, 'rust' | 'tarnish'> & { broken: number };

/**
 * Resolves the wear values of a chain: values set in the parameters win, the others are
 * derived from `age`.
 */
export function chainWear(p: ChainParams): ChainWear {
    // no rust streak: they run down from rivets, a chain has none
    const { rust, tarnish } = metalWearBase(
        { age: p.age, rust: { coverage: p.rust, streaks: 0 }, tarnish: p.tarnish },
        { coverage: [0, 0.08, 0.45], streaks: [0, 0, 0] },
    );
    return { rust, tarnish, broken: p.broken ?? atAge(p.age, [0, 0.05, 0.35]) };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_LENGTH = 3;
const SALT_CUFF = 4;
const SALT_BROKEN = 5;

/** pixels two consecutive links overlap by */
const OVERLAP = 2;

/**
 * A chain hanging from a plate bolted to the wall, links alternately face on and edge on,
 * ending, by chance, with a manacle. It rusts and snaps with age. The patch is transparent
 * around the chain, and holds one chain: place several patches for several chains.
 */
export const chain = defineGenerator({
    name: 'chain',
    description: 'Iron chain hanging from a wall plate, ending by chance with a manacle',
    category: 'dungeon',
    schema: chainSchema,
    overlay: true,
    anchors: {
        fixture: 'center of the wall plate',
        end: 'bottom of the chain, below its last link or its manacle',
    },
    render(p, { width, height, seed }) {
        const wear = chainWear(p);
        // palette position of each metal pixel, NaN elsewhere
        const tones = new Float32Array(width * height).fill(NaN);
        const put = (x: number, y: number, tone: number) => {
            if (x >= 0 && y >= 0 && x < width && y < height) {
                tones[y * width + x] = tone;
            }
        };
        const cx = Math.floor(width / 2);

        // an outline of w x h pixels, corners cut, lit from the top-left; `open` leaves a
        // gap at the bottom right, for a snapped link
        const ring = (xc: number, y: number, w: number, h: number, open = false) => {
            const left = xc - Math.floor(w / 2);
            for (let j = 0; j < h; ++j) {
                for (let i = 0; i < w; ++i) {
                    const edgeX = i === 0 || i === w - 1;
                    const edgeY = j === 0 || j === h - 1;
                    if (!(edgeX || edgeY) || (edgeX && edgeY)) {
                        continue;
                    }
                    if (open && (j === h - 1 || (i === w - 1 && j >= h / 2))) {
                        continue;
                    }
                    const tone = i === 0 ? 0.85 : i === w - 1 ? 0.3 : j === 0 ? 0.7 : 0.4;
                    put(left + i, y + j, tone);
                }
            }
        };
        // a link edge on: a bar, 2 pixels wide for wide links
        const bar = (xc: number, y: number, w: number, h: number) => {
            const thick = w >= 5 ? 2 : 1;
            for (let j = 0; j < h; ++j) {
                for (let i = 0; i < thick; ++i) {
                    const tone = j === 0 ? 0.8 : j === h - 1 ? 0.35 : i === 0 ? 0.62 : 0.4;
                    put(xc - (thick > 1 ? 1 : 0) + i, y + j, tone);
                }
            }
        };

        // the wall plate, bevelled, a bolt in its middle, and the eye ring under it
        const plate = p.fixture.size;
        const plateLeft = cx - Math.floor(plate / 2);
        for (let j = 0; j < plate; ++j) {
            for (let i = 0; i < plate; ++i) {
                const tone =
                    i === 0 || j === 0 ? 0.75 : i === plate - 1 || j === plate - 1 ? 0.3 : 0.5;
                put(plateLeft + i, j, tone);
            }
        }
        const bolt = Math.floor(plate / 2);
        put(cx, bolt, 0.95);
        put(cx + 1, bolt + 1, 0.2);
        const eye = plate - 1;
        ring(cx, eye, 3, 4);

        // the chain: its length, and how it ends
        const { width: lw, length: lh } = p.link;
        const pitch = Math.max(1, lh - OVERLAP);
        const start = eye + 2;
        const room = height - start;
        const broken = hash(seed, SALT_BROKEN) < wear.broken;
        const cuffed = !broken && hash(seed, SALT_CUFF) < p.cuff;
        const cuffWidth = 2 * lw + 1;
        const cuffHeight = 2 * lw;
        let drop = Math.round(hashRange(p.length[0], p.length[1], seed, SALT_LENGTH) * room);
        if (broken) {
            drop = Math.round(drop * hashRange(0.3, 0.8, seed, SALT_BROKEN, 1));
        }
        const tail = cuffed ? cuffHeight - 1 : 0;
        const links = Math.max(1, Math.floor((Math.min(drop, room) - lh - tail) / pitch) + 1);

        // the manacle first, under the last link, which holds it
        const last = start + (links - 1) * pitch;
        let bottom = last + lh - 1;
        if (cuffed) {
            const top = last + lh - 2;
            ring(cx, top, cuffWidth, cuffHeight);
            // the lock: a block at the bottom of the manacle
            put(cx, top + cuffHeight - 1, 0.75);
            put(cx + 1, top + cuffHeight - 1, 0.3);
            put(cx, top + cuffHeight, 0.35);
            bottom = top + cuffHeight;
        }
        // links edge on first, then the ones face on over them: odd links are face on,
        // the first one edge on, through the eye ring
        for (const faceOn of [false, true]) {
            for (let k = 0; k < links; ++k) {
                if ((k % 2 === 1) !== faceOn) {
                    continue;
                }
                const y = start + k * pitch;
                const snapped = broken && k === links - 1;
                if (faceOn) {
                    ring(cx, y, lw, lh, snapped);
                } else {
                    bar(cx, y, lw, lh);
                }
            }
        }

        // colors: the metal, weathered
        const metal = createGradient(p.metal.palette);
        const rustNoise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 0),
            period: [1, Math.max(1, Math.round(height / 8))],
            octaves: 3,
        });
        const tarnishNoise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 1),
            period: 3,
            octaves: 2,
        });
        const weathering = new MetalWeathering(width, height, wear, RUST_PALETTE, tarnishNoise);
        const body = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const tone = tones[y * width + x];
                if (Number.isNaN(tone)) {
                    continue;
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.metal.grain;
                const color = shade(sample(metal, tone), grain);
                const u = x / width;
                const v = y / height;
                body.setPixel(x, y, weathering.apply(color, x, y, rustNoise.sample(u, v), u, v));
            }
        }

        const texture = dropShadow(
            body,
            (i) => !Number.isNaN(tones[i]),
            scaledOffset(p.shadow.offset, height / p.size[1]),
            p.shadow.opacity,
        );
        texture.anchors = {
            fixture: [{ x: cx, y: bolt }],
            end: [{ x: cx, y: Math.min(height - 1, bottom + 1) }],
        };
        return texture;
    },
});
