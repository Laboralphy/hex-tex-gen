# Patch files

A patch file is a JSON object: a `template`, an optional `seed`, and the parameters of the
template. Every parameter has a default, so a patch only sets what it changes:

```json
{
  "$schema": "../../schemas/patch.schema.json",
  "template": "ashlar",
  "size": [64, 64],
  "rows": { "count": 4 },
  "mortar": { "size": 3, "color": "#1a1612" },
  "age": 0.5
}
```

| Key        | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `template` | the generator: see [Templates](templates/README.md) for each one's parameters                     |
| `seed`     | seed of this patch, unless the placement sets one (see [Seeds](concepts.md#seeds-and-randomness)) |
| `extends`  | parent patch file, see [below](#extends)                                                          |
| `$schema`  | JSON Schema of the file, for editors; ignored when rendering                                      |
| _others_   | parameters of the template                                                                        |

Parameters are grouped in nested objects (`rows`, `mortar`, `stone`...). Set only the keys
you change: `{ "mortar": { "size": 3 } }` keeps the default mortar color.

To render a patch file alone:

```sh
hex-tex-gen patch patches/castle-stone.json -w 128 -H 128 -s 7
```

## Extends

A patch can extend another one: the parent file is loaded first, and the child is
**deep-merged** over it.

```jsonc
// patches/castle-stone.json
{ "template": "ashlar", "rows": { "count": 4 }, "mortar": { "size": 2 } }

// patches/large-blocks.json
{
  "extends": "./castle-stone.json",
  "template": "ashlar",
  "rows": { "count": 2, "heightVariation": 0 },
  "mortar": { "size": 3 }
}
```

`large-blocks.json` gets `rows.count` 2, `rows.heightVariation` 0 and `mortar.size` 3,
and everything else from `castle-stone.json`.

Merge rules:

- nested objects are merged key by key;
- **arrays are replaced**, never concatenated: a child `palette` replaces its parent's;
- `extends` paths are relative to the file that contains them;
- a parent can extend another file, and so on; a loop of files extending each other is an
  error;
- a child may repeat `template` (recommended, for [editor completion](#editor-support)),
  but it must be the same as its parent's.

## Inline patches

In a texture file, a placement can define its patch inline instead of referencing a file.
Its `extends`, if any, is relative to the texture file:

```json
{ "patch": { "extends": "./patches/castle-stone.json", "age": 0.9 }, "width": 100, "height": 50 }
```

A placement can also override some parameters of a patch file with `params`, see
[Texture files](texture-files.md#placements).

## Validation

A patch is validated once its `extends` chain is merged, against the schema of its
template: types, ranges, `[min, max]` pairs, CSS colors and unknown keys. Every problem is
reported at once, with the file and the path:

```
patches/castle-stone.json: unknown parameter "blocks.widht"; mortar.size: Invalid input: expected int, received number
```

Colors accept any CSS color supported by
[@laboralphy/rainbow](https://www.npmjs.com/package/@laboralphy/rainbow): `#rgb`, `#rgba`,
`#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` and the 148 named colors.

## Editor support

The package publishes JSON Schemas of patch and texture files in `schemas/`. Reference
them with `$schema` to get completion, documentation on hover and validation in VS Code,
JetBrains IDEs and most JSON editors:

```json
{ "$schema": "../../schemas/patch.schema.json", "template": "ashlar" }
```

From a project depending on the package, the path is
`node_modules/@laboralphy/hex-tex-gen/schemas/patch.schema.json`.

The patch schema has one variant per template, chosen by `template`: a file must set
`template` to get the completion of its parameters. A file that only sets `extends` is
accepted without completion. Parameters are checked again when rendering, which also
covers what JSON Schemas cannot express, such as `min <= max` in `[min, max]` pairs.
