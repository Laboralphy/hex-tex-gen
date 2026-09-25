# Command line

```
hex-tex-gen render <texture.json> [options]   render a texture file
hex-tex-gen patch <patch.json> [options]      render a single patch file
hex-tex-gen <template> [options]              render a template with its defaults
hex-tex-gen --list                            list templates and their parameters
```

Every command writes a PNG file and prints its name, its size and, for patches and
templates, the seed used.

## `render`: a texture file

```sh
hex-tex-gen render examples/mossy-castle-wall.json
hex-tex-gen render examples/mossy-castle-wall.json -s 99 -o wall-99.png
```

| Option                | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| `-o, --output <file>` | output file; by default the texture file name with `.png`, in the current directory |
| `-s, --seed <n>`      | overrides the texture's global `seed`; placement and patch seeds still win          |

The size comes from the texture file. See [Texture files](texture-files.md).

## `patch`: a patch file

```sh
hex-tex-gen patch examples/patches/castle-stone.json
hex-tex-gen patch examples/patches/moss.json -w 128 -H 32 -s 7 -p vines.count=20
```

| Option                    | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `-o, --output <file>`     | output file; by default the patch file name with `.png`, in the current directory |
| `-w, --width <px>`        | rendered width, in pixels; the patch's own width by default                       |
| `-H, --height <px>`       | rendered height, in pixels; the patch's own height by default                     |
| `-s, --seed <n>`          | seed; the patch's `seed` by default, else a random one (printed)                  |
| `-p, --param <key=value>` | parameter override, repeatable, see [below](#parameters)                          |

The patch is regenerated at the given size, never stretched: see
[Own size and resizing](concepts.md#own-size-and-resizing).

## `<template>`: a template with its defaults

```sh
hex-tex-gen ashlar -o wall.png
hex-tex-gen ashlar -s 42 -w 128 -H 128 -p age=0.8 -p stains.ratio=0
hex-tex-gen ashlar -c my-params.json -p mortar.size=3
```

Renders a template directly, without a patch file. It takes the options of `patch`, plus:

| Option                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `-c, --config <file>` | JSON file of parameters, applied before the `-p` options |

The output is `<template>.png` by default.

## Parameters

`-p` sets one parameter, and can be repeated. Keys are dotted paths into the parameter
groups, values are parsed as JSON, else as a comma-separated list, else as a string:

| Option                              | Parameter value                                        |
| ----------------------------------- | ------------------------------------------------------ |
| `-p age=0.8`                        | `{ "age": 0.8 }`                                       |
| `-p mortar.size=3`                  | `{ "mortar": { "size": 3 } }`                          |
| `-p blocks.width=[20,40]`           | `{ "blocks": { "width": [20, 40] } }`                  |
| `-p 'stone.palette=#222,#555,#999'` | `{ "stone": { "palette": ["#222", "#555", "#999"] } }` |
| `-p mortar.color=darkslategray`     | `{ "mortar": { "color": "darkslategray" } }`           |

Quote values containing `#`, spaces or brackets for your shell. The `-p` options are
deep-merged over the patch file (or the `-c` file): they only change the keys they set.

## `--list`

Lists every template with every parameter: its default (or `(from age)` for the
[wear parameters](concepts.md#aging)), its scale (`[layout]` or `[detail]`) and its
description. The same information, with types and ranges, is in the
[template pages](templates/README.md).

## Errors

Invalid files and parameters stop the command with every problem found, their file and
their path, and exit code 1:

```
$ hex-tex-gen ashlar -p mortar.size=big
hex-tex-gen: mortar.size: Invalid input: expected number, received string
```

File paths in messages are relative to the current directory.
