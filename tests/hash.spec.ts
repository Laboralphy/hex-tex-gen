import { describe, expect, it } from 'vitest';
import { hash, hashRange } from '../src';

describe('hash', () => {
    it('is deterministic and in [0, 1)', () => {
        for (let i = 0; i < 1000; ++i) {
            const v = hash(42, i, i * 7);
            expect(v).toBe(hash(42, i, i * 7));
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('depends on the seed and on the order of values', () => {
        expect(hash(1, 2, 3)).not.toBe(hash(2, 2, 3));
        expect(hash(1, 2, 3)).not.toBe(hash(1, 3, 2));
    });

    it('is roughly uniform', () => {
        const buckets = new Array(10).fill(0);
        for (let i = 0; i < 10000; ++i) {
            buckets[Math.floor(hash(7, i) * 10)]++;
        }
        for (const b of buckets) {
            expect(b).toBeGreaterThan(850);
            expect(b).toBeLessThan(1150);
        }
    });

    it('maps to a range', () => {
        const v = hashRange(10, 20, 1, 2);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThan(20);
    });
});
