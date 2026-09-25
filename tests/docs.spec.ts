import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDocs } from '../scripts/docs';

function markdownFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? markdownFiles(join(dir, entry.name))
            : entry.name.endsWith('.md')
              ? [join(dir, entry.name)]
              : [],
    );
}

/** GitHub heading anchors */
function anchors(markdown: string): Set<string> {
    const slugs = markdown
        .split('\n')
        .filter((line) => /^#{1,6} /.test(line))
        .map((line) =>
            line
                .replace(/^#+ /, '')
                .toLowerCase()
                .replace(/[^\w\- ]/g, '')
                .replace(/ /g, '-'),
        );
    return new Set(slugs);
}

describe('documentation', () => {
    it('generated pages are up to date (run "npm run docs" otherwise)', async () => {
        for (const [path, content] of Object.entries(await renderDocs())) {
            expect(readFileSync(path, 'utf8'), path).toBe(content);
        }
    });

    it('has no broken links', () => {
        const files = [...markdownFiles('documentation'), 'README.md'];
        const broken: string[] = [];
        for (const file of files) {
            const markdown = readFileSync(file, 'utf8');
            for (const [, target] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
                if (/^[a-z]+:/.test(target)) {
                    continue;
                }
                const [path, anchor] = target.split('#');
                const resolved = path ? join(dirname(file), path) : file;
                if (!existsSync(resolved)) {
                    broken.push(`${file}: ${target}`);
                } else if (anchor && !anchors(readFileSync(resolved, 'utf8')).has(anchor)) {
                    broken.push(`${file}: ${target} (no such heading)`);
                }
            }
        }
        expect(broken).toEqual([]);
    });
});
