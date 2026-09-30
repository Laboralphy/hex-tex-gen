import type { TextureRecipe } from '../types';
import { alcoveBackground } from './alcove-background';
import { archAlcove } from './arch-alcove';
import { barredWayCave, barredWayDungeon } from './barred-way';
import { breachedWall } from './breached-wall';
import { caveAlcove } from './cave-alcove';
import { caveWindow } from './cave-window';
import { doorFrame } from './door-frame';
import { plainWall } from './plain-wall';
import { smallWindow } from './small-window';
import { splatteredWall } from './splattered-wall';

export { alcoveBackground } from './alcove-background';
export { archAlcove } from './arch-alcove';
export { barredWayCave, barredWayDungeon } from './barred-way';
export { breachedWall } from './breached-wall';
export { caveAlcove } from './cave-alcove';
export { caveWindow } from './cave-window';
export { doorFrame } from './door-frame';
export { plainWall } from './plain-wall';
export { smallWindow } from './small-window';
export { splatteredWall } from './splattered-wall';

/**
 * Every texture recipe, in the order of the textures of a set. Recipes of different
 * ambiances may share a name: each ambiance gets its own variant of that texture.
 */
export const recipes: TextureRecipe[] = [
    plainWall,
    splatteredWall,
    breachedWall,
    doorFrame,
    archAlcove,
    caveAlcove,
    alcoveBackground,
    smallWindow,
    caveWindow,
    barredWayDungeon,
    barredWayCave,
];
