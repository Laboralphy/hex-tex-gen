// each random decision of the theme generator draws from its own sequence; never renumber
// them: it would change the set of every seed
export const SALT_AMBIANCE = 1;
export const SALT_PALETTE = 2;
export const SALT_HUE = 3;
export const SALT_SATURATION = 4;
export const SALT_LIGHTNESS = 5;
export const SALT_CONTRAST = 6;
export const SALT_MORTAR_SIZE = 7;
export const SALT_MORTAR_COLOR = 8;
export const SALT_BEVEL_SIZE = 9;
export const SALT_AGE = 10;
export const SALT_BOND = 11;
export const SALT_ROW_COUNT = 12;
export const SALT_ROW_HEIGHT = 13;
export const SALT_BLOCK_WIDTH = 14;
export const SALT_BLOCK_SPREAD = 15;
export const SALT_STONE_COLUMNS = 16;
export const SALT_STONE_ROWS = 17;
export const SALT_STONE_VARIATION = 18;
export const SALT_STONE_RELIEF = 19;
export const SALT_PALETTE_SHIFT = 20;
export const SALT_LIQUID = 21;
export const SALT_LIQUID_ALPHA = 22;
export const SALT_LIQUID_GLOSS = 23;

// each random decision of the recipes, drawn from the seed of the texture
export const SALT_SPLATTER_COUNT = 100;
export const SALT_SPLATTER_X = 101;
export const SALT_SPLATTER_Y = 102;
export const SALT_SPLATTER_SIZE = 103;
export const SALT_SPLATTER_ANGLE = 104;
export const SALT_SPLATTER_BIAS = 105;
export const SALT_SPLATTER_SEED = 106;

// seeds of the textures of a set, one per recipe
export const SALT_PLAIN_WALL = 1000;
export const SALT_SPLATTERED_WALL = 1001;
