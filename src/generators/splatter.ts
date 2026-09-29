import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';
import { hash, hashRange } from '../core/hash';
import { shade } from '../core/palette';
import { color, DETAIL, ESSENTIAL, LAYOUT, range, ratio, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { defineGenerator } from './define';

/**
 * Parameters of the splatter template. "Layout" values are expressed in pixels at the
 * patch's own `size` and scale with it. Every drop stays inside the patch.
 */
export const splatterSchema = z.strictObject({
    size: size()
        .default([32, 32])
        .describe('own size of the patch in pixels; layout values are expressed at this size'),
    impact: z
        .strictObject({
            radius: z
                .number()
                .min(0.5)
                .default(4)
                .describe('radius of the pool where the liquid hit, clamped to the patch')
                .meta(LAYOUT),
            lobes: z
                .number()
                .int()
                .min(0)
                .default(7)
                .describe('smaller circles overlapping the rim of the pool, making it ragged'),
        })
        .prefault({})
        .describe('the pool at the point of impact'),
    spikes: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(6)
                .describe('streaks shooting out of the pool, tapering to a droplet'),
            length: range(ratio())
                .default([0.3, 0.75])
                .describe(
                    '[min, max] length of a streak, as a share of the room between the pool and the patch edge',
                ),
        })
        .prefault({})
        .describe('streaks radiating from the pool'),
    drops: z
        .strictObject({
            count: z
                .number()
                .int()
                .min(0)
                .default(28)
                .describe('droplets scattered around the pool, denser near it'),
            radius: range(z.number().min(0))
                .default([0.5, 1.8])
                .describe('[min, max] radius of a droplet; the farther, the smaller')
                .meta(LAYOUT),
            spread: ratio()
                .default(0.9)
                .describe(
                    'how far the droplets fly, as a share of the room between the pool and the patch edge, in [0, 1]',
                ),
            streaks: ratio()
                .default(0.35)
                .describe(
                    'share of the droplets drawn out along their flight into a short tapering tail, in [0, 1]',
                ),
        })
        .prefault({})
        .describe('droplets around the pool'),
    direction: z
        .strictObject({
            angle: z
                .number()
                .default(60)
                .describe(
                    'direction the liquid was thrown, in degrees: 0 to the right, 90 downwards',
                )
                .meta(ESSENTIAL),
            bias: ratio()
                .default(0.3)
                .describe(
                    'how much the splash leans that way, in [0, 1]: 0 is a drop fallen straight on the wall, 1 a jet thrown sideways',
                )
                .meta(ESSENTIAL),
        })
        .prefault({})
        .describe('direction of the splash'),
    liquid: z
        .strictObject({
            color: color().default('#5a1e12').describe('color of the liquid: blood by default'),
            alpha: ratio()
                .default(0.9)
                .describe('alpha of the liquid, in [0, 1]: lower for a thin or watery liquid'),
            rim: ratio().default(0.25).describe('darkening of the edges of the stains, in [0, 1]'),
            gloss: ratio()
                .default(0.2)
                .describe(
                    'highlight on the top-left of the larger stains, in [0, 1]: 0 for a dry stain',
                ),
            grain: ratio()
                .default(0.06)
                .describe('random brightness variation between pixels, in [0, 1]'),
        })
        .prefault({})
        .describe('the liquid'),
    highlight: z
        .number()
        .min(0)
        .default(2)
        .describe('radius from which a stain gets a gloss highlight, in pixels')
        .meta(DETAIL),
});

export type SplatterParams = z.output<typeof splatterSchema>;

// each random decision draws from its own sequence
const SALT_LOBE = 1;
const SALT_SPIKE = 2;
const SALT_DROP = 3;
const SALT_GRAIN = 4;

/** share of the smaller side of the patch the pool is pushed back against the throw */
const RECOIL = 0.2;

/** a filled circle, in pixels of the rendered patch */
type Circle = { x: number; y: number; r: number };

