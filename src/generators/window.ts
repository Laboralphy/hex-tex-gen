import { Bresenham, FractalNoise } from '@laboralphy/algorithms';
import { Rainbow, type Color32 } from '@laboralphy/rainbow';
import { z } from 'zod';
import { atAge } from '../core/age';
import { hash, hashRange, hashSeed } from '../core/hash';
import { clamp } from '../core/math';
import { createGradient, mixRGBA, sample, shade } from '../core/palette';
import {
    ageParam,
    color,
    DETAIL,
    FROM_AGE,
    LAYOUT,
    palette,
    ratio,
    shadowGroup,
    size,
} from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { dropShadow } from './common/drop-shadow';
import { metalWearBase, rustGroup, tarnishParam, type MetalWearBase } from './common/metal-wear';
import { MetalWeathering } from './common/MetalWeathering';
import { METAL_PALETTE, WOOD_PALETTE } from './common/palettes';
import { splitSpan } from './common/grid';
import { weatherWood } from './common/wood';
import { WoodGrain } from './common/WoodGrain';
import { defineGenerator } from './define';

/**
 * Parameters of the window template. The whole patch is the window, frame included: lay
 * it over an opening, like bars.
 */
export const windowSchema = z.strictObject({
    size: size().default([32, 40]).describe('own size of the window, frame included'),
    panes: z
        .strictObject({
            columns: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('panes across the window')
                .meta(LAYOUT),
            rows: z.number().int().min(1).default(2).describe('panes down the window').meta(LAYOUT),
        })
        .prefault({})
        .describe('glass panes, separated by the bars of the frame'),
    frame: z
        .strictObject({
            material: z.enum(['wood', 'metal']).default('wood').describe('material of the frame'),
            width: z
                .number()
                .int()
                .min(1)
                .default(3)
                .describe('width of the outer frame, in pixels')
                .meta(DETAIL),
            bars: z
                .number()
                .int()
                .min(1)
                .default(2)
                .describe('width of the bars between the panes, in pixels')
                .meta(DETAIL),
            wood: palette().default(WOOD_PALETTE).describe('wood colors, from darkest to lightest'),
            metal: palette()
                .default(METAL_PALETTE)
                .describe('metal colors, from darkest to lightest'),
            grain: ratio()
                .default(0.06)
                .describe('random brightness variation between pixels, in [0, 1]')
                .meta(DETAIL),
        })
        .prefault({})
        .describe('frame around and between the panes, its edges lit from the top-left'),
    glass: z
        .strictObject({
            color: color().default('#a8c4d0').describe('color of the glass'),
            alpha: ratio().default(0.15).describe('alpha of the glass, in [0, 1]'),
            streaks: z
                .strictObject({
                    count: z
                        .number()
                        .int()
                        .min(0)
                        .default(2)
                        .describe('bright streaks across each pane'),
                    color: color().default('#ffffff').describe('color of the streaks'),
                    alpha: ratio().default(0.35).describe('alpha of the streaks, in [0, 1]'),
                    width: z
                        .number()
                        .min(0)
                        .default(3)
                        .describe('width of the widest streak, in pixels')
                        .meta(DETAIL),
                    blur: z
                        .number()
                        .min(0)
                        .default(1.5)
                        .describe('softness of their edges, in pixels')
                        .meta(DETAIL),
                    angle: z
                        .number()
                        .min(-90)
                        .max(90)
                        .default(45)
                        .describe(
                            'angle of the streaks from the vertical, in degrees: positive leans right',
                        ),
                })
                .prefault({})
                .describe('reflections: blurred diagonal streaks across the panes'),
        })
        .prefault({})
        .describe('glass of the panes, translucent'),
    shadow: shadowGroup('window', 0.45, 0).describe(
        'shadow of the frame on the back of the opening, the light coming from the top-left; none by default',
    ),
    age: ageParam(),
    weathering: ratio()
        .optional()
        .describe(`wooden frame turned silver-grey by the weather, in [0, 1];${FROM_AGE}`),
    rust: rustGroup('share of a metal frame rusted, spreading from its joints'),
    tarnish: tarnishParam(),
    dirt: ratio()
        .optional()
        .describe(
            `grime on the glass, in [0, 1]: more opaque and brownish, heavier towards the corners;${FROM_AGE}`,
        ),
    cracked: ratio().optional().describe(`ratio of cracked panes, in [0, 1];${FROM_AGE}`),
    broken: ratio()
        .optional()
        .describe(
            `ratio of broken panes, their glass gone but for shards along the frame, in [0, 1];${FROM_AGE}`,
        ),
});

