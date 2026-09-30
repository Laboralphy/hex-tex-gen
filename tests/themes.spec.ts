import { describe, expect, it } from 'vitest';
import {
    ambiances,
    createMemoryLoader,
    recipes,
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
            // no splash wraps around an edge: the wall still meets the plain wall
            for (const splash of splattered.patches.slice(1)) {
                expect(splash.wrap).toBe(false);
                expect(Math.min(splash.x!, splash.y!)).toBeGreaterThan(0);
                expect(splash.x! + splash.width!).toBeLessThan(100);
                expect(splash.y! + splash.height!).toBeLessThan(100);
            }
        }
    });

    it('keeps the left and right edges of the splattered wall those of the plain wall', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const set = generateSet({ seed, size: [32, 48] });
            const render = (name: string) =>
                renderTexture(set.textures[name], createMemoryLoader({}));
            const [plain, splattered] = [render('plain-wall'), render('splattered-wall')];
            for (const x of [0, plain.width - 1]) {
                for (let y = 0; y < plain.height; y++) {
                    expect(splattered.getPixel(x, y)).toBe(plain.getPixel(x, y));
                }
            }
        }
    });

    it('breaks through the same wall as the plain wall, the hole inside the texture', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed });
            const plain = textures['plain-wall'];
            const breached = textures['breached-wall'];
            expect(breached.seed).toBe(plain.seed);
            expect(breached.patches[0]).toEqual(plain.patches[0]);
            const [, hole] = breached.patches;
            expect(hole).toMatchObject({ patch: { template: 'breach' }, wrap: false });
            expect(hole.x! + hole.width!).toBeLessThanOrEqual(100);
            expect(hole.y! + hole.height!).toBeLessThanOrEqual(100);
            expect(Math.min(hole.x!, hole.y!)).toBeGreaterThanOrEqual(0);
        }
        // every shape of hole, across seeds
        const shapes = new Set(
            SEEDS.map((seed) => {
                const [, hole] = generateSet({ seed }).textures['breached-wall'].patches;
                return (hole.patch as { hole: { shape: string } }).hole.shape;
            }),
        );
        expect([...shapes].sort()).toEqual([
            'bore',
            'burst',
            'collapse',
            'fissure',
            'gash',
            'pocks',
            'slits',
        ]);
    });

    it('frames a door slot in the middle of the plain wall, in every ambiance', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed });
            const frame = textures['door-frame'];
            expect(frame.seed).toBe(textures['plain-wall'].seed);
            expect(frame.patches[0]).toEqual(textures['plain-wall'].patches[0]);
            const [, slot] = frame.patches;
            expect(slot).toMatchObject({ patch: { template: 'slot' }, y: 0, height: 100 });
            expect(slot.x! + slot.width! / 2).toBeCloseTo(50, 1);
        }
        expect(generateSet({ seed: 1, ambiance: 'cave' }).textures).toHaveProperty('door-frame');
    });

    it('cuts the arched alcove of a dungeon through the wall, between two columns', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures, theme } = generateSet({ seed, ambiance: 'dungeon' });
            const alcove = textures['arch-alcove'];
            expect(alcove.seed).toBe(textures['plain-wall'].seed);
            expect(alcove.patches[0]).toEqual(textures['plain-wall'].patches[0]);
            const [, opening, left, right] = alcove.patches;
            expect(opening).toMatchObject({
                patch: { template: 'opening', open: ['bottom'], back: { mode: 'cut' } },
                x: 20,
                y: 5,
                width: 60,
                height: 95,
            });
            expect(['round', 'pointed']).toContain(
                (opening.patch as { arch: { shape: string } }).arch.shape,
            );
            // full height at both sides, of the stone of the wall
            const palette = (theme.wall.stone as { palette: string[] }).palette;
            expect(left).toMatchObject({ x: 0, y: 0, width: 15, height: 100 });
            expect(right).toMatchObject({ x: 85, y: 0, width: 15, height: 100 });
            for (const column of [left, right]) {
                expect(column.patch).toMatchObject({ template: 'column', marble: { palette } });
            }
        }
        // transparent through the opening, opaque around it
        const set = generateSet({ seed: 4, ambiance: 'dungeon', size: [64, 128] });
        const texture = renderTexture(set.textures['arch-alcove'], createMemoryLoader({}));
        const alpha = (x: number, y: number) => texture.getPixel(x, y) & 0xff;
        expect(alpha(32, 100)).toBe(0);
        expect(alpha(32, 127)).toBe(0);
        // the wall above the arch, and a column
        expect(alpha(32, 2)).toBe(255);
        expect(alpha(4, 64)).toBe(255);
    });

    it('darkens the whole plain wall, for the back of an alcove, in every ambiance', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed });
            const back = textures['alcove-background'];
            expect(back.seed).toBe(textures['plain-wall'].seed);
            expect(back.patches[0]).toEqual(textures['plain-wall'].patches[0]);
            expect(back.patches[1]).toMatchObject({
                patch: { template: 'opening', back: { mode: 'shade' } },
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            });
        }
        // darker than the plain wall, pixel for pixel
        const set = generateSet({ seed: 2, ambiance: 'cave', size: [32, 64] });
        const render = (name: string) => renderTexture(set.textures[name], createMemoryLoader({}));
        const [plain, back] = [render('plain-wall'), render('alcove-background')];
        const red = (t: typeof plain, x: number, y: number) => t.getPixel(x, y) >>> 24;
        expect(red(back, 16, 32)).toBeLessThan(red(plain, 16, 32));
    });

    it('frames the alcove of a cave with wooden beams, alone on a transparent texture', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const alcove = generateSet({ seed, ambiance: 'cave' }).textures['arch-alcove'];
            expect(alcove.background).toBe('#0000');
            const [left, right, cap] = alcove.patches;
            // posts against the left and right edges, full height, as the columns of the
            // dungeon alcove; the cap along the top edge, full width
            expect(left).toMatchObject({ x: 0, y: 0, width: 15, height: 100 });
            expect(right).toMatchObject({ x: 85, y: 0, width: 15, height: 100 });
            expect(cap).toMatchObject({ x: 0, y: 0, width: 100 });
            for (const post of [left, right]) {
                expect(post.patch).toMatchObject({ template: 'woodbeam', direction: 'vertical' });
            }
            expect(cap.patch).toMatchObject({ template: 'woodbeam' });
            expect(cap.patch).not.toHaveProperty('direction');
        }
        const set = generateSet({ seed: 5, ambiance: 'cave' });
        const texture = renderTexture(set.textures['arch-alcove'], createMemoryLoader({}));
        const alpha = (x: number, y: number) => texture.getPixel(x, y) & 0xff;
        // transparent between the posts, below the cap; the beams at the edges
        expect(alpha(texture.width / 2, Math.floor(texture.height * 0.6))).toBe(0);
        expect(alpha(texture.width / 2, texture.height - 1)).toBe(0);
        expect(alpha(2, texture.height / 2)).toBe(255);
        expect(alpha(texture.width / 2, 2)).toBe(255);
    });

    it('pierces a small arched window above a sill of the stone of the wall, in dungeons', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures, theme } = generateSet({ seed, ambiance: 'dungeon' });
            const window = textures['small-window'];
            expect(window.seed).toBe(textures['plain-wall'].seed);
            expect(window.patches[0]).toEqual(textures['plain-wall'].patches[0]);
            const [, opening, sill] = window.patches;
            expect(opening).toMatchObject({
                patch: { template: 'opening', back: { mode: 'cut' } },
                x: 33,
                y: 10,
                width: 33,
                height: 60,
            });
            expect(opening.patch).not.toHaveProperty('open');
            expect(['round', 'pointed']).toContain(
                (opening.patch as { arch: { shape: string } }).arch.shape,
            );
            const palette = (theme.wall.stone as { palette: string[] }).palette;
            expect(sill).toMatchObject({
                patch: { template: 'stoneslab', stone: { palette } },
                x: 30,
                y: 66,
                width: 40,
                height: 15,
            });
        }
        // transparent through the window, the sill opaque over its foot
        const set = generateSet({ seed: 1, ambiance: 'dungeon', size: [64, 128] });
        const texture = renderTexture(set.textures['small-window'], createMemoryLoader({}));
        const alpha = (x: number, y: number) => texture.getPixel(x, y) & 0xff;
        expect(alpha(32, 50)).toBe(0);
        expect(alpha(32, 88)).toBe(255);
        expect(alpha(4, 50)).toBe(255);
    });

    it('bars a small window framed by four wooden beams, in caves', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed, ambiance: 'cave' });
            const window = textures['small-window'];
            expect(window.seed).toBe(textures['plain-wall'].seed);
            expect(window.patches[0]).toEqual(textures['plain-wall'].patches[0]);
            const [, opening, bars, left, right, cap, sill] = window.patches;
            const rect = { x: 25, y: 33, width: 50, height: 33 };
            expect(opening).toMatchObject({
                patch: { template: 'opening', back: { mode: 'cut' } },
                ...rect,
            });
            expect(bars).toMatchObject({ patch: { template: 'bars' }, ...rect });
            // the beams around the window, touching its edges, 15 percent thick
            expect(left).toMatchObject({ x: 10, width: 15, patch: { direction: 'vertical' } });
            expect(right).toMatchObject({ x: 75, width: 15, patch: { direction: 'vertical' } });
            expect(cap.y! + cap.height!).toBeCloseTo(33, 1);
            expect(sill.y).toBe(66);
            for (const beam of [left, right, cap, sill]) {
                expect(beam.patch).toMatchObject({ template: 'woodbeam' });
            }
            expect(left.y).toBeCloseTo(cap.y!, 1);
            expect(left.y! + left.height!).toBeCloseTo(sill.y! + sill.height!, 1);
        }
    });

    it('bars a way cut through the whole wall, framed by beams along the edges in caves', () => {
        const full = { x: 0, y: 0, width: 100, height: 100 };
        for (const ambiance of ['dungeon', 'cave']) {
            for (const seed of SEEDS.slice(0, 10)) {
                const { textures } = generateSet({ seed, ambiance });
                const way = textures['barred-way'];
                expect(way.seed).toBe(textures['plain-wall'].seed);
                expect(way.patches[0]).toEqual(textures['plain-wall'].patches[0]);
                const [, opening, bars, ...beams] = way.patches;
                expect(opening).toMatchObject({
                    patch: { template: 'opening', back: { mode: 'cut' } },
                    ...full,
                });
                expect(bars).toMatchObject({ patch: { template: 'bars' }, ...full });
                if (ambiance === 'dungeon') {
                    expect(beams).toEqual([]);
                    continue;
                }
                // posts against both sides, rails along the top and the bottom
                const [left, right, top, bottom] = beams;
                for (const beam of beams) {
                    expect(beam.patch).toMatchObject({ template: 'woodbeam' });
                }
                expect(left).toMatchObject({ x: 0, y: 0, width: 15, height: 100 });
                expect(right).toMatchObject({ x: 85, y: 0, width: 15, height: 100 });
                expect(top).toMatchObject({ x: 0, y: 0, width: 100 });
                expect(bottom).toMatchObject({ x: 0, width: 100 });
                expect(bottom.y! + bottom.height!).toBeCloseTo(100, 1);
            }
        }
        // see-through between the bars, on a row away from their rails
        const set = generateSet({ seed: 2, ambiance: 'dungeon', size: [64, 128] });
        const texture = renderTexture(set.textures['barred-way'], createMemoryLoader({}));
        let clear = 0;
        for (let x = 0; x < texture.width; ++x) {
            clear += (texture.getPixel(x, 40) & 0xff) === 0 ? 1 : 0;
        }
        expect(clear).toBeGreaterThan(texture.width / 2);
    });

    it('gives each ambiance at most one variant of each texture', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const names = recipes.filter((r) => r.ambiances.includes(ambiance)).map((r) => r.name);
            expect(new Set(names).size, ambiance).toBe(names.length);
        }
        // the alcove, in its dungeon and cave variants
        expect(
            generateSet({ seed: 1, ambiance: 'dungeon' }).textures['arch-alcove'].patches[1],
        ).toMatchObject({ patch: { template: 'opening' } });
        expect(
            generateSet({ seed: 1, ambiance: 'cave' }).textures['arch-alcove'].patches[0],
        ).toMatchObject({ patch: { template: 'woodbeam' } });
    });

    it('renders every texture of every ambiance', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const set = generateSet({ seed: 3, ambiance, size: [32, 64] });
            for (const [name, definition] of Object.entries(set.textures)) {
                const texture = renderTexture(definition, createMemoryLoader({}));
                expect([texture.width, texture.height], name).toEqual([32, 64]);
            }
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
