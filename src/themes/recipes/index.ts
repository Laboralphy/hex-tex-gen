import type { TextureRecipe } from '../types';
import { alcoveBackground } from './alcove-background';
import { archAlcove } from './arch-alcove';
import { bannerWall1, bannerWall2 } from './banner-wall';
import { barredWayCave, barredWayDungeon, barredWayInterior } from './barred-way';
import { breachedWall } from './breached-wall';
import { burntWallCave, burntWallDungeon, burntWallInterior } from './burnt-wall';
import { caveAlcove } from './cave-alcove';
import { caveWindow } from './cave-window';
import { columnAlcove } from './column-alcove';
import { debug } from './debug';
import { doorFrame } from './door-frame';
import {
    caveDoorDouble,
    caveDoorSingle,
    dungeonDoorDouble,
    dungeonDoorSingle,
    interiorDoorDouble,
    interiorDoorSingle,
    metalDoorDouble,
    metalDoorSingle,
} from './doors';
import { ceiling, ceilingOpening, floor, floorSplattered } from './flats';
import { metalShelves, metalTable, stoneAltar, woodenShelves, woodenTable } from './furniture';
import { interiorWindow } from './interior-window';
import { plainWall } from './plain-wall';
import { smallWindow } from './small-window';
import { splatteredWall } from './splattered-wall';

export { alcoveBackground } from './alcove-background';
export { archAlcove } from './arch-alcove';
export { bannerWall1, bannerWall2 } from './banner-wall';
export { barredWayCave, barredWayDungeon, barredWayInterior } from './barred-way';
export { breachedWall } from './breached-wall';
export { burntWallCave, burntWallDungeon, burntWallInterior } from './burnt-wall';
export { caveAlcove } from './cave-alcove';
export { caveWindow } from './cave-window';
export { columnAlcove } from './column-alcove';
export { debug, mainPalette } from './debug';
export { doorFrame } from './door-frame';
export {
    caveDoorDouble,
    caveDoorSingle,
    dungeonDoorDouble,
    dungeonDoorSingle,
    interiorDoorDouble,
    interiorDoorSingle,
    metalDoorDouble,
    metalDoorSingle,
} from './doors';
export { ceiling, ceilingOpening, floor, floorSplattered, ground } from './flats';
export { metalShelves, metalTable, stoneAltar, woodenShelves, woodenTable } from './furniture';
export { interiorWindow } from './interior-window';
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
    burntWallDungeon,
    burntWallCave,
    burntWallInterior,
    breachedWall,
    doorFrame,
    archAlcove,
    caveAlcove,
    columnAlcove,
    alcoveBackground,
    smallWindow,
    caveWindow,
    interiorWindow,
    barredWayDungeon,
    barredWayCave,
    barredWayInterior,
    bannerWall1,
    bannerWall2,
    woodenTable,
    stoneAltar,
    metalTable,
    woodenShelves,
    metalShelves,
    floor,
    floorSplattered,
    ceiling,
    ceilingOpening,
    dungeonDoorSingle,
    dungeonDoorDouble,
    caveDoorSingle,
    caveDoorDouble,
    interiorDoorSingle,
    interiorDoorDouble,
    metalDoorSingle,
    metalDoorDouble,
    debug,
];
