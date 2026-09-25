import { z } from 'zod';
import { patchDefinitionSchema, textureDefinitionSchema } from './compose/types';
import { generators } from './generators';

type JsonSchema = {
    [key: string]: unknown;
    properties?: Record<string, JsonSchema>;
    description?: string;
    scale?: string;
};

const SCALE_NOTES: Record<string, string> = {
    layout: 'layout: scales with the patch',
    detail: 'detail: real pixels, does not scale',
};

function toJson(schema: z.ZodType): JsonSchema {
    const json = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
    delete json.$schema;
    return json;
}

/**
 * Appends the layout/detail note to the description of every property that has one,
 * so that editors show it.
 */
function annotateScale(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(annotateScale);
    } else if (node !== null && typeof node === 'object') {
        const schema = node as JsonSchema;
        if (typeof schema.scale === 'string' && SCALE_NOTES[schema.scale]) {
            const note = `(${SCALE_NOTES[schema.scale]})`;
            schema.description = schema.description ? `${schema.description} ${note}` : note;
        }
        Object.values(schema).forEach(annotateScale);
    }
}

/**
 * JSON Schema of patch files: one variant per template, selected by `template`, and a
 * loose variant for files that only extend another one.
 */
export function patchJsonSchema(): JsonSchema {
    const header = toJson(patchDefinitionSchema).properties!;
    const variants = Object.values(generators).map((g) => {
        const params = toJson(g.schema);
        return {
            ...params,
            title: g.name,
            description: g.description,
            properties: {
                $schema: header.$schema,
                extends: header.extends,
                template: { const: g.name, description: g.description },
                seed: header.seed,
                ...params.properties,
            },
            required: ['template'],
        };
    });
    const schema: JsonSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'hex-tex-gen patch',
        description: patchDefinitionSchema.description,
        anyOf: [
            ...variants,
            {
                title: 'extension',
                description:
                    'patch extending another one; add "template" to get parameter completion',
                type: 'object',
                properties: { $schema: header.$schema, extends: header.extends, seed: header.seed },
                required: ['extends'],
                not: { required: ['template'] },
            },
        ],
    };
    annotateScale(schema);
    return schema;
}

/**
 * JSON Schema of texture files. Inline patch definitions use the patch file schema.
 */
export function textureJsonSchema(): JsonSchema {
    const schema = toJson(textureDefinitionSchema);
    const { $schema, ...patch } = patchJsonSchema();
    const placement = (schema.properties!.patches as { items: JsonSchema }).items;
    placement.properties!.patch = {
        description: placement.properties!.patch.description,
        anyOf: [{ type: 'string' }, { $ref: '#/$defs/patch' }],
    };
    return {
        $schema,
        title: 'hex-tex-gen texture',
        ...schema,
        $defs: { patch },
    };
}
