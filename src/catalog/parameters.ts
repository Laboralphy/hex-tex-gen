import { z } from 'zod';
import type { TextureGenerator } from '../generators/types';

/** what a parameter holds, for a form to pick the right field */
export type ParameterKind =
    | 'number'
    | 'integer'
    | 'boolean'
    | 'enum'
    | 'text'
    | 'color'
    /** colors from darkest to lightest, at least two */
    | 'palette'
    /** colors to pick from, or a fixed number of them */
    | 'colors'
    /** a [min, max] pair of numbers */
    | 'range'
    /** a fixed pair of numbers, such as [columns, rows] */
    | 'pair'
    /** a list of numbers */
    | 'numbers'
    /** several choices among `options` */
    | 'choices'
    /** anything else, such as a list of objects: edit it as JSON */
    | 'json';

/**
 * A parameter of a template, flattened out of its schema: enough to build a form field.
 */
export type ParameterInfo = {
    /** dotted path of the parameter: `stone.palette` */
    path: string;
    kind: ParameterKind;
    description: string;
    /** default value; undefined for a wear parameter derived from `age` */
    default: unknown;
    /** the default is derived from `age` when the parameter is unset */
    fromAge: boolean;
    minimum?: number;
    maximum?: number;
    /** the choices of an enum, or of a list of choices */
    options?: string[];
    /** layout values scale with the patch; detail values are real pixels */
    scale?: 'layout' | 'detail';
    /**
     * worth showing in a simplified form: `age`, the colors, and the style choices at the
     * top level of the template
     */
    essential: boolean;
};

type JsonSchema = {
    type?: string | string[];
    description?: string;
    default?: unknown;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    enum?: unknown[];
    kind?: string;
    scale?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema | false;
    prefixItems?: JsonSchema[];
    minItems?: number;
};

const isColor = (s?: JsonSchema | false) => !!s && s.kind === 'color';
const isNumber = (s?: JsonSchema | false) => !!s && (s.type === 'number' || s.type === 'integer');

function kindOf(s: JsonSchema): ParameterKind {
    if (s.enum) {
        return 'enum';
    }
    if (isColor(s)) {
        return 'color';
    }
    if (s.kind === 'palette') {
        return 'palette';
    }
    switch (s.type) {
        case 'boolean':
            return 'boolean';
        case 'integer':
            return 'integer';
        case 'number':
            return 'number';
        case 'string':
            return 'text';
    }
    if (s.type === 'array') {
        const tuple = s.prefixItems;
        if (tuple) {
            if (tuple.every(isColor)) {
                return 'colors';
            }
            if (tuple.length === 2 && tuple.every(isNumber)) {
                // a [min, max] pair describes itself as such
                return /\[min, max\]/.test(s.description ?? '') ? 'range' : 'pair';
            }
            return 'json';
        }
        if (isColor(s.items)) {
            return 'colors';
        }
        if (s.items && s.items.enum) {
            return 'choices';
        }
        if (isNumber(s.items)) {
            return 'numbers';
        }
    }
    return 'json';
}

/**
 * The parameters of a template, flattened in the order of its schema: nested groups are
 * walked into, and each leaf becomes a {@link ParameterInfo}. `size` is left out: the
 * rendered size is chosen when placing the patch.
 */
export function describeParameters(generator: TextureGenerator): ParameterInfo[] {
    const json = z.toJSONSchema(generator.schema, { io: 'input' }) as JsonSchema;
    const out: ParameterInfo[] = [];
    const walk = (properties: Record<string, JsonSchema>, prefix: string, depth: number) => {
        for (const [key, s] of Object.entries(properties)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (path === 'size') {
                continue;
            }
            if (s.type === 'object' && s.properties) {
                walk(s.properties, path, depth + 1);
                continue;
            }
            const kind = kindOf(s);
            const colorful = kind === 'color' || kind === 'palette' || kind === 'colors';
            out.push({
                path,
                kind,
                description: s.description ?? '',
                default: s.default,
                fromAge: s.default === undefined && /derived from age/.test(s.description ?? ''),
                minimum: s.minimum ?? s.exclusiveMinimum,
                maximum: s.maximum ?? s.exclusiveMaximum,
                options: (s.enum ?? (s.items ? s.items.enum : undefined))?.map(String),
                scale: s.scale === 'layout' || s.scale === 'detail' ? s.scale : undefined,
                essential:
                    path === 'age' ||
                    (colorful && depth <= 1) ||
                    (depth === 0 && (kind === 'enum' || kind === 'boolean')),
            });
        }
    };
    walk(json.properties ?? {}, '', 0);
    return out;
}
