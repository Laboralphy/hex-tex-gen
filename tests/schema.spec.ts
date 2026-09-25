import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ashlar, createMemoryLoader, generators, loadPatch, moss, renderTexture } from '../src';
import { patchJsonSchema, textureJsonSchema } from '../src/schemas';

describe('generator parameters', () => {
    it('derives the defaults from the schema', () => {
        // wear values have no default: they are derived from age
        expect(ashlar.defaults.mortar).toEqual({ size: 2, color: '#24211d' });
        expect(ashlar.defaults.age).toBe(0.3);
        expect(moss.defaults.size).toEqual([64, 16]);
    });

    it.each([
        [
            { mortar: { size: 'big' } },
            'mortar.size: Invalid input: expected number, received string',
        ],
        [{ mortar: { size: 1.5 } }, 'mortar.size: Invalid input: expected int, received number'],
        [{ blocks: { width: 20 } }, 'blocks.width: Invalid input: expected tuple, received number'],
        [{ blocks: { width: [30, 10] } }, 'blocks.width: expected [min, max] with min <= max'],
        [{ chips: { ratio: 2 } }, 'chips.ratio: Too big: expected number to be <=1'],
        [{ stone: { palette: '#zzz' } }, 'stone.palette: Invalid input: expected array'],
        [{ stone: { palette: ['#zzz', '#fff'] } }, 'stone.palette[0]: expected a CSS color'],
        [{ stone: { palette: ['#fff'] } }, 'stone.palette: expected at least two colors'],
        [{ mortar: { sise: 2 } }, 'unknown parameter "mortar.sise"'],
    ])('rejects %j', (params, message) => {
        expect(() => ashlar.generate({ seed: 1, ...params } as never)).toThrow(message);
    });

    it('accepts any CSS color', () => {
        const palette = ['#000', 'rgb(10, 20, 30)', 'hsl(10, 50%, 50%)', 'darkolivegreen'];
        expect(() => ashlar.generate({ seed: 1, stone: { palette } })).not.toThrow();
    });

    it('reports every issue at once', () => {
        expect(() =>
            ashlar.generate({ seed: 1, mortar: { size: -1 }, rows: { count: 0 } } as never),
        ).toThrow(/rows\.count: .*; mortar\.size: /);
    });
});

describe('patch and texture files', () => {
    const loader = createMemoryLoader({
        '/base.json': { $schema: './patch.schema.json', template: 'ashlar' },
        '/child.json': { $schema: './patch.schema.json', extends: './base.json', seed: 3 },
        '/other.json': { extends: './base.json', template: 'moss' },
        '/bad.json': { extends: './base.json', mortar: { color: 'nope' } },
    });

    it('ignores $schema', () => {
        expect(loadPatch('/child.json', loader).params).toEqual({});
        expect(() =>
            renderTexture({ $schema: 'x', size: [8, 8], patches: [] }, loader),
        ).not.toThrow();
    });

    it('rejects a template differing from the parent one', () => {
        expect(() => loadPatch('/other.json', loader)).toThrow(
            '/other.json: template "moss" differs from "ashlar" in /base.json',
        );
    });

    it('reports invalid parameters with their file', () => {
        expect(() => loadPatch('/bad.json', loader)).toThrow(
            '/bad.json: mortar.color: expected a CSS color',
        );
    });

    it('validates placements', () => {
        expect(() =>
            renderTexture({ size: [8, 8], patches: [{ patch: '/base.json', x: 'left' }] }, loader),
        ).toThrow('texture: patches[0].x: Invalid input: expected number, received string');
    });
});

describe('JSON Schemas', () => {
    it('are up to date (run "npm run schemas" otherwise)', () => {
        const read = (file: string) => JSON.parse(readFileSync(`schemas/${file}`, 'utf8'));
        expect(read('patch.schema.json')).toEqual(patchJsonSchema());
        expect(read('texture.schema.json')).toEqual(textureJsonSchema());
    });

    it('have one patch variant per template', () => {
        const titles = (patchJsonSchema().anyOf as { title: string }[]).map((v) => v.title);
        expect(titles).toEqual([...Object.keys(generators), 'extension']);
    });
});
