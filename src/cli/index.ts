#!/usr/bin/env node
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { checkPatchParams, loadPatch, renderPatch, renderTextureFile } from '../compose';
import { deepMerge } from '../core/object-fusion';
import { expandPath, isPlainObject } from '../core/params';
import type { Texture } from '../core/Texture';
import { generators } from '../generators';
import { createNodeLoader } from './node-loader';
import { writePng } from './png';

const USAGE = `Usage:
  hex-tex-gen render <texture.json> [options]   render a texture file
  hex-tex-gen patch <patch.json> [options]      render a single patch file
  hex-tex-gen <generator> [options]             render a generator with its defaults

Options:
  -o, --output <file>     output PNG file (default: input name with .png)
  -s, --seed <n>          render: overrides the texture's global seed
                          patch, generator: random seed (default: patch seed, else random)
  -w, --width <px>        patch, generator: width (default: own size)
  -H, --height <px>       patch, generator: height (default: own size)
  -c, --config <file>     generator: JSON file of parameters
  -p, --param <key=value> patch, generator: parameter override, repeatable.
                          key may be a dotted path (mortar.size=3).
                          value is parsed as JSON, or as a comma-separated list
  -l, --list              list available generators and their parameters
  -h, --help              show this help`;

/**
 * Parses a parameter value: JSON first ("12", "true", "[...]"),
 * then comma-separated list, then plain string.
 */
function parseValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value.includes(',') ? value.split(',').map((s) => s.trim()) : value;
    }
}

function parseInteger(name: string, value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n)) {
        throw new Error(`--${name} must be an integer, got "${value}"`);
    }
    return n;
}

/**
 * Merges `-p key=value` options over parameters.
 */
function applyParams(params: Record<string, unknown>, options: string[]): Record<string, unknown> {
    for (const p of options) {
        const i = p.indexOf('=');
        if (i < 1) {
            throw new Error(`invalid --param "${p}", expected key=value`);
        }
        params = deepMerge(params, expandPath(p.slice(0, i), parseValue(p.slice(i + 1))));
    }
    return params;
}

function outputName(input: string): string {
    return basename(input, extname(input)) + '.png';
}

type JsonProperty = {
    description?: string;
    default?: unknown;
    scale?: string;
    properties?: Record<string, JsonProperty>;
};

/**
 * Prints the parameters of a JSON Schema object, nested objects as dotted paths.
 */
function printProperties(properties: Record<string, JsonProperty>, prefix: string): void {
    for (const [key, property] of Object.entries(properties)) {
        const path = prefix + key;
        if (property.properties) {
            printProperties(property.properties, `${path}.`);
        } else {
            const scale = property.scale ? `  [${property.scale}]` : '';
            const value =
                property.default === undefined ? '(from age)' : JSON.stringify(property.default);
            console.log(`    ${path} = ${value}${scale}`);
            if (property.description) {
                console.log(`        ${property.description}`);
            }
        }
    }
}

function listGenerators(): void {
    for (const g of Object.values(generators)) {
        console.log(`${g.name} - ${g.description}${g.overlay ? ' (overlay)' : ''}`);
        const json = z.toJSONSchema(g.schema, { io: 'input' }) as JsonProperty;
        printProperties(json.properties ?? {}, '');
        for (const [name, description] of Object.entries(g.anchors ?? {})) {
            console.log(`    anchor ${name}: ${description}`);
        }
        console.log();
    }
}

function main(argv: string[]): void {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            output: { type: 'string', short: 'o' },
            width: { type: 'string', short: 'w' },
            height: { type: 'string', short: 'H' },
            seed: { type: 'string', short: 's' },
            config: { type: 'string', short: 'c' },
            param: { type: 'string', short: 'p', multiple: true, default: [] },
            list: { type: 'boolean', short: 'l' },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        console.log(USAGE);
        return;
    }
    if (values.list) {
        listGenerators();
        return;
    }

    const [command, input] = positionals;
    if (!command) {
        throw new Error(`no command specified\n\n${USAGE}`);
    }
    const width = values.width === undefined ? undefined : parseInteger('width', values.width);
    const height = values.height === undefined ? undefined : parseInteger('height', values.height);
    const seedOption = values.seed === undefined ? undefined : parseInteger('seed', values.seed);
    let texture: Texture;
    let output: string;
    let seed: number | undefined;

    if (command === 'render' || command === 'patch') {
        if (!input) {
            throw new Error(`${command}: no file specified\n\n${USAGE}`);
        }
        const loader = createNodeLoader();
        output = values.output ?? outputName(input);
        if (command === 'render') {
            texture = renderTextureFile(input, loader, { seed: seedOption });
        } else {
            let patch = loadPatch(input, loader);
            patch = { ...patch, params: applyParams(patch.params, values.param) };
            checkPatchParams(patch, 'command line');
            seed = seedOption ?? patch.seed ?? Date.now() >>> 0;
            texture = renderPatch(patch, seed, width, height);
        }
    } else {
        const generator = generators[command];
        if (!generator) {
            throw new Error(`unknown command or generator "${command}", see --help and --list`);
        }
        let params: Record<string, unknown> = {};
        if (values.config) {
            const config = createNodeLoader().read(resolve(values.config));
            if (!isPlainObject(config)) {
                throw new Error(`${values.config}: expected a JSON object`);
            }
            params = config;
        }
        params = applyParams(params, values.param);
        seed = seedOption ?? Date.now() >>> 0;
        texture = generator.generate({ ...params, width, height, seed });
        output = values.output ?? `${command}.png`;
    }

    writePng(texture, output);
    const seedInfo = seed === undefined ? '' : `, seed ${seed}`;
    console.log(`${output} (${texture.width}x${texture.height}${seedInfo})`);
}

try {
    main(process.argv.slice(2));
} catch (e) {
    // file paths are absolute internally: show them relative to the working directory
    const message = String(e instanceof Error ? e.message : e).replaceAll(`${process.cwd()}/`, '');
    console.error(`hex-tex-gen: ${message}`);
    process.exit(1);
}
