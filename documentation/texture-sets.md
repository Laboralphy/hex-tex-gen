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
   template, its palette, mortar, bevel, stone layout and age, the liquid splashed on
   the walls, and how worn the decorations hung on them are (`decor.age`). Every texture of the set is built on it, which is what makes them look like
   the same place.
2. **The recipes**, one per kind of texture (plain wall, splattered wall, burnt wall, breached wall, door frame, arched alcove,
   alcove background, small window, barred way, banner walls...), each building a texture file on the theme. An ambiance only gets the
   recipes that belong to it: a cave has no window.

| Ambiance   | Wall       | Varied by the seed                                                                                                                                                            | Liquid                                     |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `dungeon`  | `ashlar`   | bond, rows, row height variation, stone width, mortar, bevel, palette, contrast, age                                                                                          | mostly blood, fresh or dried; slime, ichor |
| `cave`     | `cavewall` | number of boulders, size variation, relief, mortar, palette, contrast, age                                                                                                    | slime, water, blood, ichor                 |
| `interior` | `planks`   | direction, number of planks, full-height panels or planks of any length, gap, bevel, wood palette (oak, walnut, pine, mahogany, pale ash, ebonized), grain, knots, nails, age | wine, blood, fresh or dried                |

Decorations are nearly new in interiors (`decor.age` 0 to 0.25), worn in dungeons (0.2 to
0.6) and very aged in caves (0.85 to 1): torn, holed and faded.

| Recipe              | Ambiances               | Texture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plain-wall`        | dungeon, cave, interior | the wall of the theme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `splattered-wall`   | dungeon, cave, interior | the plain wall, same stones, with one to three splashes of the liquid of the theme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `burnt-wall`        | dungeon, cave, interior | the plain wall, same stones, blackened by the soot of a fire at its foot: a [`burn`](templates/burn.md), kept inside the texture; denser soot in caves, where the dark rock would hide it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `breached-wall`     | dungeon, cave           | the plain wall, same stones, broken through by a [`breach`](templates/breach.md) of any shape, kept inside the texture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `door-frame`        | dungeon, cave, interior | the plain wall, same stones, with a [`slot`](templates/slot.md) running down its middle, where a sliding door disappears: the side of a doorway                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `arch-alcove`       | dungeon, cave, interior | dungeon: the plain wall, same stones, cut through by an arched [`opening`](templates/opening.md), fully transparent, from the floor to 5 % of the height, 60 % wide, between two full-height [`column`](templates/column.md)s of the stone of the wall at its sides; round or pointed arch and column order drawn from the seed; cave: the frame of a mine gallery, alone on a transparent texture: two [`woodbeam`](templates/woodbeam.md) posts full height against the left and right edges, 15 % wide like the columns, and a cap along the top edge; sawn or round logs drawn from the seed; interior: the plain wall cut through by a flat-topped [`opening`](templates/opening.md) from the floor, between two carved [`column`](templates/column.md)s at its sides under an [`entablature`](templates/entablature.md) across its top, 12.5 % high, columns and entablature in the wood of the wall, polished a little lighter; column order, frieze and dentils drawn from the seed               |
| `alcove-background` | dungeon, cave, interior | the plain wall, same stones or planks, darkened as a whole: an [`opening`](templates/opening.md) covering the whole texture, its back in shadow, its reveals along the edges; the back wall of an alcove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `small-window`      | dungeon, cave, interior | dungeon: the plain wall, same stones, pierced by a small window, an [`opening`](templates/opening.md) cut through and fully transparent, at 33, 10, 33 × 60 %, round or pointed arch drawn from the seed, a [`stoneslab`](templates/stoneslab.md) of the stone of the wall beneath it as a sill; cave: the plain wall pierced by a small window at 25, 33, 50 × 33 %, transparent behind [`bars`](templates/bars.md) of the same size, framed by four [`woodbeam`](templates/woodbeam.md)s around it, 15 % thick; interior: the plain wall pierced by an [`opening`](templates/opening.md) cut through at 15, 20, 70 × 60 %, a glazed [`window`](templates/window.md) inside its reveals, framed with the wood of the wall, 2 or 3 columns and 2 to 4 rows of panes drawn from the seed, four [`woodbeam`](templates/woodbeam.md)s a little darker than the planks around the opening; one time in two, a plain [`banner`](templates/banner.md) of a single color on each side of the window, as curtains |
| `barred-way`        | dungeon, cave, interior | the plain wall cut through as a whole, an [`opening`](templates/opening.md) covering the texture, transparent but for its reveals along the edges, full-height [`bars`](templates/bars.md) across it; in caves, four thick [`woodbeam`](templates/woodbeam.md)s along the edges of the texture frame it, 15 % thick; in interiors, no bars: four full-height vertical [`woodbeam`](templates/woodbeam.md) posts, 10 % wide, centered in four equal columns, and a horizontal one across them at 0, 66, 100 × 10 %, in the wood of the wall a little darker                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `banner-wall-1`     | dungeon, cave, interior | the plain wall with a [`banner`](templates/banner.md) hanging at 20, 15, 60 × 70 %, kept inside the texture; its heraldic colors (red and gold, green and silver, black and gold, white and blue, blue and gold, purple and silver...), shape and pattern drawn from the seed; its wear is `decor.age`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `banner-wall-2`     | dungeon, cave, interior | the same, with a second banner of the same size, its own shape and pattern, and never the colors of the first                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Recipes of different ambiances may share a name: each ambiance then gets its own variant
of that texture, and a level asks for `arch-alcove` whatever its ambiance. A texture may
also be transparent (`"background": "#0000"`) but for what it draws: the cave alcove is
its beams alone, for the engine to draw over the wall behind them.

The splattered wall has the same stones as the plain wall: laid next to each other, they
look like one wall. The seed of the set places the splashes, their size and direction. Its
splashes are kept inside the texture (`"wrap": false`), so that none is cut where the wall
meets another texture.

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
