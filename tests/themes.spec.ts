import { describe, expect, it } from 'vitest';
import {
    ambiances,
    createMemoryLoader,
    drawTheme,
    generateSet,
    generators,
    renderTexture,
} from '../src';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('generateSet', () => {
    it('gives the same set for the same seed', () => {
        expect(generateSet({ seed: 42 })).toEqual(generateSet({ seed: 42 }));
    });

    it('gives different themes for different seeds', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const walls = SEEDS.map((seed) => JSON.stringify(drawTheme({ seed, ambiance }).theme));
            expect(new Set(walls).size).toBe(walls.length);
        }
    });

    it('draws every ambiance when none is given', () => {
        const drawn = new Set(SEEDS.map((seed) => drawTheme({ seed }).ambiance));
        expect([...drawn].sort()).toEqual(Object.keys(ambiances).sort());
    });

    it('draws the same theme whether the ambiance is given or drawn', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const drawn = drawTheme({ seed });
            expect(drawTheme({ seed, ambiance: drawn.ambiance })).toEqual(drawn);
        }
    });

    it('draws valid parameters for every ambiance', () => {
        for (const ambiance of Object.keys(ambiances)) {
            for (const seed of SEEDS) {
                const { template, ...params } = drawTheme({ seed, ambiance }).theme.wall;
                expect(() => generators[template].schema.parse(params)).not.toThrow();
            }
        }
    });

    it('lets explicit theme values win, arrays replacing the drawn ones', () => {
        const palette = ['#000000', '#ffffff'];
        const { theme } = drawTheme({
            seed: 3,
            ambiance: 'dungeon',
            theme: { wall: { age: 0.9, stone: { palette } } },
        });
        expect(theme.wall.age).toBe(0.9);
        expect(theme.wall.stone).toMatchObject({ palette });
        // the other drawn values are kept
        expect(theme.wall.rows).toEqual(
            drawTheme({ seed: 3, ambiance: 'dungeon' }).theme.wall.rows,
        );
    });

    it('rejects unknown ambiances and invalid theme values', () => {
        expect(() => generateSet({ seed: 1, ambiance: 'mine' })).toThrow(/unknown ambiance/);
        expect(() =>
            generateSet({ seed: 1, ambiance: 'dungeon', theme: { wall: { age: 2 } } }),
        ).toThrow(/theme\.wall/);
        expect(() =>
            generateSet({ seed: 1, ambiance: 'dungeon', theme: { wall: { template: 'nope' } } }),
        ).toThrow(/unknown template/);
    });

    it('draws valid liquids for every ambiance', () => {
        for (const ambiance of Object.keys(ambiances)) {
            for (const seed of SEEDS) {
                const { liquid } = drawTheme({ seed, ambiance }).theme;
                expect(() => generators.splatter.schema.parse({ liquid })).not.toThrow();
            }
        }
    });

    it('splashes the same wall as the plain wall', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed });
            const plain = textures['plain-wall'];
            const splattered = textures['splattered-wall'];
            expect(splattered.seed).toBe(plain.seed);
            expect(splattered.patches[0]).toEqual(plain.patches[0]);
            expect(splattered.patches.length).toBeGreaterThanOrEqual(2);
            expect(splattered.patches.length).toBeLessThanOrEqual(4);
        }
    });

    it('builds textures of the requested size, covered by the wall', () => {
        const set = generateSet({ seed: 5, ambiance: 'cave', size: [32, 48] });
        const texture = renderTexture(set.textures['plain-wall'], createMemoryLoader({}));
        expect([texture.width, texture.height]).toEqual([32, 48]);
        // no pixel left with the black background
        for (let y = 0; y < texture.height; y++) {
            for (let x = 0; x < texture.width; x++) {
                expect(texture.getPixel(x, y) >>> 8).not.toBe(0);
            }
        }
    });
});