export type WindowParams = z.output<typeof windowSchema>;

/**
 * Wear values of a window, every one resolved.
 */
export type WindowWear = Omit<MetalWearBase, 'scratches'> & {
    weathering: number;
    dirt: number;
    cracked: number;
    broken: number;
};

/**
 * Resolves the wear values of a window: values set in the parameters win, the others are
 * derived from `age`.
 */
export function windowWear(p: WindowParams): WindowWear {
    const a = p.age;
    const { rust, tarnish } = metalWearBase(p, {
        coverage: [0, 0.05, 0.5],
        streaks: [0, 0.2, 0.6],
    });
    return {
        rust,
        tarnish,
        weathering: p.weathering ?? atAge(a, [0, 0.1, 0.6]),
        dirt: p.dirt ?? atAge(a, [0, 0.15, 0.7]),
        cracked: p.cracked ?? atAge(a, [0, 0.1, 0.4]),
        broken: p.broken ?? atAge(a, [0, 0.03, 0.35]),
    };
}

// each random decision draws from its own sequence
const SALT_NOISE = 1;
const SALT_GRAIN = 2;
const SALT_STREAK = 3;
const SALT_CRACK = 4;
const SALT_BROKEN = 5;
const SALT_SHARD = 6;
const SALT_RUST = 7;

/** color the dirt turns the glass to */
const DIRT = Rainbow.convertToRGBA(Rainbow.parse('#4e4232'));

/** alpha of fully dirty glass */
const DIRT_ALPHA = 0.85;

/** maximum depth of the shards left along the frame of a broken pane, in pixels */
const SHARD_DEPTH = 4;

/** a pane: its rectangle, [x0, x1) × [y0, y1), and its place in the grid */
type Pane = { r: number; c: number; x0: number; x1: number; y0: number; y1: number };

/**
 * Glazed window: a wooden or metal frame around panes of translucent glass crossed by
 * bright reflections. With age, the wood weathers or the metal rusts, the glass gets
 * dirty, and panes crack or break. Laid over an `opening`, like bars.
 */
