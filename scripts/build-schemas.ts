/**
 * Writes the JSON Schemas of patch and texture files into `schemas/`.
 */
import { writeFileSync } from 'node:fs';
import { patchJsonSchema, textureJsonSchema } from '../src/schemas';

const files = {
    'schemas/patch.schema.json': patchJsonSchema(),
    'schemas/texture.schema.json': textureJsonSchema(),
};
for (const [file, schema] of Object.entries(files)) {
    writeFileSync(file, JSON.stringify(schema, null, 2) + '\n');
    console.log(file);
}
