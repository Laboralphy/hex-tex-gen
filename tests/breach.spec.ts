import { describe, expect, it } from 'vitest';
import { breach, type Texture } from '../src';

const alpha = (t: Texture, x: number, y: number) => t.getPixel(x, y) & 0xff;
const red = (t: Texture, x: number, y: number) => t.getPixel(x, y) >>> 24;

/** a round hole, without roughness nor cracks, for measurements */
const round = {
    hole: { jaggedness: 0 },
    rim: { grain: 0 },
    cracks: { count: 0 },
};

/** the separate patches of earth large enough to be seen, 4-connected */
function earthPatches(t: Texture): number {
    const seen = new Uint8Array(t.width * t.height);
    let patches = 0;
    for (let i = 0; i < seen.length; ++i) {
        if (seen[i] || alpha(t, i % t.width, Math.floor(i / t.width)) !== 255) {
            continue;
        }
        let size = 0;
        const stack = [i];
        seen[i] = 1;
        while (stack.length > 0) {
            const j = stack.pop()!;
            ++size;
            const [x, y] = [j % t.width, Math.floor(j / t.width)];
            for (const [nx, ny] of [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
            ]) {
                const k = ny * t.width + nx;
                if (
                    nx >= 0 &&
                    ny >= 0 &&
                    nx < t.width &&
                    ny < t.height &&
                    !seen[k] &&
                    alpha(t, nx, ny) === 255
                ) {
                    seen[k] = 1;
                    stack.push(k);
                }
            }
        }
        patches += size >= 4 ? 1 : 0;
    }
    return patches;
}

/** opaque pixels: the earth at the back of the hole */
function earth(t: Texture): number {
    let count = 0;
    for (let y = 0; y < t.height; ++y) {
        for (let x = 0; x < t.width; ++x) {
            count += alpha(t, x, y) === 255 ? 1 : 0;
        }
    }
    return count;
}

