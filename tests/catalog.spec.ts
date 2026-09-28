import { describe, expect, it } from 'vitest';
import {
    ashlar,
    CATEGORIES,
    deepMerge,
    describeParameters,
    expandPath,
    generators,
    templateCatalog,
} from '../src';

describe('templateCatalog', () => {
    it('lists every template, its category, size and flags', () => {
        const catalog = templateCatalog();
        expect(catalog.map((t) => t.name)).toEqual(Object.keys(generators));
        for (const t of catalog) {
            expect(CATEGORIES).toContain(t.category);
            expect(t.size).toEqual(generators[t.name].defaults.size);
        }
        const moss = catalog.find((t) => t.name === 'moss')!;
        expect([moss.category, moss.overlay, moss.ages]).toEqual(['natural', true, false]);
        const ashlarInfo = catalog.find((t) => t.name === 'ashlar')!;
        expect([ashlarInfo.overlay, ashlarInfo.ages]).toEqual([false, true]);
        expect(Object.keys(ashlarInfo.anchors)).toContain('rows');
    });
});

describe('describeParameters', () => {
    const find = (template: string, path: string) =>
        describeParameters(generators[template]).find((p) => p.path === path)!;

    it('flattens nested groups into dotted paths, leaving the size out', () => {
        const paths = describeParameters(ashlar).map((p) => p.path);
        expect(paths).toContain('stone.palette');
        expect(paths).toContain('stone.noise.octaves');
        expect(paths).not.toContain('size');
    });

    it('tells the kind of each parameter', () => {
        expect(find('ashlar', 'stone.palette').kind).toBe('palette');
        expect(find('ashlar', 'mortar.color').kind).toBe('color');
        expect(find('ashlar', 'blocks.width')).toMatchObject({ kind: 'range', default: [14, 30] });
        expect(find('ashlar', 'rows.count').kind).toBe('integer');
        expect(find('shield', 'shape')).toMatchObject({
            kind: 'enum',
            options: ['heater', 'round', 'kite'],
        });
        expect(find('shield', 'field.tinctures').kind).toBe('colors');
        expect(find('opening', 'open')).toMatchObject({
            kind: 'choices',
            options: ['top', 'left', 'right', 'bottom'],
        });
        expect(find('age' in ashlar.defaults ? 'ashlar' : 'moss', 'age')).toMatchObject({
            kind: 'number',
            minimum: 0,
            maximum: 1,
        });
    });

    it('marks the wear parameters derived from age, and the scale of pixel values', () => {
        expect(find('ashlar', 'chips.ratio')).toMatchObject({ fromAge: true, default: undefined });
        expect(find('ashlar', 'rows.count').fromAge).toBe(false);
        expect(find('ashlar', 'mortar.size').scale).toBe('detail');
        expect(find('ashlar', 'blocks.width').scale).toBe('layout');
    });

    it('marks the essential parameters: age, colors, top-level style choices', () => {
        const essential = (template: string) =>
            describeParameters(generators[template])
                .filter((p) => p.essential)
                .map((p) => p.path);
        expect(essential('ashlar')).toEqual(
            expect.arrayContaining(['age', 'stone.palette', 'mortar.color']),
        );
        expect(essential('ashlar')).not.toContain('stone.noise.octaves');
        expect(essential('shield')).toEqual(
            expect.arrayContaining(['shape', 'swords', 'field.tinctures']),
        );
    });

    it('flags as derived from age only parameters without a default, of aging templates', () => {
        for (const g of Object.values(generators)) {
            const derived = describeParameters(g).filter((p) => p.fromAge);
            for (const p of derived) {
                expect(p.default, `${g.name}.${p.path}`).toBeUndefined();
            }
            if (derived.length > 0) {
                expect('age' in g.defaults, g.name).toBe(true);
            }
        }
    });
});

describe('expandPath', () => {
    it('turns a form field back into parameters', () => {
        const params = deepMerge(
            expandPath('stone.palette', ['#000000', '#ffffff']),
            expandPath('mortar.size', 3),
        );
        expect(params).toEqual({ stone: { palette: ['#000000', '#ffffff'] }, mortar: { size: 3 } });
        expect(ashlar.generate({ seed: 1, ...params }).width).toBe(64);
    });
});
