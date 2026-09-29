# Texture sets

A texture set is a group of textures sharing one look, generated from a single seed: two
seeds give two sets that look like two different places, the same seed always gives the
same set. It is meant for levels generated at random, such as labyrinths: one seed per
level gives each level its own ambiance.

```sh
hex-tex-gen set -s 42                 # ambiance drawn from the seed
hex-tex-gen set -s 42 -a cave         # ambiance chosen, for a scripted location
```

```ts
import { createMemoryLoader, generateSet, renderTexture } from '@laboralphy/hex-tex-gen';

const set = generateSet({ seed: 42, ambiance: 'dungeon' });
const wall = renderTexture(set.textures['plain-wall'], createMemoryLoader({}));
```

## Ambiance, theme, recipes

A set is made in two steps:

1. **The theme**, drawn once from the seed within the ranges of an **ambiance**: the wall
   template, its palette, mortar, bevel, stone layout and age, and the liquid splashed on
   the walls. Every texture of the set is built on it, which is what makes them look like
   the same place.
2. **The recipes**, one per kind of texture (plain wall, splattered wall, and later door,
   window...), each building a texture file on the theme. An ambiance only gets the
   recipes that belong to it: a cave has no window.

| Ambiance  | Wall       | Varied by the seed                                                                   | Liquid                                     |
| --------- | ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `dungeon` | `ashlar`   | bond, rows, row height variation, stone width, mortar, bevel, palette, contrast, age | mostly blood, fresh or dried; slime, ichor |
| `cave`    | `cavewall` | number of boulders, size variation, relief, mortar, palette, contrast, age           | slime, water, blood, ichor                 |

| Recipe            | Ambiances     | Texture                                                                            |
| ----------------- | ------------- | ---------------------------------------------------------------------------------- |
| `plain-wall`      | dungeon, cave | the wall of the theme                                                              |
| `splattered-wall` | dungeon, cave | the plain wall, same stones, with one to three splashes of the liquid of the theme |

The splattered wall has the same stones as the plain wall: laid next to each other, they
look like one wall. The seed of the set places the splashes, their size and direction.

The textures are ordinary [texture files](texture-files.md): `hex-tex-gen set` writes each
one next to its PNG image, to look at what a seed made, or to copy and edit.

## Controlling a set

Three levels of control, from the most random to the most scripted:

```ts
generateSet({ seed: 42 }); // the seed draws everything, the ambiance included
generateSet({ seed: 42, ambiance: 'cave' }); // ambiance chosen, varied by the seed
generateSet({ seed: 42, ambiance: 'cave', theme: { wall: { age: 1 } } }); // values forced
generateSet({ seed: 42, theme: { liquid: { color: '#4f7a1c', alpha: 0.8 } } }); // a slime level
```

`theme` values are deep-merged over the drawn theme and always win, as explicit wear
values win over [age](concepts.md#aging); arrays, such as a palette, replace the drawn
ones. `drawTheme` gives the theme alone, without the textures. The size of the textures
is `[64, 128]` by default, `size` changes it.

The theme drawn for an ambiance does not depend on whether the ambiance was chosen or
drawn: a seed that draws a cave and the same seed with `ambiance: 'cave'` give the same
set.

## Stability

Each choice of the theme draws from its own salt, so the same seed gives the same set
across runs and machines. Changing the ranges of an ambiance changes the sets of its
seeds, and adding an ambiance changes the sets of the seeds that draw it; sets with a
chosen ambiance are not affected by new ambiances.
