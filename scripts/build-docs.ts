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

const images: Record<string, Texture> = {
    'ashlar-ages.png': strip(
        [0, 0.3, 0.6, 1].map((age) => enlarge(ashlar.generate({ seed: SEED, age }), 3)),
    ),
    'layout-detail.png': strip([
        enlarge(ashlar.generate({ seed: SEED }), 4),
        enlarge(ashlar.generate({ seed: SEED, width: 128, height: 128 }), 2),
    ]),
    'anchors.png': enlarge(mossyWall([128, 128]), 3),
};
for (const g of Object.values(generators)) {
    images[`${g.name}.png`] =
        g.name === 'moss'
            ? enlarge(mossyWall([64, 64]), 4)
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