describe('breach', () => {
    it('is an overlay: earth in the hole, the wall showing through around it', () => {
        const t = breach.generate({ seed: 1, ...round });
        expect(breach.overlay).toBe(true);
        expect(breach.category).toBe('architecture');
        const { x, y } = t.anchors.center[0];
        expect(alpha(t, x, y)).toBe(255);
        expect(alpha(t, 0, 0)).toBe(0);
        expect(alpha(t, t.width - 1, t.height - 1)).toBe(0);
    });

    it('shades its broken edge: dark at the top-left, lit at the bottom-right', () => {
        const t = breach.generate({ seed: 1, ...round, depth: 3 });
        const { x: cx, y: cy } = t.anchors.center[0];
        /** the first translucent pixel of the broken edge, from the center along a way */
        const edge = (dx: number, dy: number) => {
            let [x, y] = [cx, cy];
            while (alpha(t, x, y) === 255) {
                x += dx;
                y += dy;
            }
            return { x, y };
        };
        const shadow = edge(-1, -1);
        const light = edge(1, 1);
        expect(alpha(t, shadow.x, shadow.y)).toBeGreaterThan(0);
        expect(alpha(t, light.x, light.y)).toBeGreaterThan(0);
        // translucent black at the top-left, translucent white at the bottom-right
        expect(red(t, shadow.x, shadow.y)).toBe(0);
        expect(red(t, light.x, light.y)).toBe(255);
    });

    it('fills the hole with earth of its own palette', () => {
        const flat = { contrast: 0, clods: 0, pebbles: 0, grain: 0 };
        const green = breach.generate({
            seed: 1,
            ...round,
            shadow: { opacity: 0, recess: 0 },
            dirt: { ...flat, palette: ['#00ff00', '#00ff00'] },
        });
        const { x, y } = green.anchors.center[0];
        expect(green.getPixel(x, y) >>> 8).toBe(0x00ff00);
    });

    it('breaks into shards as it gets jagged', () => {
        const smooth = earth(breach.generate({ seed: 3, ...round }));
        const jagged = earth(
            breach.generate({ seed: 3, ...round, hole: { jaggedness: 0.9, spikes: 9 } }),
        );
        expect(jagged).toBeLessThan(smooth * 0.8);
    });

    it('stays inside the patch, even at its largest, whatever its shape', () => {
        for (const shape of [
            'burst',
            'gash',
            'fissure',
            'pocks',
            'collapse',
            'bore',
            'slits',
        ] as const) {
            const t = breach.generate({
                seed: 2,
                ...round,
                hole: { shape, size: 1, jaggedness: 0.5, width: 0.5, count: 4 },
                cracks: { count: 0 },
            });
            expect(earth(t), shape).toBeGreaterThan(0);
            for (let i = 0; i < t.width; ++i) {
                expect(alpha(t, i, 0), shape).toBe(0);
                expect(alpha(t, i, t.height - 1), shape).toBe(0);
            }
            for (let j = 0; j < t.height; ++j) {
                expect(alpha(t, 0, j), shape).toBe(0);
                expect(alpha(t, t.width - 1, j), shape).toBe(0);
            }
        }
    });

    it('tears parallel gashes, as many as asked, even when they are thick', () => {
        for (const count of [2, 3, 4]) {
            const t = breach.generate({
                seed: 6,
                width: 64,
                height: 64,
                ...round,
                hole: { shape: 'gash', count, width: 0.3 },
            });
            expect(earthPatches(t)).toBe(count);
        }
    });

    it('opens a split showing the earth, however narrow', () => {
        const t = breach.generate({
            seed: 7,
            ...round,
            hole: { shape: 'fissure', angle: 90, width: 0.15, jaggedness: 0.5 },
        });
        expect(earthPatches(t)).toBe(1);
        // a split running down: taller than wide
        let [top, bottom, left, right] = [Infinity, -1, Infinity, -1];
        for (let y = 0; y < t.height; ++y) {
            for (let x = 0; x < t.width; ++x) {
                if (alpha(t, x, y) === 255) {
                    [top, bottom] = [Math.min(top, y), Math.max(bottom, y)];
                    [left, right] = [Math.min(left, x), Math.max(right, x)];
                }
            }
        }
        expect(bottom - top).toBeGreaterThan(2 * (right - left));
    });

    it('bites a collapse out of the top of the wall, rubble heaped at its foot', () => {
        const t = breach.generate({
            seed: 9,
            ...round,
            hole: { shape: 'collapse' },
            rubble: { palette: ['#00ff00', '#00ff00'] },
        });
        // the hole reaches the top of the patch, but for the bevel and a pixel to spare
        const { x, y } = t.anchors.bottom[0];
        expect(alpha(t, x, 3)).toBeGreaterThan(0);
        // green stones of rubble at its foot: opaque, and green
        const stone = (s: Texture, px: number, py: number) =>
            alpha(s, px, py) === 255 && ((s.getPixel(px, py) >>> 16) & 0xff) > red(s, px, py) + 40;
        expect(stone(t, x, y)).toBe(true);
        // no rubble without a collapse, unless asked
        const green = { palette: ['#00ff00', '#00ff00'] };
        const burst = breach.generate({ seed: 9, ...round, rubble: green });
        const b = burst.anchors.bottom[0];
        expect(stone(burst, b.x, b.y - 1)).toBe(false);
        const heaped = breach.generate({ seed: 9, ...round, rubble: { ...green, amount: 0.4 } });
        const h = heaped.anchors.bottom[0];
        expect(stone(heaped, h.x, h.y - 1)).toBe(true);
    });

    it('bores a tunnel, dark at its far end', () => {
        const flat = { contrast: 0, clods: 0, pebbles: 0, grain: 0 };
        const t = breach.generate({
            seed: 10,
            width: 64,
            height: 64,
            ...round,
            hole: { shape: 'bore' },
            shadow: { opacity: 0 },
            dirt: { ...flat, palette: ['#808080', '#808080'] },
        });
        const { x, y } = t.anchors.center[0];
        // the far end, dark; nearer the rim, lighter
        expect(red(t, x, y)).toBeLessThan(red(t, x + 12, y + 12) / 2);
    });

    it('hacks arrow slits side by side, crossed when asked', () => {
        /** the separate pieces drawn, 4-connected */
        const pieces = (t: Texture) => {
            const seen = new Uint8Array(t.width * t.height);
            let count = 0;
            for (let i = 0; i < seen.length; ++i) {
                if (seen[i] || alpha(t, i % t.width, Math.floor(i / t.width)) === 0) {
                    continue;
                }
                ++count;
                const stack = [i];
                seen[i] = 1;
                while (stack.length > 0) {
                    const j = stack.pop()!;
                    const [x, y] = [j % t.width, Math.floor(j / t.width)];
                    for (const [nx, ny] of [
                        [x - 1, y],
                        [x + 1, y],
                        [x, y - 1],
                        [x, y + 1],
                    ]) {
                        const k = ny * t.width + nx;
                        if (nx >= 0 && ny >= 0 && nx < t.width && ny < t.height && !seen[k]) {
                            if (alpha(t, nx, ny) > 0) {
                                seen[k] = 1;
                                stack.push(k);
                            }
                        }
                    }
                }
            }
            return count;
        };
        const slits = { shape: 'slits' as const, count: 3, width: 0.1 };
        const plain = breach.generate({ seed: 11, width: 64, height: 64, ...round, hole: slits });
        expect(pieces(plain)).toBe(3);
        const crossed = breach.generate({
            seed: 11,
            width: 64,
            height: 64,
            ...round,
            hole: { ...slits, cross: true },
        });
        expect(pieces(crossed)).toBe(3);
        const drawn = (t: Texture) => {
            let n = 0;
            for (let i = 3; i < t.data.length; i += 4) {
                n += t.data[i] > 0 ? 1 : 0;
            }
            return n;
        };
        expect(drawn(crossed)).toBeGreaterThan(drawn(plain));
    });

    it('scatters pocks apart from each other', () => {
        const t = breach.generate({
            seed: 8,
            width: 64,
            height: 64,
            ...round,
            hole: { shape: 'pocks', count: 4, size: 0.95 },
        });
        expect(earthPatches(t)).toBe(4);
    });

    it('cracks the wall around the hole', () => {
        /** pixels drawn on the wall, outside the hole and its lip */
        const drawn = (t: Texture) => {
            const { x: cx, y: cy } = t.anchors.center[0];
            let count = 0;
            for (let y = 0; y < t.height; ++y) {
                for (let x = 0; x < t.width; ++x) {
                    const far = Math.hypot(x - cx, y - cy) > t.width * 0.45;
                    count += far && alpha(t, x, y) > 0 ? 1 : 0;
                }
            }
            return count;
        };
        const small = { ...round, hole: { size: 0.6, jaggedness: 0 } };
        expect(drawn(breach.generate({ seed: 4, ...small }))).toBe(0);
        expect(
            drawn(breach.generate({ seed: 4, ...small, cracks: { count: 6, length: [0.8, 1] } })),
        ).toBeGreaterThan(0);
    });

    it('reports its center, and the bottom of its earth below it', () => {
        const t = breach.generate({ seed: 5, ...round });
        const [center] = t.anchors.center;
        const [bottom] = t.anchors.bottom;
        expect(bottom.x).toBe(center.x);
        expect(bottom.y).toBeGreaterThan(center.y);
        expect(alpha(t, bottom.x, bottom.y)).toBeGreaterThan(0);
        expect(alpha(t, bottom.x, bottom.y + 1)).toBeLessThan(255);
    });
});
