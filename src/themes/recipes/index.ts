import type { TextureRecipe } from '../types';
import { alcoveBackground } from './alcove-background';
import { archAlcove } from './arch-alcove';
import { barredWayCave, barredWayChurch, barredWayDungeon, barredWayInterior } from './barred-way';
import { breachedWall } from './breached-wall';
import { burntWallCave, burntWallChurch, burntWallDungeon, burntWallInterior } from './burnt-wall';
import { caveAlcove } from './cave-alcove';
import { caveWindow } from './cave-window';
import { churchAlcove } from './church-alcove';
import { churchWindow } from './church-window';
import { columnAlcove } from './column-alcove';
import { debug } from './debug';
import { decoWall1, decoWall2, nicheWall } from './deco-wall';
import { doorFrame } from './door-frame';
import {
    caveDoorDouble,
    caveDoorSingle,
    churchDoorDouble,
    churchDoorSingle,
    dungeonDoorDouble,
    dungeonDoorSingle,
    interiorDoorDouble,
    interiorDoorSingle,
    metalDoorDouble,
    metalDoorSingle,
} from './doors';
import { ceiling, ceilingBreach, ceilingOpening, floor, floorSplattered } from './flats';
import { metalShelves, metalTable, stoneAltar, woodenShelves, woodenTable } from './furniture';
import { interiorWindow } from './interior-window';
import { plainWall } from './plain-wall';
import { smallWindow } from './small-window';
import { splatteredWall } from './splattered-wall';

export { alcoveBackground } from './alcove-background';
export { archAlcove } from './arch-alcove';
export { barredWayCave, barredWayChurch, barredWayDungeon, barredWayInterior } from './barred-way';
export { breachedWall } from './breached-wall';
export { burntWallCave, burntWallChurch, burntWallDungeon, burntWallInterior } from './burnt-wall';
export { caveAlcove } from './cave-alcove';
export { caveWindow } from './cave-window';
export { churchAlcove } from './church-alcove';
export { churchWindow } from './church-window';
export { columnAlcove } from './column-alcove';
export { debug, mainPalette } from './debug';
export { decoWall1, decoWall2, nicheWall } from './deco-wall';
export { doorFrame } from './door-frame';
export {
    caveDoorDouble,
    caveDoorSingle,
    churchDoorDouble,
    churchDoorSingle,
    dungeonDoorDouble,
    dungeonDoorSingle,
    interiorDoorDouble,
    interiorDoorSingle,
    metalDoorDouble,
    metalDoorSingle,
} from './doors';
export { ceiling, ceilingBreach, ceilingOpening, floor, floorSplattered, ground } from './flats';
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
    burntWallChurch,
    breachedWall,
    doorFrame,
    archAlcove,
    caveAlcove,
    columnAlcove,
    churchAlcove,
    alcoveBackground,
    smallWindow,
    caveWindow,
    interiorWindow,
    churchWindow,
    barredWayDungeon,
    barredWayCave,
    barredWayInterior,
    barredWayChurch,
    decoWall1,
    nicheWall,
    decoWall2,
    woodenTable,
    stoneAltar,
    metalTable,
    woodenShelves,
    metalShelves,
    floor,
    floorSplattered,
    ceiling,
    ceilingOpening,
    ceilingBreach,
    dungeonDoorSingle,
    dungeonDoorDouble,
    caveDoorSingle,
    caveDoorDouble,
    interiorDoorSingle,
    interiorDoorDouble,
    churchDoorSingle,
    churchDoorDouble,
    metalDoorSingle,
    metalDoorDouble,
    debug,
];
