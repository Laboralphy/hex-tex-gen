import { Rainbow } from '@laboralphy/rainbow';
import { z } from 'zod';

/**
 * Metadata of a parameter that scales with the patch: it is expressed at the patch's own
 * `size`, and multiplied when the patch is rendered at another size.
 */
export const LAYOUT = { scale: 'layout' } as const;

/**
 * Metadata of a parameter in real pixels, that does not scale with the patch.
 */
export const DETAIL = { scale: 'detail' } as const;

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isColor(value: string): boolean {
    // Rainbow accepts some malformed hex colors, such as "#zzz"
    if (value.startsWith('#') && !HEX_COLOR.test(value)) {
        return false;
    }
    try {
        Rainbow.parse(value);
        return true;
    } catch {
        return false;
    }
}

/** a CSS color: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla() or a name */
export const color = () =>
    z
        .string()
        .refine(isColor, {
            message: 'expected a CSS color (#rgb, #rrggbb, rgb(), hsl() or a color name)',
        })
        .meta({ kind: 'color' });

/** CSS colors, from darkest to lightest */
export const palette = () => z.array(color()).min(2, 'expected at least two colors');

/** a number in [0, 1] */
export const ratio = () => z.number().min(0).max(1);

/** a size in pixels: [width, height] */
export const size = () => z.tuple([z.number().int().positive(), z.number().int().positive()]);

/** a [min, max] pair */
export const range = (item: z.ZodNumber = z.number()) =>
    z.tuple([item, item]).refine(([min, max]) => min <= max, {
        message: 'expected [min, max] with min <= max',
    });

/**
 * Validation failure, with a readable message listing every issue.
 */
export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly issues: z.core.$ZodIssue[],
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Formats a path as written in JSON files: `patches[1].anchor.offset`.
 */
export function formatPath(path: PropertyKey[]): string {
    return path
        .map((key, i) =>
            typeof key === 'number' ? `[${key}]` : `${i > 0 ? '.' : ''}${String(key)}`,
        )
        .join('');
}

/**
 * Formats Zod issues as `path: message`, one per issue, separated by semicolons.
 * @param noun what an unknown key is called in messages ("parameter", "key")
 */
export function formatIssues(issues: z.core.$ZodIssue[], noun = 'key'): string {
    return issues
        .flatMap((issue) => {
            if (issue.code === 'unrecognized_keys') {
                return issue.keys.map(
                    (key) => `unknown ${noun} "${formatPath([...issue.path, key])}"`,
                );
            }
            const path = formatPath(issue.path);
            return [path ? `${path}: ${issue.message}` : issue.message];
        })
        .join('; ');
}

/**
 * Parses a value with a schema.
 * @param noun what an unknown key is called in messages
 * @throws ValidationError listing every issue
 */
export function parseWith<S extends z.ZodType>(
    schema: S,
    value: unknown,
    noun = 'key',
): z.output<S> {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new ValidationError(formatIssues(result.error.issues, noun), result.error.issues);
    }
    return result.data;
}
