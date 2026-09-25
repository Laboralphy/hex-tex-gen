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
