/**
 * Writes the generated documentation pages and the preview images of `documentation/`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
    ashlar,
    createMemoryLoader,
    generators,
    renderTexture,
    Texture,
    type Placement,
} from '../src';
import { encodePng } from '../src/cli/png';
import { renderDocs } from './docs';

const SEED = 1234;

/**
 * Nearest-neighbour enlargement, so that pixels stay crisp in any Markdown viewer.
 */
function enlarge(texture: Texture, factor: number): Texture {
    const out = new Texture(texture.width * factor, texture.height * factor);
    for (let y = 0; y < out.height; ++y) {
        for (let x = 0; x < out.width; ++x) {
            out.setPixel(x, y, texture.getPixel(Math.floor(x / factor), Math.floor(y / factor)));
        }
    }
    return out;
}

/**
 * Textures side by side, separated by a gap.
 */
function strip(textures: Texture[], gap = 8): Texture {
    const width = textures.reduce((w, t) => w + t.width, 0) + gap * (textures.length - 1);
    const height = Math.max(...textures.map((t) => t.height));
    const out = new Texture(width, height).fill(0x00000000);
    let x = 0;
    for (const t of textures) {
        out.draw(t, x, 0);
        x += t.width + gap;
    }
    return out;
}

/** a wall with moss under each joint */
function mossyWall(size: [number, number]): Texture {
    const patches: Placement[] = [
        { id: 'wall', patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            patch: { template: 'moss' },
            anchor: { to: 'wall', at: 'rows' },
            width: 100,
            height: 25,
        },
    ];
    return renderTexture({ size, seed: SEED, patches }, createMemoryLoader({}));
}

