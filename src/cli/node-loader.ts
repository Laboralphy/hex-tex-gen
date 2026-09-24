import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Loader } from '../compose';

/**
 * Loader reading JSON files from disk; top-level references are resolved from the
 * working directory. Parsed files are cached.
 */
export function createNodeLoader(): Loader {
    const cache = new Map<string, unknown>();
    return {
        resolve: (from, ref) => resolve(from ? dirname(from) : process.cwd(), ref),
        read(path) {
            if (!cache.has(path)) {
                let content: string;
                try {
                    content = readFileSync(path, 'utf8');
                } catch {
                    throw new Error(`${path}: file not found`);
                }
                try {
                    cache.set(path, JSON.parse(content));
                } catch (e) {
                    throw new Error(`${path}: invalid JSON: ${(e as Error).message}`, { cause: e });
                }
            }
            return cache.get(path);
        },
    };
}
