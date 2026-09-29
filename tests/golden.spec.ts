import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    ambiances,
    createMemoryLoader,
    generateSet,
    generators,
    renderTexture,
    renderTextureFile,
    type Texture,
} from '../src';
import { createNodeLoader } from '../src/cli/node-loader';

/**
 * Golden tests: every example texture, every template with its defaults and the texture
 * sets of a few seeds are rendered and their pixels hashed. A changed hash means a changed look: check the render, then
 * accept the change with `npx vitest -u`.
 */

const EXAMPLES = join(__dirname, '..', 'examples');

/** texture files of the examples; patch files are covered through them */
function exampleTextures(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) {
                return entry.name === 'patches' ? [] : exampleTextures(path);
            }
            return entry.name.endsWith('.json') ? [path] : [];
        })
        .sort();
}

function digest(texture: Texture): string {
    const hash = createHash('sha256').update(texture.data).digest('hex');
    return `${texture.width}x${texture.height} ${hash}`;
}

describe('golden examples', () => {
    const loader = createNodeLoader();
    it.each(exampleTextures(EXAMPLES).map((file) => [relative(EXAMPLES, file), file]))(
        '%s',
        (_, file) => {
            expect(digest(renderTextureFile(file, loader))).toMatchSnapshot();
        },
    );
});

describe('golden templates', () => {
    it.each(Object.keys(generators))('%s', (name) => {
        expect(digest(generators[name].generate({ seed: 1 }))).toMatchSnapshot();
    });
});

describe('golden sets', () => {
    const cases = Object.keys(ambiances).flatMap((ambiance) =>
        [1, 2, 3].map((seed) => [ambiance, seed] as const),
    );
    it.each(cases)('%s, seed %i', (ambiance, seed) => {
        const set = generateSet({ seed, ambiance });
        const loader = createMemoryLoader({});
        const digests = Object.fromEntries(
            Object.entries(set.textures).map(([name, definition]) => [
                name,
                digest(renderTexture(definition, loader)),
            ]),
        );
        expect(digests).toMatchSnapshot();
    });
});
