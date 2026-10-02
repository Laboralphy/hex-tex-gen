import { describe, expect, it } from 'vitest';
import {
    ambiances,
    createMemoryLoader,
    mainPalette,
    recipes,
    drawTheme,
    generateSet,
    generators,
    renderTexture,
} from '../src';
import { BANNER_COLORS } from '../src/themes/recipes/banner-wall';

/** an ambiance with breached walls: interiors have none */
const withBreach = (seed: number) => (seed % 2 ? 'dungeon' : 'cave');

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);

describe('generateSet', () => {
    it('builds each texture when it is first read, then keeps it', () => {
        const set = generateSet({ seed: 42 });
        const descriptor = Object.getOwnPropertyDescriptor(set.textures, 'floor')!;
        expect(descriptor.get).toBeDefined();
        expect(descriptor.enumerable).toBe(true);
        // the same definition read twice; every texture listed and serialized
        expect(set.textures.floor).toBe(set.textures.floor);
        expect(Object.keys(JSON.parse(JSON.stringify(set.textures)))).toEqual(
            Object.keys(set.textures),
        );
    });

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
            const splashes = splattered.patches.filter((p) => p.id !== 'wall' && p.id !== 'trim');
            expect(splashes.length).toBeGreaterThanOrEqual(1);
            expect(splashes.length).toBeLessThanOrEqual(3);
            // no splash wraps around an edge: the wall still meets the plain wall
            for (const splash of splashes) {
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

    it('burns the same wall as the plain wall, the soot at its foot and inside the texture', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed });
            const plain = textures['plain-wall'];
            const burnt = textures['burnt-wall'];
            expect(burnt.seed).toBe(plain.seed);
            expect(burnt.patches[0]).toEqual(plain.patches[0]);
            const mark = burnt.patches.find(
                (p) => (p.patch as { template: string }).template === 'burn',
            )!;
            expect(mark).toMatchObject({ patch: { template: 'burn' }, wrap: false });
            expect(mark.x! + mark.width!).toBeLessThanOrEqual(100);
            expect(mark.y! + mark.height!).toBeCloseTo(100);
            expect(mark.x!).toBeGreaterThanOrEqual(0);
        }
    });

    it('keeps every edge of the burnt wall those of the plain wall', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const set = generateSet({ seed, size: [32, 48] });
            const render = (name: string) =>
                renderTexture(set.textures[name], createMemoryLoader({}));
            const [plain, burnt] = [render('plain-wall'), render('burnt-wall')];
            expect(burnt.data).not.toEqual(plain.data);
            for (let y = 0; y < plain.height; y++) {
                for (let x = 0; x < plain.width; x++) {
                    if (x === 0 || y === 0 || x === plain.width - 1 || y === plain.height - 1) {
                        expect(burnt.getPixel(x, y)).toBe(plain.getPixel(x, y));
                    }
                }
            }
        }
    });

    it('breaks through the same wall as the plain wall, the hole inside the texture', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed, ambiance: withBreach(seed) });
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
                const [, hole] = generateSet({ seed, ambiance: withBreach(seed) }).textures[
                    'breached-wall'
                ].patches;
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
            const slot = frame.patches.find(
                (p) => (p.patch as { template: string }).template === 'slot',
            )!;
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

    it('panels the walls of interiors with wood, and keeps them nearly new', () => {
        for (const seed of SEEDS.slice(0, 50)) {
            const { theme } = drawTheme({ seed, ambiance: 'interior' });
            expect(theme.wall.template).toBe('planks');
            expect(theme.wall.age).toBeLessThanOrEqual(0.4);
            expect(theme.decor.age).toBeLessThanOrEqual(0.25);
        }
    });

    it('frames the alcove of interiors with carved columns under an entablature, in the wood of the wall', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { theme, textures } = generateSet({ seed, ambiance: 'interior' });
            const alcove = textures['arch-alcove'];
            expect(alcove.seed).toBe(textures['plain-wall'].seed);
            const templates = alcove.patches.map((p) => (p.patch as { template: string }).template);
            expect(templates).toEqual(['planks', 'opening', 'column', 'column', 'entablature']);
            const wood = (theme.wall.wood as { palette: string[] }).palette;
            for (const carved of alcove.patches.slice(2)) {
                const { marble } = carved.patch as { marble: { palette: string[] } };
                // the wood of the wall, polished lighter
                expect(marble.palette).toHaveLength(wood.length);
                expect(marble.palette).not.toEqual(wood);
                expect(carved.wrap).toBe(false);
            }
            // the columns stand under the entablature
            const [, , left, right, top] = alcove.patches;
            expect(left.y).toBe(top.height);
            expect(right.x! + right.width!).toBe(100);
        }
        // cut through between the columns
        const set = generateSet({ seed: 1, ambiance: 'interior' });
        const t = renderTexture(set.textures['arch-alcove'], createMemoryLoader({}));
        expect(t.getPixel(32, 100) & 0xff).toBe(0);
        expect(t.getPixel(4, 100) & 0xff).toBe(255);
    });

    it('hangs two banners of heraldic colors on the walls of every ambiance', () => {
        const pairs = BANNER_COLORS.map((pair) => pair.join());
        const drawn = new Set<string>();
        for (const ambiance of Object.keys(ambiances)) {
            for (const seed of SEEDS.slice(0, 20)) {
                const { theme, textures } = generateSet({ seed, ambiance });
                expect(Object.keys(textures).filter((n) => n.startsWith('banner-wall'))).toEqual([
                    'banner-wall-1',
                    'banner-wall-2',
                ]);
                const banners = ['banner-wall-1', 'banner-wall-2'].map((name) => {
                    const texture = textures[name];
                    expect(texture.seed).toBe(textures['plain-wall'].seed);
                    const hung = texture.patches.find(
                        (p) => (p.patch as { template: string }).template === 'banner',
                    )!;
                    expect(hung.wrap).toBe(false);
                    const banner = hung.patch as {
                        fabric: { color: string };
                        border: { stripes: { color: string }[] };
                        age: number;
                    };
                    expect(banner.age).toBe(theme.decor.age);
                    const colors = [banner.fabric.color, banner.border.stripes[0].color].join();
                    expect(pairs).toContain(colors);
                    drawn.add(colors);
                    return { colors, place: [hung.x, hung.y, hung.width, hung.height] };
                });
                // two banners of other colors, of the same size at the same place
                expect(banners[0].colors).not.toBe(banners[1].colors);
                expect(banners[0].place).toEqual(banners[1].place);
            }
        }
        // every pair of colors, across seeds
        for (const seed of SEEDS) {
            for (const name of ['banner-wall-1', 'banner-wall-2']) {
                const [, hung] = generateSet({ seed, ambiance: 'dungeon' }).textures[name].patches;
                const banner = hung.patch as {
                    fabric: { color: string };
                    border: { stripes: { color: string }[] };
                };
                drawn.add([banner.fabric.color, banner.border.stripes[0].color].join());
            }
        }
        expect(drawn.size).toBe(pairs.length);
    });

    it('hangs very aged decorations in caves', () => {
        for (const seed of SEEDS.slice(0, 50)) {
            expect(drawTheme({ seed, ambiance: 'cave' }).theme.decor.age).toBeGreaterThanOrEqual(
                0.85,
            );
        }
        expect(() =>
            generateSet({ seed: 1, ambiance: 'cave', theme: { decor: { age: 2 } } }),
        ).toThrow(/theme\.decor/);
    });

    it('keeps every edge of the banner walls those of the plain wall', () => {
        for (const ambiance of Object.keys(ambiances)) {
            for (const seed of SEEDS.slice(0, 5)) {
                const set = generateSet({ seed, ambiance, size: [32, 64] });
                const render = (name: string) =>
                    renderTexture(set.textures[name], createMemoryLoader({}));
                const plain = render('plain-wall');
                const hung = render('banner-wall-1');
                for (let y = 0; y < plain.height; y++) {
                    for (const x of [0, plain.width - 1]) {
                        expect(hung.getPixel(x, y)).toBe(plain.getPixel(x, y));
                    }
                }
                for (let x = 0; x < plain.width; x++) {
                    expect(hung.getPixel(x, plain.height - 1)).toBe(
                        plain.getPixel(x, plain.height - 1),
                    );
                }
            }
        }
    });

    it('glazes the window of interiors, framed by beams, with plain curtains one time in two', () => {
        let curtained = 0;
        for (const seed of SEEDS) {
            const { textures } = generateSet({ seed, ambiance: 'interior' });
            const window = textures['small-window'];
            expect(window.seed).toBe(textures['plain-wall'].seed);
            const templates = window.patches.map((p) => (p.patch as { template: string }).template);
            expect(templates.slice(0, 8)).toEqual([
                'planks',
                'entablature',
                'opening',
                'window',
                'woodbeam',
                'woodbeam',
                'woodbeam',
                'woodbeam',
            ]);
            const [, , opening, glazed, left, right, top, bottom] = window.patches;
            expect(opening).toMatchObject({ x: 15, y: 20, width: 70, height: 60 });
            expect(opening.patch).toMatchObject({ back: { mode: 'cut' } });
            expect(glazed.anchor).toEqual({ to: 'window', at: 'opening' });
            // the beams around the edges of the opening
            expect(left.x! + left.width!).toBeCloseTo(15);
            expect(right.x).toBe(85);
            expect(top.y! + top.height!).toBeCloseTo(20);
            expect(bottom.y).toBe(80);
            // after the wall, its trim, the opening, the glass and the four beams
            const curtains = window.patches.slice(8);
            if (curtains.length > 0) {
                ++curtained;
                expect(curtains).toHaveLength(2);
                const [a, b] = curtains.map(
                    (c) =>
                        c.patch as {
                            template: string;
                            fabric: { color: string };
                            border: { stripes: unknown[] };
                            pattern: { kind: string };
                        },
                );
                expect(a.template).toBe('banner');
                // plain and of a single color, the same for both
                expect(a.border.stripes).toEqual([]);
                expect(a.pattern.kind).toBe('none');
                expect(b.fabric.color).toBe(a.fabric.color);
                // on both sides of the window, inside the opening
                expect(curtains[0].x).toBe(15);
                expect(curtains[1].x! + curtains[1].width!).toBe(85);
            }
        }
        expect(curtained / SEEDS.length).toBeGreaterThan(0.35);
        expect(curtained / SEEDS.length).toBeLessThan(0.65);
        // the room behind shows through the glass
        const set = generateSet({ seed: 3, ambiance: 'interior' });
        const t = renderTexture(set.textures['small-window'], createMemoryLoader({}));
        expect(t.getPixel(24, 50) & 0xff).toBeGreaterThan(0);
        expect(t.getPixel(24, 50) & 0xff).toBeLessThan(128);
    });

    it('closes the way of interiors with four wooden posts and a rail across them', () => {
        for (const seed of SEEDS.slice(0, 20)) {
            const { textures } = generateSet({ seed, ambiance: 'interior' });
            const way = textures['barred-way'];
            expect(way.seed).toBe(textures['plain-wall'].seed);
            const templates = way.patches.map((p) => (p.patch as { template: string }).template);
            expect(templates).toEqual([
                'planks',
                'opening',
                'woodbeam',
                'woodbeam',
                'woodbeam',
                'woodbeam',
                'woodbeam',
            ]);
            const posts = way.patches.slice(2, 6);
            for (const post of posts) {
                expect(post.patch).toMatchObject({ direction: 'vertical' });
                expect(post).toMatchObject({ y: 0, height: 100, width: 10 });
            }
            expect(posts.map((p) => p.x)).toEqual([7.5, 32.5, 57.5, 82.5]);
            expect(way.patches[6]).toMatchObject({ x: 0, y: 66, width: 100, height: 10 });
        }
        // transparent between the posts, above the rail
        const set = generateSet({ seed: 1, ambiance: 'interior' });
        const t = renderTexture(set.textures['barred-way'], createMemoryLoader({}));
        expect(t.getPixel(13, 40) & 0xff).toBe(0);
        expect(t.getPixel(8, 40) & 0xff).toBe(255);
        expect(t.getPixel(13, 90) & 0xff).toBe(255);
    });

    it('furnishes every ambiance with tables and an altar, alone on transparent textures', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const { textures, theme } = generateSet({ seed: 3, ambiance });
            for (const name of ['wooden-table', 'metal-table', 'stone-altar']) {
                const texture = textures[name];
                expect(texture.background, name).toBe('#0000');
                // no wall: the engine draws it behind; a cobweb hangs under the top
                for (const placement of texture.patches.filter((p) => p.id !== 'cobweb')) {
                    expect(placement.patch, name).toMatchObject({ age: theme.decor.age });
                    expect(placement.y, name).toBeGreaterThanOrEqual(50);
                }
            }
            // a table: two legs, then a top across the whole width at mid-height
            for (const [name, template] of [
                ['wooden-table', 'woodbeam'],
                ['metal-table', 'beam'],
            ]) {
                const [left, right, top] = textures[name].patches.filter((p) => p.id !== 'cobweb');
                expect(top).toMatchObject({ patch: { template }, x: 0, y: 50, width: 100 });
                for (const leg of [left, right]) {
                    expect(leg.patch).toMatchObject({ template, direction: 'vertical' });
                    expect(leg.y! + leg.height!).toBeCloseTo(100, 1);
                    expect(leg.width!).toBeLessThan(15);
                }
                expect(left.x).toBe(10);
                expect(right.x! + right.width!).toBeCloseTo(90, 1);
            }
            const [metalLeg] = textures['metal-table'].patches.filter((p) => p.id !== 'cobweb');
            expect(metalLeg.patch).toMatchObject({ profile: 'flat' });
            // an altar: a slab from mid-height to the floor, a pointed crimson cloth on it
            const [slab, cloth] = textures['stone-altar'].patches;
            expect(slab).toMatchObject({
                patch: { template: 'stoneslab' },
                x: 0,
                y: 50,
                width: 100,
                height: 50,
            });
            expect(cloth.patch).toMatchObject({
                template: 'banner',
                shape: { base: 'point' },
                fabric: { color: '#8c1028' },
                rod: { enabled: false },
            });
        }
        // transparent above the table, and between its legs
        const set = generateSet({ seed: 3, ambiance: 'dungeon', size: [64, 128] });
        const texture = renderTexture(set.textures['wooden-table'], createMemoryLoader({}));
        const alpha = (x: number, y: number) => texture.getPixel(x, y) & 0xff;
        expect(alpha(32, 20)).toBe(0);
        expect(alpha(32, 110)).toBe(0);
        expect(alpha(32, 68)).toBe(255);
    });

    it('sets full-height shelves against the darkened wall, in wood and in metal', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const { textures, theme } = generateSet({ seed: 3, ambiance });
            for (const [name, template] of [
                ['wooden-shelves', 'woodbeam'],
                ['metal-shelves', 'beam'],
            ]) {
                const shelves = textures[name];
                expect(shelves.seed, name).toBe(textures['plain-wall'].seed);
                expect(shelves.patches[0]).toEqual(textures['plain-wall'].patches[0]);
                const [, back, ...beams] = shelves.patches.filter((p) => p.id !== 'cobweb');
                // darker than the back of an alcove
                expect(back).toMatchObject({
                    patch: { template: 'opening', back: { mode: 'shade', shade: 0.75 } },
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                });
                const [s0, s30, s60, s90, left, right] = beams;
                for (const [shelf, y] of [
                    [s0, 0],
                    [s30, 30],
                    [s60, 60],
                    [s90, 90],
                ] as const) {
                    expect(shelf).toMatchObject({ x: 0, y, width: 100, height: 10 });
                }
                expect(left).toMatchObject({ x: 0, y: 0, width: 15, height: 100 });
                expect(right).toMatchObject({ x: 85, y: 0, width: 15, height: 100 });
                for (const beam of beams) {
                    expect(beam.patch).toMatchObject({ template, age: theme.decor.age });
                }
            }
        }
        // darker than the alcove background, behind the shelves
        const set = generateSet({ seed: 3, ambiance: 'dungeon', size: [64, 128] });
        const render = (name: string) => renderTexture(set.textures[name], createMemoryLoader({}));
        const [alcove, shelves] = [render('alcove-background'), render('wooden-shelves')];
        let [a, s] = [0, 0];
        for (let y = 14; y < 38; ++y) {
            for (let x = 15; x < 49; ++x) {
                a += alcove.getPixel(x, y) >>> 24;
                s += shelves.getPixel(x, y) >>> 24;
            }
        }
        expect(s).toBeLessThan(a);
    });

    it('spins cobwebs on furniture as often as the decorations are worn', () => {
        const furniture = ['wooden-table', 'metal-table', 'wooden-shelves', 'metal-shelves'];
        const share: Record<string, number> = {};
        for (const ambiance of Object.keys(ambiances)) {
            let [webs, ages] = [0, 0];
            for (const seed of SEEDS.slice(0, 100)) {
                const { textures, theme } = generateSet({ seed, ambiance });
                ages += theme.decor.age;
                for (const name of furniture) {
                    const web = textures[name].patches.find((p) => p.id === 'cobweb');
                    if (!web) {
                        continue;
                    }
                    ++webs;
                    const corner = (web.patch as { corner: string }).corner;
                    expect(web.patch).toMatchObject({ template: 'cobweb', age: theme.decor.age });
                    expect(['top-left', 'top-right']).toContain(corner);
                    // drawn before the beams, which cover its edges
                    expect(textures[name].patches.indexOf(web)).toBeLessThan(
                        textures[name].patches.findIndex((p) =>
                            ['woodbeam', 'beam'].includes(
                                (p.patch as { template: string }).template,
                            ),
                        ),
                    );
                    // on the side it radiates from
                    expect(web.x! + web.width! / 2 < 50).toBe(corner === 'top-left');
                }
            }
            share[ambiance] = webs / (100 * furniture.length);
            // about as often as the age, on average
            expect(share[ambiance]).toBeCloseTo(ages / 100, 1);
        }
        expect(share.cave).toBeGreaterThan(share.dungeon);
        expect(share.dungeon).toBeGreaterThan(share.interior);
    });

    it('draws a debug texture: the main palette and the ages of the theme', () => {
        for (const ambiance of Object.keys(ambiances)) {
            const { textures, theme } = generateSet({ seed: 3, ambiance });
            const debug = textures.debug;
            const palette = mainPalette(theme);
            expect(palette.length).toBeGreaterThan(1);
            const fills = debug.patches.map(
                (p) => (p.patch as { back: { color: string } }).back.color,
            );
            // a swatch per color, from the darkest
            expect(fills.slice(0, palette.length)).toEqual(palette);
            // the bars, filled up to the ages, out of 84 percent
            const filled = debug.patches.filter((p) => p.width! > 2 && p.width! < 84);
            expect(filled.map((p) => p.width)).toEqual([
                Math.round(84 * (theme.wall.age as number) * 100) / 100,
                Math.round(84 * theme.decor.age * 100) / 100,
            ]);
        }
    });

    it('lays square floors and ceilings, darker than the wall, from seeds of their own', () => {
        const material = { dungeon: 'ashlar', cave: 'dirt', interior: 'planks' };
        for (const ambiance of Object.keys(ambiances)) {
            const { textures } = generateSet({ seed: 3, ambiance, size: [32, 48] });
            const [plain, floor, splattered, ceiling, hatch] = [
                'plain-wall',
                'floor',
                'floor-splattered',
                'ceiling',
                'ceiling-opening',
            ].map((name) => textures[name]);
            for (const flat of [floor, splattered, ceiling, hatch]) {
                expect(flat.size).toEqual([32, 32]);
            }
            expect(floor.patches[0].patch).toMatchObject({
                template: material[ambiance as keyof typeof material],
            });
            // stones or planks of their own
            expect(floor.seed).not.toBe(plain.seed);
            expect(ceiling.seed).not.toBe(floor.seed);
            // the same floor under the splashes, kept inside it; the same ceiling around the
            // hatch
            expect(splattered.seed).toBe(floor.seed);
            expect(splattered.patches[0]).toEqual(floor.patches[0]);
            for (const splash of splattered.patches.slice(1)) {
                expect(splash).toMatchObject({ patch: { template: 'splatter' }, wrap: false });
            }
            expect(hatch.seed).toBe(ceiling.seed);
            expect(hatch.patches[0]).toEqual(ceiling.patches[0]);
            expect(hatch.patches[1]).toMatchObject(
                ambiance === 'cave'
                    ? // no opening in the ceiling of a cave, but a breach
                      { patch: { template: 'breach' }, x: 20, y: 20, width: 60, height: 60 }
                    : {
                          patch: { template: 'opening', back: { mode: 'color' } },
                          x: 25,
                          y: 25,
                          width: 50,
                          height: 50,
                      },
            );
            // the wall, then the floor a little darker, then the ceiling darker still
            // the wall alone, without the trim of interiors: what the ground is measured against
            const alone = { ...plain, patches: plain.patches.slice(0, 1) };
            const lightness = (name: string) => {
                const definition = name === 'wall-alone' ? alone : textures[name];
                const t = renderTexture(definition, createMemoryLoader({}));
                let sum = 0;
                for (let i = 0; i < t.data.length; i += 4) {
                    sum += t.data[i] + t.data[i + 1] + t.data[i + 2];
                }
                return sum / (t.width * t.height);
            };
            const [low, high] = ['floor', 'ceiling'].map(lightness);
            const wall = lightness('wall-alone');
            expect(low / wall, ambiance).toBeCloseTo(0.8, 1);
            expect(high / wall, ambiance).toBeCloseTo(0.6, 1);
        }
    });

    it('lays a floor of brown earth in caves, whatever the color of their stones', () => {
        for (const seed of SEEDS.slice(0, 12)) {
            const { textures } = generateSet({ seed, ambiance: 'cave', size: [32, 48] });
            const t = renderTexture(textures.floor, createMemoryLoader({}));
            let [r, b] = [0, 0];
            for (let i = 0; i < t.data.length; i += 4) {
                r += t.data[i];
                b += t.data[i + 2];
            }
            // brown: clearly more red than blue
            expect(r / b, `seed ${seed}`).toBeGreaterThan(1.25);
        }
    });

    it('breaks the ceiling of caves with a breach, without rubble, never from an edge', () => {
        const shapes = new Set<string>();
        for (const seed of SEEDS.slice(0, 40)) {
            const { textures } = generateSet({ seed, ambiance: 'cave' });
            const [, breach] = textures['ceiling-opening'].patches;
            const patch = breach.patch as { hole: { shape: string }; rubble: { amount: number } };
            expect(patch.rubble.amount).toBe(0);
            expect(breach.wrap).toBe(false);
            shapes.add(patch.hole.shape);
        }
        expect([...shapes].sort()).toEqual(['bore', 'burst', 'fissure', 'pocks']);
    });

    it('runs an entablature along the floor of interior walls, right after the wall', () => {
        const trimmed = [
            'plain-wall',
            'splattered-wall',
            'burnt-wall',
            'banner-wall-1',
            'banner-wall-2',
            'small-window',
            'door-frame',
        ];
        for (const seed of SEEDS.slice(0, 10)) {
            const { textures, theme } = generateSet({ seed, ambiance: 'interior' });
            const palette = mainPalette(theme);
            expect(theme.trim).toMatchObject({
                patch: { template: 'entablature', marble: { palette }, age: theme.decor.age },
                x: 0,
                y: 85,
                width: 100,
                height: 15,
                wrap: false,
            });
            for (const name of trimmed) {
                expect(textures[name].patches[1], name).toEqual(theme.trim);
            }
            // not in the other textures, which show the wall otherwise or not at all
            for (const name of ['alcove-background', 'barred-way', 'wooden-shelves', 'floor']) {
                expect(
                    textures[name].patches.some((p) => p.id === 'trim'),
                    name,
                ).toBe(false);
            }
        }
        // no trim in dungeons and caves
        for (const ambiance of ['dungeon', 'cave']) {
            const { textures, theme } = generateSet({ seed: 1, ambiance });
            expect(theme.trim).toBeUndefined();
            expect(textures['plain-wall'].patches).toHaveLength(1);
        }
    });

    it('hangs single and double doors of the style of each ambiance, metal ones in dungeons', () => {
        const styles = { interior: 'fancy', dungeon: 'solid', cave: 'rough' };
        for (const ambiance of Object.keys(ambiances)) {
            for (const seed of SEEDS.slice(0, 10)) {
                const { textures, theme } = generateSet({ seed, ambiance, size: [64, 96] });
                const doors = Object.keys(textures).filter(
                    (n) => n.includes('door-s') || n.includes('door-d'),
                );
                expect(doors.sort()).toEqual(
                    ambiance === 'dungeon'
                        ? ['door-double', 'door-single', 'metal-door-double', 'metal-door-single']
                        : ['door-double', 'door-single'],
                );
                for (const name of doors) {
                    const [door] = textures[name].patches;
                    const metal = name.startsWith('metal');
                    expect(textures[name].patches).toHaveLength(1);
                    expect(door).toMatchObject({ width: 100, height: 100 });
                    expect(door.patch).toMatchObject({
                        template: 'door',
                        size: [64, 96],
                        kind: name.endsWith('single') ? 'single' : 'double',
                        // a single door opens from right to left
                        hinge: 'left',
                        material: metal ? 'metal' : 'wood',
                        age: theme.decor.age,
                    });
                    if (!metal) {
                        expect(door.patch).toMatchObject({
                            style: styles[ambiance as keyof typeof styles],
                        });
                    }
                }
            }
        }
        // interior doors: the wood of the wall, darker, so that their panels stand out
        const lightness = (css: string) => {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
            return r + g + b;
        };
        for (const seed of SEEDS.slice(0, 10)) {
            const { textures } = generateSet({ seed, ambiance: 'interior' });
            const wall = textures['plain-wall'].patches[0].patch as { wood: { palette: string[] } };
            const door = textures['door-single'].patches[0].patch as {
                wood: { palette: string[] };
            };
            const darkest = Math.max(...door.wood.palette.map(lightness));
            expect(darkest).toBeLessThan(lightness(wall.wood.palette[1]));
        }
        // the single and the double door of a set are not drawn alike
        const { textures } = generateSet({ seed: 7, ambiance: 'dungeon' });
        expect(textures['door-single'].seed).not.toBe(textures['door-double'].seed);
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
                // floors and ceilings are squares as wide as the walls
                const flat = name.startsWith('floor') || name.startsWith('ceiling');
                expect([texture.width, texture.height], name).toEqual(flat ? [32, 32] : [32, 64]);
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