export const glassWindow = defineGenerator({
    name: 'window',
    description: 'Glazed window: a wooden or metal frame around translucent panes of glass',
    category: 'civilized',
    schema: windowSchema,
    overlay: true,
    anchors: {
        panes: 'top-left corner of each pane, row by row',
        corners:
            'corners of each pane, as corner points: top-left, top-right, bottom-left, bottom-right',
        center: 'center of the window',
    },
    render(p, { width, height, seed }) {
        const wear = windowWear(p);
        const columns = splitSpan(width, p.frame.width, p.frame.bars, p.panes.columns);
        const rows = splitSpan(height, p.frame.width, p.frame.bars, p.panes.rows);
        const panes: Pane[] = rows.flatMap(([y0, y1], r) =>
            columns.map(([x0, x1], c) => ({ r, c, x0, x1, y0, y1 })),
        );
        // pane index of each pixel, -1 on the frame
        const paneOf = new Int32Array(width * height).fill(-1);
        panes.forEach(({ x0, x1, y0, y1 }, id) => {
            for (let y = y0; y < y1; ++y) {
                for (let x = x0; x < x1; ++x) {
                    paneOf[y * width + x] = id;
                }
            }
        });
        const inPane = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < width && y < height && paneOf[y * width + x] >= 0;
        const body = new Texture(width, height);

        // the frame: stiles running the whole height, rails and transoms across them,
        // mullions between; the grain follows each member
        const wood = p.frame.material === 'wood';
        const frameColors = createGradient(wood ? p.frame.wood : p.frame.metal);
        const woodGrain = new WoodGrain(hashSeed(seed, SALT_NOISE, 0), width, height);
        const isRail = (y: number) =>
            y < p.frame.width ||
            y >= height - p.frame.width ||
            rows.some(([, end], i) => i + 1 < rows.length && y >= end && y < rows[i + 1][0]);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                if (paneOf[y * width + x] >= 0) {
                    continue;
                }
                const stile = x < p.frame.width || x >= width - p.frame.width;
                const horizontal = !stile && isRail(y);
                // grain along the member; brushed metal is smoother
                let tone = wood
                    ? woodGrain.tone(x, y, horizontal)
                    : 0.55 + 0.25 * (woodGrain.sample(x, y, horizontal) - 0.5);
                // edges lit from the top-left: the outer edges of the window, and the
                // edges of the members along the panes
                if (x === 0 || y === 0 || inPane(x - 1, y) || inPane(x, y - 1)) {
                    tone += 0.25;
                } else if (
                    x === width - 1 ||
                    y === height - 1 ||
                    inPane(x + 1, y) ||
                    inPane(x, y + 1)
                ) {
                    tone -= 0.25;
                }
                const grain = 1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * p.frame.grain;
                let rgba = Rainbow.convertToRGBA(shade(sample(frameColors, tone), grain));
                if (wood && wear.weathering > 0) {
                    rgba = weatherWood(rgba, wear.weathering);
                }
                body.setPixel(x, y, Rainbow.fromRGBA({ ...rgba, a: 1 }));
            }
        }

        // a metal frame rusts, streaks running down from the joints of its bars
        if (!wood) {
            const tarnishNoise = new FractalNoise({
                seed: hashSeed(seed, SALT_NOISE, 1),
                period: 3,
                octaves: 2,
            });
            const rustNoise = new FractalNoise({
                seed: hashSeed(seed, SALT_NOISE, 2),
                period: 4,
                octaves: 3,
            });
            const weathering = new MetalWeathering(
                width,
                height,
                wear,
                p.rust.palette,
                tarnishNoise,
            );
            const joints: AnchorPoint[] = panes.map(({ x1, y1 }) => ({ x: x1, y: y1 }));
            weathering.addStreaks(joints, seed, SALT_RUST, (x, y) =>
                x < width && y < height && paneOf[y * width + x] < 0 ? y * width + x : -1,
            );
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    if (paneOf[y * width + x] < 0) {
                        const u = x / width;
                        const v = y / height;
                        const n = rustNoise.sample(u, v);
                        body.setPixel(x, y, weathering.apply(body.getPixel(x, y), x, y, n, u, v));
                    }
                }
            }
        }

        // the glass: translucent, crossed by blurred streaks, dirty with age; broken
        // panes keep shards along the frame, cracked ones get bright cracks
        const glass = Rainbow.convertToRGBA(Rainbow.parse(p.glass.color));
        const streakColor = Rainbow.convertToRGBA(Rainbow.parse(p.glass.streaks.color));
        const streaks = p.glass.streaks;
        const angle = (streaks.angle * Math.PI) / 180;
        const [nx, ny] = [Math.cos(angle), Math.sin(angle)];
        const dirtNoise = new FractalNoise({
            seed: hashSeed(seed, SALT_NOISE, 3),
            period: 3,
            octaves: 3,
        });
        const mix = (a: number, b: number, t: number) => a + (b - a) * t;
        panes.forEach((pane, id) => {
            const { r, c, x0, x1, y0, y1 } = pane;
            const w = x1 - x0;
            const h = y1 - y0;
            // streaks: bands at a distance d along the normal of their direction
            const ds = [0, w].flatMap((x) => [0, h].map((y) => x * nx + y * ny));
            const [dMin, dMax] = [Math.min(...ds), Math.max(...ds)];
            const bands = Array.from({ length: streaks.count }, (_, k) => ({
                d: mix(dMin, dMax, hashRange(0.2, 0.8, seed, SALT_STREAK, r, c, k, 0)),
                half:
                    (streaks.width *
                        (k === 0 ? 1 : hashRange(0.3, 0.7, seed, SALT_STREAK, r, c, k, 1))) /
                    2,
            }));
            const broken = hash(seed, SALT_BROKEN, r, c) < wear.broken;
            for (let y = y0; y < y1; ++y) {
                for (let x = x0; x < x1; ++x) {
                    const lx = x - x0 + 0.5;
                    const ly = y - y0 + 0.5;
                    // distance to the nearest edge of the pane, and the position along it
                    const edges = [
                        [lx, ly],
                        [w - lx, ly],
                        [ly, lx],
                        [h - ly, lx],
                    ];
                    const [edge, alongEdge] = edges.reduce((a, b) => (b[0] < a[0] ? b : a));
                    if (broken) {
                        // jagged shards: their depth varies along the edge
                        const i = Math.floor(alongEdge / 2);
                        const t = alongEdge / 2 - i;
                        const depth =
                            SHARD_DEPTH *
                                mix(
                                    hash(seed, SALT_SHARD, r, c, Math.round(edge), i),
                                    hash(seed, SALT_SHARD, r, c, Math.round(edge), i + 1),
                                    t,
                                ) -
                            1;
                        if (edge > depth) {
                            continue;
                        }
                    }
                    let intensity = 0;
                    const d = lx * nx + ly * ny;
                    for (const band of bands) {
                        const off = Math.abs(d - band.d) - band.half;
                        const f =
                            streaks.blur > 0 ? clamp(1 - off / streaks.blur) : off <= 0 ? 1 : 0;
                        intensity = Math.max(intensity, f * f * (3 - 2 * f));
                    }
                    // dirt: patchy, heavier towards the corners and edges of the pane
                    const nearEdge = 1 - clamp(edge / (0.35 * Math.min(w, h)));
                    const dirt =
                        wear.dirt *
                        clamp(0.35 + 0.65 * nearEdge) *
                        (0.5 + dirtNoise.sample(x / width, y / height));
                    const f = clamp(dirt);
                    const alpha = mix(
                        mix(p.glass.alpha, streaks.alpha, intensity * (1 - f)),
                        DIRT_ALPHA,
                        f,
                    );
                    const rgb = mixRGBA(mixRGBA(glass, streakColor, intensity), DIRT, f);
                    body.setPixel(x, y, Rainbow.fromRGBA({ ...rgb, a: alpha }));
                }
            }

            // cracks: lines radiating from an impact, brighter than the glass
            if (!broken && hash(seed, SALT_CRACK, r, c, 0) < wear.cracked) {
                const cx = x0 + w * hashRange(0.25, 0.75, seed, SALT_CRACK, r, c, 1);
                const cy = y0 + h * hashRange(0.25, 0.75, seed, SALT_CRACK, r, c, 2);
                const lines = 3 + Math.floor(hash(seed, SALT_CRACK, r, c, 3) * 3);
                const crack: Color32 = Rainbow.fromRGBA({ ...streakColor, a: 0.55 });
                for (let k = 0; k < lines; ++k) {
                    const a = ((k + hash(seed, SALT_CRACK, r, c, 4, k)) / lines) * 2 * Math.PI;
                    const length =
                        Math.max(w, h) * hashRange(0.3, 0.8, seed, SALT_CRACK, r, c, 5, k);
                    Bresenham.line(
                        Math.round(cx),
                        Math.round(cy),
                        Math.round(cx + Math.cos(a) * length),
                        Math.round(cy + Math.sin(a) * length),
                        (x, y) => {
                            if (!inPane(x, y) || paneOf[y * width + x] !== id) {
                                return false;
                            }
                            body.setPixel(x, y, crack);
                            return true;
                        },
                    );
                }
            }
        });

        const texture = dropShadow(body, (i) => paneOf[i] < 0, p.shadow.offset, p.shadow.opacity);
        texture.anchors = {
            panes: panes.map(({ x0, y0 }) => ({ x: x0, y: y0 })),
            corners: panes.flatMap(({ x0, x1, y0, y1 }) => [
                { x: x0, y: y0, corner: 'top-left' as const },
                { x: x1 - 1, y: y0, corner: 'top-right' as const },
                { x: x0, y: y1 - 1, corner: 'bottom-left' as const },
                { x: x1 - 1, y: y1 - 1, corner: 'bottom-right' as const },
            ]),
            center: [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }],
        };
        return texture;
    },
});
