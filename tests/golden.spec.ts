import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generators, renderTextureFile, type Texture } from '../src';
import { createNodeLoader } from '../src/cli/node-loader';

/**
 * Golden tests: every example texture and every template with its defaults is rendered
 * and its pixels hashed. A changed hash means a changed look: check the render, then
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