/** the angle, brought into [-π, π] */
function wrapAngle(a: number): number {
    return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/**
 * A splash of liquid: a ragged pool where it hit, streaks shooting out of it and droplets
 * scattered around, denser and larger near the pool, all of them filled circles. Blood by
 * default; another color and alpha make it any other liquid. The splash never crosses the
 * edges of the patch, and the patch is transparent elsewhere.
 */
export const splatter = defineGenerator({
    name: 'splatter',
    description: 'Splash of blood, or of any liquid: a ragged pool, streaks and droplets',
    category: 'dungeon',
    schema: splatterSchema,
    overlay: true,
    render(p, { width, height, seed }) {
        const scale = Math.min(width / p.size[0], height / p.size[1]);
        const direction = (p.direction.angle * Math.PI) / 180;
        const bias = p.direction.bias;
        const [dx, dy] = [Math.cos(direction), Math.sin(direction)];

        // the pool, pushed back against the throw so that the splash has room to lean
        const recoil = RECOIL * bias * Math.min(width, height);
        const cx = width / 2 - dx * recoil;
        const cy = height / 2 - dy * recoil;
        // distance from the pool center to the patch edge, along an angle
        const room = (a: number) => {
            const [ux, uy] = [Math.cos(a), Math.sin(a)];
            const tx = ux > 0 ? (width - cx) / ux : ux < 0 ? -cx / ux : Infinity;
            const ty = uy > 0 ? (height - cy) / uy : uy < 0 ? -cy / uy : Infinity;
            return Math.min(tx, ty);
        };
        // whether a circle lies inside the patch
        const fits = (c: Circle) =>
            c.x - c.r >= 0 && c.y - c.r >= 0 && c.x + c.r <= width && c.y + c.r <= height;
        // an angle drawn around the pool, gathered towards the direction of the throw
        const lean = (u: number) => direction + wrapAngle(u * 2 * Math.PI) * (1 - 0.7 * bias);
        // share of its room a streak or a droplet flies along an angle: farther with the
        // throw, shorter against it
        const carry = (a: number) => 1 - bias * 0.7 * ((1 - Math.cos(a - direction)) / 2);

        const circles: Circle[] = [];
        const add = (c: Circle) => {
            if (fits(c)) {
                circles.push(c);
            }
        };
        // a chain of circles along an angle, tapering from a radius to half a pixel
        const streak = (a: number, from: number, to: number, r0: number) => {
            const [ux, uy] = [Math.cos(a), Math.sin(a)];
            for (let d = from; d <= to;) {
                const r = Math.max(0.5, r0 * (1 - (d - from) / Math.max(1, to - from)));
                const c = { x: cx + ux * d, y: cy + uy * d, r };
                if (!fits(c)) {
                    break;
                }
                circles.push(c);
                d += Math.max(0.5, r * 0.8);
            }
        };

        // the pool, as large as the patch allows, and lobes around its rim
        const radius = Math.max(
            0.5,
            Math.min(
                p.impact.radius * scale,
                cx - 0.5,
                cy - 0.5,
                width - cx - 0.5,
                height - cy - 0.5,
            ),
        );
        add({ x: cx, y: cy, r: radius });
        for (let j = 0; j < p.impact.lobes; ++j) {
            const a = ((j + hash(seed, SALT_LOBE, j, 0)) / p.impact.lobes) * 2 * Math.PI;
            const d = radius * hashRange(0.6, 1, seed, SALT_LOBE, j, 1);
            const r = radius * hashRange(0.3, 0.55, seed, SALT_LOBE, j, 2);
            add({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r });
        }

        // spikes, from inside the pool to a droplet at their tip
        for (let j = 0; j < p.spikes.count; ++j) {
            const a = lean(
                (j + hashRange(0.2, 0.8, seed, SALT_SPIKE, j, 0)) / p.spikes.count - 0.5,
            );
            const length =
                radius +
                (room(a) - radius) *
                    carry(a) *
                    hashRange(p.spikes.length[0], p.spikes.length[1], seed, SALT_SPIKE, j, 1);
            const width0 = radius * hashRange(0.25, 0.4, seed, SALT_SPIKE, j, 2);
            streak(a, radius * 0.7, length, width0);
            const tip = Math.max(0.5, width0 * hashRange(0.5, 0.9, seed, SALT_SPIKE, j, 3));
            const d = length + tip + hashRange(0.5, 2, seed, SALT_SPIKE, j, 4) * scale;
            add({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: tip });
        }

        // droplets: denser and larger near the pool
        const [rMin, rMax] = p.drops.radius.map((r) => r * scale);
        for (let i = 0; i < p.drops.count; ++i) {
            const a = lean(hash(seed, SALT_DROP, i, 0) - 0.5);
            const t = hash(seed, SALT_DROP, i, 1) ** 1.5;
            const r = Math.max(
                0.5,
                rMin + (rMax - rMin) * (1 - t) * hashRange(0.5, 1, seed, SALT_DROP, i, 2),
            );
            const reach = Math.max(radius, (room(a) - r) * p.drops.spread * carry(a));
            const d = radius + (reach - radius) * t;
            if (hash(seed, SALT_DROP, i, 3) < p.drops.streaks) {
                // drawn out along its flight, its tail pointing the way it went
                streak(a, d, d + r * hashRange(2, 4, seed, SALT_DROP, i, 4), r);
            } else {
                add({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r });
            }
        }

        // pixels covered by the circles, and the lit ones on the larger stains
        const cover = new Uint8Array(width * height);
        const lit = new Uint8Array(width * height);
        const fill = (target: Uint8Array, c: Circle) => {
            // the pixel under the center, even for circles smaller than a pixel
            target[Math.floor(c.y) * width + Math.floor(c.x)] = 1;
            for (let y = Math.floor(c.y - c.r); y <= Math.ceil(c.y + c.r); ++y) {
                for (let x = Math.floor(c.x - c.r); x <= Math.ceil(c.x + c.r); ++x) {
                    const inside = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= c.r;
                    if (inside && x >= 0 && y >= 0 && x < width && y < height) {
                        target[y * width + x] = 1;
                    }
                }
            }
        };
        for (const c of circles) {
            fill(cover, c);
        }
        if (p.liquid.gloss > 0) {
            for (const c of circles.filter((c) => c.r >= p.highlight)) {
                fill(lit, { x: c.x - c.r * 0.35, y: c.y - c.r * 0.35, r: c.r * 0.3 });
            }
        }

        const base = Rainbow.parse(p.liquid.color);
        const rgba = Rainbow.convertToRGBA(base);
        const liquid = Rainbow.fromRGBA({ ...rgba, a: rgba.a * p.liquid.alpha });
        const covered = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < width && y < height && cover[y * width + x] === 1;
        const texture = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const k = y * width + x;
                if (!cover[k]) {
                    continue;
                }
                const edge =
                    !covered(x - 1, y) ||
                    !covered(x + 1, y) ||
                    !covered(x, y - 1) ||
                    !covered(x, y + 1);
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.liquid.grain;
                const light = edge ? 1 - p.liquid.rim : lit[k] ? 1 + p.liquid.gloss : 1;
                texture.setPixel(x, y, shade(liquid, grain * light));
            }
        }
        return texture;
    },
});
