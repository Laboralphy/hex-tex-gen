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

/** appended to the description of a wear parameter: its default comes from `age` */
export const FROM_AGE = ' when unset, derived from age';

/**
 * The `age` parameter of a template, 0.3 by default.
 * @param noun what aging is called for this material
 * @param young what age 0 looks like
 * @param old what age 1 looks like
 * @param effect what the age does
 */
export const ageParam = ({
    noun = 'weathering',
    young = 'new',
    old = 'ruined',
    effect = 'sets every wear parameter left unset',
} = {}) =>
    ratio().default(0.3).describe(`overall ${noun}, from 0 (${young}) to 1 (${old}): ${effect}`);

/**
 * Shadow of an overlay on the wall, cast to the bottom-right.
 * @param subject what casts the shadow
 * @param opacity default darkness of the shadow
 * @param offset default offset of the shadow, in pixels; 0 for none
 * @param scaled the offset is a layout value, expressed at the own size of the patch and
 * scaling with it, instead of real pixels
 */
export const shadowGroup = (subject: string, opacity = 0.45, offset = 1, scaled = false) =>
    z
        .strictObject({
            offset: scaled
                ? z
                      .number()
                      .min(0)
                      .default(offset)
                      .describe(
                          'shadow cast on the wall, to the bottom-right, in pixels at own size: it scales with the patch; 0 for none',
                      )
                      .meta(LAYOUT)
                : z
                      .number()
                      .int()
                      .min(0)
                      .default(offset)
                      .describe('shadow cast on the wall, to the bottom-right, in pixels')
                      .meta(DETAIL),
            opacity: ratio().default(opacity).describe('darkness of the shadow, in [0, 1]'),
        })
        .prefault({})
        .describe(`shadow of the ${subject} on the wall, the light coming from the top-left`);

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
