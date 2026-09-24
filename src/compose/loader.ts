import type { Loader } from './types';

function normalize(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '..') {
            parts.pop();
        } else if (part !== '.' && part !== '') {
            parts.push(part);
        }
    }
    return '/' + parts.join('/');
}

/**
 * A loader reading from an in-memory map of absolute POSIX paths to JSON values.
 * Top-level references are resolved from `/`.
 */
export function createMemoryLoader(files: Record<string, unknown>): Loader {
    return {
        resolve(from, ref) {
            if (ref.startsWith('/')) {
                return normalize(ref);
            }
            const dir = from ? from.slice(0, from.lastIndexOf('/')) : '';
            return normalize(`${dir}/${ref}`);
        },
        read(path) {
            if (!(path in files)) {
                throw new Error(`${path}: file not found`);
            }
            return files[path];
        },
    };
}
