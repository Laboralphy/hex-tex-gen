import { describe, expect, it } from 'vitest';
import { ashlar, ashlarWear, type AshlarParams } from '../src';

const at = (age: number, params: object = {}) =>
    ashlarWear({ ...ashlar.defaults, ...params, age } as AshlarParams);

describe('ashlarWear', () => {
    it('gives the former defaults at age 0.3, the default age', () => {
        expect(ashlar.defaults.age).toBe(0.3);
        const wear = at(0.3);
        expect(wear.chips).toEqual({ ratio: 0.25, size: [2, 4] });
        expect(wear.cracks).toEqual({ ratio: 0.2, length: [5, 12] });
        expect(wear.roughness).toBe(0.8);
        expect(wear.grain).toBe(0.06);
        expect(wear.shadeVariation).toBe(0.1);
        expect(wear.mortar.noise).toBe(0.25);
    });

    it('has no damage at age 0', () => {
        const wear = at(0);
        expect(wear.chips.ratio).toBe(0);
        expect(wear.cracks.ratio).toBe(0);
        expect(wear.erosion).toEqual({ corners: 0, edges: 0 });
        expect(wear.mortar.erosion).toBe(0);
        expect(wear.stains.ratio).toBe(0);
        expect(wear.stains.grime).toBe(0);
        expect(wear.spalling.ratio).toBe(0);
    });

    it('grows with age', () => {
        const flatten = (age: number) =>
            JSON.stringify(at(age))
                .match(/-?\d+(\.\d+)?/g)!
                .map(Number);
        const ages = [0, 0.15, 0.3, 0.6, 1].map(flatten);
        for (let i = 1; i < ages.length; ++i) {
            ages[i].forEach((value, k) => expect(value).toBeGreaterThanOrEqual(ages[i - 1][k]));
        }
    });

    it('lets explicit values win over age', () => {
        const wear = at(1, { chips: { ratio: 0.1 }, stains: { grime: 0 } });
        expect(wear.chips.ratio).toBe(0.1);
        expect(wear.chips.size).toEqual([3, 8]);
        expect(wear.stains.grime).toBe(0);
        expect(wear.stains.ratio).toBe(0.7);
    });
});

describe('ashlar aging', () => {
    it('renders differently at each age, deterministically', () => {
        const render = (age: number) => ashlar.generate({ seed: 5, age }).data;
        expect(render(0)).not.toEqual(render(1));
        expect(render(1)).toEqual(render(1));
    });

    it('darkens the wall as it ages', () => {
        const mean = (age: number) => {
            const d = ashlar.generate({ seed: 5, width: 128, height: 128, age }).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) {
                sum += d[i] + d[i + 1] + d[i + 2];
            }
            return sum / (d.length / 4);
        };
        expect(mean(1)).toBeLessThan(mean(0.3));
        expect(mean(0.3)).toBeLessThan(mean(0));
    });

    it('keeps each effect off when set to zero, whatever the age', () => {
        const off = {
            age: 1,
            stains: { ratio: 0, grime: 0 },
            spalling: { ratio: 0 },
            erosion: { corners: 0, edges: 0 },
            mortar: { erosion: 0 },
        };
        const wear = at(1, off);
        expect(wear.stains.ratio + wear.stains.grime + wear.spalling.ratio).toBe(0);
        expect(wear.erosion.corners + wear.erosion.edges + wear.mortar.erosion).toBe(0);
    });
});
