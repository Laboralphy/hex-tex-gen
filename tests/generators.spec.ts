import { describe, expect, it } from 'vitest';
import { generators } from '../src';

// generators meant to be laid over another patch, transparent by design
const overlays = ['moss'];

describe.each(Object.values(generators))('generator $name', (generator) => {
    it('produces a texture of the requested size', () => {
        const t = generator.generate({ width: 64, height: 32, seed: 1 });
        expect(t.width).toBe(64);
        expect(t.height).toBe(32);
    });

    it('is deterministic for a given seed', () => {
        const a = generator.generate({ width: 64, height: 64, seed: 42 });
        const b = generator.generate({ width: 64, height: 64, seed: 42 });
        const c = generator.generate({ width: 64, height: 64, seed: 43 });
        expect(a.data).toEqual(b.data);
        expect(a.data).not.toEqual(c.data);
    });

    it.skipIf(overlays.includes(generator.name))('produces opaque pixels', () => {
        const t = generator.generate({ width: 32, height: 32, seed: 7 });
        for (let i = 3; i < t.data.length; i += 4) {
            expect(t.data[i]).toBe(255);
        }
    });
});
