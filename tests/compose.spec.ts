import { describe, expect, it } from 'vitest';
import {
    ashlar,
    createMemoryLoader,
    loadPatch,
    renderPatch,
    renderTexture,
    renderTextureFile,
    Texture,
} from '../src';

const files = {
    '/patches/base.json': { template: 'ashlar', size: [32, 32], mortar: { size: 1 } },
    '/patches/child.json': {
        extends: './base.json',
        seed: 5,
        mortar: { color: '#ff0000' },
        stone: { palette: ['#000', '#fff'] },
    },
    '/patches/loop-a.json': { extends: './loop-b.json' },
    '/patches/loop-b.json': { extends: './loop-a.json' },
    '/patches/typo.json': { extends: './base.json', mortar: { sise: 2 } },
    '/textures/wall.json': {
        size: [64, 64],
        seed: 11,
        patches: [{ patch: '../patches/base.json', width: 100, height: 100 }],
    },
};
const loader = createMemoryLoader(files);

describe('createMemoryLoader', () => {
    it('resolves paths relative to the referencing file', () => {
        expect(loader.resolve('/a/b/c.json', '../d.json')).toBe('/a/d.json');
        expect(loader.resolve('/a/b/c.json', './d.json')).toBe('/a/b/d.json');
        expect(loader.resolve(undefined, 'x/y.json')).toBe('/x/y.json');
    });

    it('reports missing files', () => {
        expect(() => loader.read('/nope.json')).toThrow('/nope.json: file not found');
    });
});

describe('loadPatch', () => {
    it('deep-merges the extends chain', () => {
        const patch = loadPatch('/patches/child.json', loader);
        expect(patch.template).toBe('ashlar');
        expect(patch.seed).toBe(5);
        expect(patch.params).toEqual({
            size: [32, 32],
            mortar: { size: 1, color: '#ff0000' },
            stone: { palette: ['#000', '#fff'] },
        });
    });

    it('resolves inline patches relative to the referencing file', () => {
        const patch = loadPatch({ extends: '../patches/base.json' }, loader, '/textures/x.json');
        expect(patch.params.size).toEqual([32, 32]);
    });

    it('detects circular extends', () => {
        expect(() => loadPatch('/patches/loop-a.json', loader)).toThrow(/circular extends/);
    });

    it('reports unknown parameters with their file', () => {
        expect(() => loadPatch('/patches/typo.json', loader)).toThrow(
            '/patches/typo.json: unknown parameter "mortar.sise"',
        );
    });

    it('reports unknown or missing templates', () => {
        expect(() => loadPatch({ template: 'lava' }, loader)).toThrow(/unknown template "lava"/);
        expect(() => loadPatch({ size: [8, 8] }, loader)).toThrow(/missing "template"/);
    });
});

describe('renderPatch', () => {
    it('renders at its own size, or regenerates at another size', () => {
        const patch = loadPatch('/patches/base.json', loader);
        expect(renderPatch(patch, 1).width).toBe(32);
        const large = renderPatch(patch, 1, 96, 48);
        expect([large.width, large.height]).toEqual([96, 48]);
    });
});

describe('renderTexture', () => {
    const base = { template: 'ashlar', size: [32, 32] };

    it('renders a texture file', () => {
        const t = renderTextureFile('/textures/wall.json', loader);
        expect([t.width, t.height]).toEqual([64, 64]);
    });

    it('places and sizes patches in percent, own size by default', () => {
        const t = renderTexture(
            {
                size: [100, 100],
                background: '#00ff00',
                patches: [{ patch: base, x: 50, y: 50 }],
            },
            loader,
        );
        expect(t.getPixel(10, 10)).toBe(0x00ff00ff);
        expect(t.getPixel(49, 49)).toBe(0x00ff00ff);
        expect(t.getPixel(81, 81)).not.toBe(0x00ff00ff);
        expect(t.getPixel(82, 82)).toBe(0x00ff00ff);
    });

    it('wraps placements across the edges', () => {
        const t = renderTexture(
            { size: [64, 64], background: '#00ff00', patches: [{ patch: base, x: 75, y: 75 }] },
            loader,
        );
        // 32px patch at (48, 48) covers 48..63 and wraps onto 0..15
        expect(t.getPixel(0, 0)).not.toBe(0x00ff00ff);
        expect(t.getPixel(16, 16)).toBe(0x00ff00ff);
    });

    it('applies seeds by precedence: placement, patch, global', () => {
        const render = (placement: object, seed?: number) =>
            renderTexture(
                { size: [32, 32], seed, patches: [{ patch: base, ...placement }] },
                loader,
            ).data;
        const own = (seed: number) => ashlar.generate({ size: [32, 32], seed }).data;
        expect(render({}, 3)).toEqual(own(3));
        expect(render({ patch: { ...base, seed: 4 } }, 3)).toEqual(own(4));
        expect(render({ patch: { ...base, seed: 4 }, seed: 5 }, 3)).toEqual(own(5));
        expect(render({})).toEqual(own(0));
    });

    it('lets the caller override the global seed', () => {
        const def = { size: [32, 32], seed: 3, patches: [{ patch: base }] };
        const t = renderTexture(def, loader, { seed: 8 });
        expect(t.data).toEqual(ashlar.generate({ size: [32, 32], seed: 8 }).data);
    });

    it('merges placement params over the patch, and validates them', () => {
        const def = (params: object) => ({ size: [32, 32], patches: [{ patch: base, params }] });
        const t = renderTexture(def({ mortar: { size: 4 } }), loader);
        expect(t.data).toEqual(
            ashlar.generate({ size: [32, 32], seed: 0, mortar: { size: 4 } }).data,
        );
        expect(() => renderTexture(def({ morter: 1 }), loader)).toThrow(
            'texture: patches[0].params: unknown parameter "morter"',
        );
    });

    it('blends with opacity', () => {
        const t = renderTexture(
            {
                size: [32, 32],
                background: '#000000',
                patches: [
                    {
                        patch: { ...base, stone: { palette: ['#fff', '#fff'], grain: 0 } },
                        opacity: 0.5,
                    },
                ],
            },
            loader,
        );
        // a stone pixel away from edges: white at 50% over black, shaded by the stone
        const r = t.data[(16 * 32 + 16) * 4];
        expect(r).toBeGreaterThan(90);
        expect(r).toBeLessThan(160);
    });

    it('validates the definition', () => {
        expect(() => renderTexture({ size: [0, 4], patches: [] }, loader)).toThrow(
            'texture: size[0]: Too small: expected number to be >0',
        );
        expect(() => renderTexture({ size: [4, 4], patches: [], colour: 1 }, loader)).toThrow(
            /unknown key "colour"/,
        );
        expect(() =>
            renderTexture({ size: [4, 4], patches: [{ patch: base, opacity: 2 }] }, loader),
        ).toThrow('texture: patches[0].opacity: Too big: expected number to be <=1');
    });
});

describe('Texture.draw', () => {
    it('composites with alpha', () => {
        const dst = new Texture(2, 2).fill(0x000000ff);
        const src = new Texture(1, 1).fill(0xffffff80);
        dst.draw(src, 1, 1);
        expect(dst.getPixel(0, 0)).toBe(0x000000ff);
        expect(dst.getPixel(1, 1) >>> 8).toBe(0x808080);
    });
});
