import { describe, expect, it } from 'vitest';
import { dirt, grass, grassWear, gravel, sand, type GrassParams, type Texture } from '../src';

const rgb = (t: Texture, i: number) => [t.data[i * 4], t.data[i * 4 + 1], t.data[i * 4 + 2]];
const lum = (t: Texture) => {
    let sum = 0;
    for (let i = 0; i < t.width * t.height; ++i) {
        const [r, g, b] = rgb(t, i);
        sum += r + g + b;
    }
    return sum / (3 * t.width * t.height);
};
/** share of the pixels matching a test */
const share = (t: Texture, test: (r: number, g: number, b: number) => boolean) => {
    let n = 0;
    for (let i = 0; i < t.width * t.height; ++i) {
        const [r, g, b] = rgb(t, i);
        n += test(r, g, b) ? 1 : 0;
    }
    return n / (t.width * t.height);
};
const earthy = (r: number, g: number) => r > g;
const green = (r: number, g: number, b: number) => g > r + 10 && g > b;

describe('dirt', () => {
    it('darkens when wet', () => {
        expect(lum(dirt.generate({ seed: 1, wetness: 1 }))).toBeLessThan(
            lum(dirt.generate({ seed: 1 })) * 0.75,
        );
    });

    it('strews pebbles and clods on its blotches', () => {
        const bare = dirt.generate({ seed: 1, pebbles: 0, clods: 0 });
        expect(dirt.generate({ seed: 1, pebbles: 10 }).data).not.toEqual(bare.data);
        expect(dirt.generate({ seed: 1, pebbles: 0, clods: 20 }).data).not.toEqual(bare.data);
    });

    it('is earth-colored', () => {
        expect(share(dirt.generate({ seed: 2 }), earthy)).toBeGreaterThan(0.95);
    });
});

describe('grass', () => {
    it('covers the ground with blades when young', () => {
        const t = grass.generate({ seed: 1, age: 0 });
        expect(share(t, green)).toBeGreaterThan(0.9);
    });

    it('wears down to bare earth with age', () => {
        const shares = [0, 0.3, 0.6, 1].map((age) =>
            share(grass.generate({ seed: 1, age }), earthy),
        );
        for (let i = 1; i < shares.length; ++i) {
            expect(shares[i]).toBeGreaterThan(shares[i - 1]);
        }
        expect(shares[3]).toBeGreaterThan(0.3);
    });

    it('dries its blades to straw', () => {
        const yellow = (r: number, g: number, b: number) => r > 120 && g > 110 && b < 110;
        const lush = grass.generate({ seed: 1, age: 0 });
        const dry = grass.generate({ seed: 1, age: 0, dryness: 1 });
        expect(share(dry, yellow)).toBeGreaterThan(share(lush, yellow) + 0.1);
    });

    it('strews flowers, never on bare earth', () => {
        const white = (r: number, g: number, b: number) => r > 200 && g > 200 && b > 180;
        const flowered = grass.generate({
            seed: 1,
            age: 0,
            flowers: { density: 10, colors: ['#ffffff'] },
        });
        expect(share(flowered, white)).toBeGreaterThan(0);
        expect(share(grass.generate({ seed: 1, age: 0 }), white)).toBe(0);
    });

    it('derives its wear from age, explicit values winning', () => {
        const defaults = grass.defaults as GrassParams;
        expect(grassWear({ ...defaults, age: 1 }).bare).toBeGreaterThan(0.5);
        expect(grassWear({ ...defaults, age: 1, bare: 0 }).bare).toBe(0);
        expect(grassWear({ ...defaults, age: 0 }).dryness).toBe(0);
    });
});

/** variance of the brightness of a row */
function rowVariance(t: Texture, x: number): number {
    const values = Array.from({ length: t.height }, (_, y) => {
        const i = (y * t.width + x) * 4;
        return t.data[i] + t.data[i + 1] + t.data[i + 2];
    });
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

describe('sand', () => {
    it('is rippled by the wind: brightness waves down the patch', () => {
        const flat = { specks: 0, grain: 0 };
        const rippled = sand.generate({ seed: 1, ...flat });
        const smooth = sand.generate({ seed: 1, ...flat, ripples: { count: 0 } });
        expect(rowVariance(rippled, 10)).toBeGreaterThan(rowVariance(smooth, 10) * 2);
    });

    it('tiles: its ripples cross it a whole number of times', () => {
        // the first and last rows, and columns, differ as little as neighbouring ones
        const t = sand.generate({ seed: 2, specks: 0, grain: 0 });
        const step = (a: number, b: number) => {
            let sum = 0;
            for (let x = 0; x < t.width; ++x) {
                sum += Math.abs(t.data[(a * t.width + x) * 4] - t.data[(b * t.width + x) * 4]);
            }
            return sum / t.width;
        };
        expect(step(t.height - 1, 0)).toBeLessThan(step(1, 0) * 3 + 4);
    });

    it('darkens when wet, is strewn with specks', () => {
        expect(lum(sand.generate({ seed: 1, wetness: 1 }))).toBeLessThan(
            lum(sand.generate({ seed: 1 })) * 0.75,
        );
        expect(sand.generate({ seed: 1, specks: 0 }).data).not.toEqual(
            sand.generate({ seed: 1 }).data,
        );
    });
});

describe('gravel', () => {
    it('packs grey stones, earth showing between them', () => {
        const t = gravel.generate({ seed: 1 });
        const grey = (r: number, _: number, b: number) => Math.abs(r - b) < 20;
        expect(share(t, grey)).toBeGreaterThan(0.6);
        // earth: much redder than blue, unlike the grey stones
        const brown = (r: number, _: number, b: number) => r > b + 22;
        expect(share(t, brown)).toBeGreaterThan(0.03);
        const packed = gravel.generate({ seed: 1, stones: { gap: 0, relief: 0 } });
        expect(share(packed, brown)).toBeLessThan(share(t, brown));
    });

    it('rounds its stones, lit from the top-left', () => {
        // within a stone, a pixel is brighter than its lower-right neighbour on average
        const slope = (t: Texture) => {
            const at = (x: number, y: number) => {
                const i = (y * t.width + x) * 4;
                return [t.data[i], t.data[i + 1], t.data[i + 2]];
            };
            let sum = 0;
            let n = 0;
            for (let y = 0; y < t.height - 1; ++y) {
                for (let x = 0; x < t.width - 1; ++x) {
                    const [r, g, b] = at(x, y);
                    const [r2, g2, b2] = at(x + 1, y + 1);
                    if (Math.abs(r - b) < 20 && Math.abs(r2 - b2) < 20) {
                        sum += r + g + b - (r2 + g2 + b2);
                        ++n;
                    }
                }
            }
            return sum / n;
        };
        const round = slope(gravel.generate({ seed: 2, grain: 0 }));
        const flat = slope(gravel.generate({ seed: 2, grain: 0, stones: { relief: 0 } }));
        expect(round).toBeGreaterThan(flat + 10);
    });

    it('lays as many stones as asked', () => {
        expect(gravel.generate({ seed: 3, stones: { count: 20 } }).data).not.toEqual(
            gravel.generate({ seed: 3 }).data,
        );
    });
});