/** a brick wall with a doorway, open at the bottom */
function openingWall(): Texture {
    const patches: Placement[] = [
        { patch: { template: 'bricks' }, width: 100, height: 100 },
        {
            patch: { template: 'opening', depth: 3, open: ['bottom'] },
            x: 25,
            y: 25,
            width: 50,
            height: 75,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a sheet of parchment on a stone wall */
function parchmentWall(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            patch: { template: 'parchment', ...(age === undefined ? {} : { age }) },
            x: 25,
            y: 18.75,
            width: 50,
            height: 62.5,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a swallowtailed banner hanging on a stone wall */
function bannerWall(age?: number): Texture {
    const patches: Placement[] = [
        {
            patch: { template: 'ashlar', size: [64, 128], rows: { count: 8 } },
            width: 100,
            height: 100,
        },
        {
            patch: {
                template: 'banner',
                shape: { base: 'swallowtail', depth: 0.3 },
                ...(age === undefined ? {} : { age }),
            },
            x: 31.25,
            y: 3,
            width: 37.5,
            height: 43.75,
        },
    ];
    return renderTexture({ size: [64, 128], seed: SEED, patches }, createMemoryLoader({}));
}

/** an alcove in a brick wall, framed by two vertical beams and a lintel */
function beamAlcove(age?: number): Texture {
    const aged = age === undefined ? {} : { age };
    const post = { template: 'beam', direction: 'vertical', size: [9, 96], ...aged };
    const patches: Placement[] = [
        {
            patch: { template: 'bricks', size: [64, 128], rows: { count: 16 } },
            width: 100,
            height: 100,
        },
        {
            patch: {
                template: 'opening',
                depth: 4,
                back: { mode: 'shade', shade: 0.75 },
                open: ['bottom'],
            },
            x: 25,
            y: 31.25,
            width: 50,
            height: 68.75,
        },
        { patch: post, x: 14, y: 25, width: 14.06, height: 75 },
        { patch: post, x: 72, y: 25, width: 14.06, height: 75 },
        {
            patch: { template: 'beam', size: [64, 10], ...aged },
            x: 12.5,
            y: 23.4,
            width: 76,
            height: 7.8,
        },
    ];
    return renderTexture({ size: [64, 128], seed: SEED, patches }, createMemoryLoader({}));
}

/** a barred window in a stone wall */
function barsWindow(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            id: 'hole',
            patch: { template: 'opening', depth: 3 },
            x: 25,
            y: 18.75,
            width: 50,
            height: 56.25,
        },
        {
            patch: {
                template: 'bars',
                size: [26, 30],
                bars: { count: 4 },
                ...(age === undefined ? {} : { age }),
            },
            anchor: { to: 'hole', at: 'opening' },
            width: 40.6,
            height: 46.9,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a window in a stone wall, with cobwebs in its corners */
function cobwebWindow(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            id: 'window',
            patch: { template: 'opening', depth: 3 },
            x: 18.75,
            y: 18.75,
            width: 62.5,
            height: 62.5,
        },
        {
            patch: { template: 'cobweb', ...(age === undefined ? {} : { age }) },
            anchor: { to: 'window', at: 'corners', mirror: true },
            width: 25,
            height: 25,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a window in a stone wall, over a dark room so that the glass shows */
function windowWall(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            id: 'hole',
            patch: { template: 'opening', depth: 3, back: { mode: 'color', color: '#151a20' } },
            x: 25,
            y: 18.75,
            width: 50,
            height: 56.25,
        },
        {
            patch: { template: 'window', size: [26, 30], ...(age === undefined ? {} : { age }) },
            anchor: { to: 'hole', at: 'opening' },
            width: 40.6,
            height: 46.9,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a bookcase over a stone wall */
function bookshelfWall(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            patch: { template: 'bookshelf', ...(age === undefined ? {} : { age }) },
            width: 100,
            height: 100,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** chains hanging on a stone wall */
function chainWall(age?: number): Texture {
    const aged = age === undefined ? {} : { age };
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        ...[10, 40, 70].map((x, i): Placement => ({
            patch: { template: 'chain', ...aged },
            x,
            y: 8,
            width: 18.75,
            height: 75,
            seed: i + 1,
        })),
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** two columns on a stone wall */
function columnWall(age?: number): Texture {
    const aged = age === undefined ? {} : { age };
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        { patch: { template: 'column', ...aged }, x: 8, width: 25, height: 100, seed: 1 },
        {
            patch: { template: 'column', order: 'ionic', ...aged },
            x: 60,
            width: 25,
            height: 100,
            seed: 2,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a portico: an entablature over two columns */
function portico(age?: number): Texture {
    const aged = age === undefined ? {} : { age };
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        { patch: { template: 'entablature', ...aged }, y: 6, width: 100, height: 25 },
        { patch: { template: 'column', ...aged }, x: 6, y: 31, width: 22, height: 69, seed: 1 },
        { patch: { template: 'column', ...aged }, x: 72, y: 31, width: 22, height: 69, seed: 2 },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a shield over crossed swords, on a stone wall */
function shieldWall(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar', size: [48, 48], rows: { count: 3 } } },
        {
            patch: {
                template: 'shield',
                size: [32, 40],
                swords: true,
                field: { division: 'pale' },
                charge: { ordinary: 'saltire' },
                ...(age === undefined ? {} : { age }),
            },
            x: 16.7,
            y: 8.3,
            width: 66.7,
            height: 83.3,
        },
    ];
    return renderTexture({ size: [48, 48], seed: SEED, patches }, createMemoryLoader({}));
}

/** a tapestry on a stone wall */
function tapestryWall(age?: number): Texture {
    const patches: Placement[] = [
        { patch: { template: 'ashlar' }, width: 100, height: 100 },
        {
            patch: { template: 'tapestry', ...(age === undefined ? {} : { age }) },
            x: 6,
            y: 8,
            width: 88,
            height: 62.5,
        },
    ];
    return renderTexture({ size: [64, 64], seed: SEED, patches }, createMemoryLoader({}));
}

/** a slot beside a sliding metal door */
function slotWall(age?: number): Texture {
    const aged = age === undefined ? {} : { age };
    const patches: Placement[] = [
        { patch: { template: 'metal', size: [64, 128] } },
        {
            patch: { template: 'door', material: 'metal', ...aged },
            x: 12.5,
            width: 50,
            height: 100,
        },
        {
            patch: { template: 'slot', size: [10, 128], ...aged },
            x: 62.5,
            width: 15.6,
            height: 100,
        },
    ];
    return renderTexture({ size: [64, 128], seed: SEED, patches }, createMemoryLoader({}));
}

const images: Record<string, Texture> = {
    'layout-detail.png': strip([
        enlarge(ashlar.generate({ seed: SEED }), 4),
        enlarge(ashlar.generate({ seed: SEED, width: 128, height: 128 }), 2),
    ]),
    'anchors.png': enlarge(mossyWall([128, 128]), 3),
};
for (const g of Object.values(generators)) {
    if ('age' in g.defaults) {
        images[`${g.name}-ages.png`] = strip(
            [0, 0.3, 0.6, 1].map((age) => {
                if (g.name === 'parchment') {
                    return enlarge(parchmentWall(age), 3);
                }
                if (g.name === 'banner') {
                    return enlarge(bannerWall(age), 2);
                }
                if (g.name === 'beam') {
                    return enlarge(beamAlcove(age), 2);
                }
                if (g.name === 'bars') {
                    return enlarge(barsWindow(age), 3);
                }
                if (g.name === 'cobweb') {
                    return enlarge(cobwebWindow(age), 3);
                }
                if (g.name === 'window') {
                    return enlarge(windowWall(age), 3);
                }
                if (g.name === 'bookshelf') {
                    return enlarge(bookshelfWall(age), 3);
                }
                if (g.name === 'chain') {
                    return enlarge(chainWall(age), 3);
                }
                if (g.name === 'column') {
                    return enlarge(columnWall(age), 3);
                }
                if (g.name === 'entablature') {
                    return enlarge(portico(age), 3);
                }
                if (g.name === 'shield') {
                    return enlarge(shieldWall(age), 4);
                }
                if (g.name === 'tapestry') {
                    return enlarge(tapestryWall(age), 3);
                }
                if (g.name === 'slot') {
                    return enlarge(slotWall(age), 2);
                }
                // only templates having an age get here
                const options = { seed: SEED, age };
                return enlarge(g.generate(options), 3);
            }),
        );
    }
    images[`${g.name}.png`] =
        g.name === 'moss'
            ? enlarge(mossyWall([64, 64]), 4)
            : g.name === 'opening'
              ? enlarge(openingWall(), 4)
              : g.name === 'parchment'
                ? enlarge(parchmentWall(), 4)
                : g.name === 'banner'
                  ? enlarge(bannerWall(), 3)
                  : g.name === 'beam'
                    ? enlarge(beamAlcove(), 3)
                    : g.name === 'bars'
                      ? enlarge(barsWindow(), 4)
                      : g.name === 'cobweb'
                        ? enlarge(cobwebWindow(), 4)
                        : g.name === 'window'
                          ? enlarge(windowWall(), 4)
                          : g.name === 'bookshelf'
                            ? enlarge(bookshelfWall(), 4)
                            : g.name === 'chain'
                              ? enlarge(chainWall(), 4)
                              : g.name === 'column'
                                ? enlarge(columnWall(), 4)
                                : g.name === 'entablature'
                                  ? enlarge(portico(), 4)
                                  : g.name === 'shield'
                                    ? enlarge(shieldWall(), 5)
                                    : g.name === 'tapestry'
                                      ? enlarge(tapestryWall(), 4)
                                      : g.name === 'slot'
                                        ? enlarge(slotWall(), 3)
                                        : enlarge(g.generate({ seed: SEED }), 4);
}

const pages = await renderDocs();
for (const [path, content] of Object.entries(pages)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(path);
}
mkdirSync('documentation/images', { recursive: true });
for (const [name, texture] of Object.entries(images)) {
    writeFileSync(`documentation/images/${name}`, encodePng(texture));
    console.log(`documentation/images/${name}`);
}
