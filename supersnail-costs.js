// supersnail-costs.js
// Unify T5–T8 into one data-driven calculator. Keep outputs identical to your current code.
// Notes:
// - Closed-form arithmetic series (no off-by-one loops).
// - Config controls per-tier coefficients, cell arrays, compass quirks, and ritual bumps.
// - Back-compat wrappers: formT5Calc/6/7/8 call the generic engine.

// ------------------------- constants & source arrays -------------------------

const dragonT5cellCostSetA = [5.4, 6.7, 8.1, 9.4, 10, 12, 13, 14, 16, 17];
const dragonT5cellCostSetB = [8.1, 10, 12, 14, 16, 18, 20, 22, 24, 26];
const dragonT5cellCostSetC = [10, 13, 16, 18, 21, 24, 27, 29, 32, 35];
const dragonT5cellCostSetD = [16, 20, 24, 28, 32, 36, 40, 44, 48, 52];

const dragonT6cellCostSetA = [11, 14, 17, 19, 22, 25, 28, 31, 34, 37];
const dragonT6cellCostSetB = [17, 21, 25, 29, 34, 38, 42, 47, 51, 55];
const dragonT6cellCostSetC = [22, 28, 34, 39, 45, 51, 57, 62, 68, 74];
const dragonT6cellCostSetD = [34, 42, 51, 59, 68, 76, 85, 94, 100, 110];

const t6BtadCoeffs = [12.5, 15, 20];
const t6CompassBtads = [120, 260, 600];
const t6CompassCellCosts = [50, 150, 250];

const t7BtadCoeffs = [50, 80, 120];
const t8BtadCoeffs = [500, 750, 1000];

// T7 cells (named from your inline arrays to keep behavior identical)
const T7_Z1 = [45,56,67,78,90,100,110,120,130,140];
const T7_D1 = [30,37,45,52,60,67,75,82,90,97];
const T7_Z2 = T7_D1;
const T7_D2 = [43,54,65,75,89,97,100,110,130,140];
const T7_A2 = [63,78,94,110,120,140,150,170,180,200];
const T7_M2 = [30,37,45,52,60,67,75,82,90,97];
const T7_A2R = T7_A2;
const T7_M2R = [31,39,47,55,63,71,78,86,94,10]; // NOTE: trailing 10 looks suspicious but preserved.
const T7_Z3 = T7_Z1;
const T7_M3 = [90,110,130,150,180,200,220,240,270,290];
const T7_D3 = T7_Z1;
const T7_M3R = T7_M3;

// T8 cells (from your inline arrays)
const T8_Z1 = [120,160,200,240,280,320,360,400,440,480];
const T8_D1 = [81,100,130,160,180,210,240,270,290,320];
const T8_Z2 = T8_D1;
const T8_D2 = T8_Z1;
const T8_A2 = [180,220,280,340,390,450,510,560,620,680];
const T8_M2 = [77,100,120,150,180,200,230,250,280,300];
const T8_A2R = [180,240,300,360,420,480,540,600,660,720];
const T8_M2R = [120,170,210,250,300,340,380,430,470,510];
const T8_Z3 = [110,150,190,230,270,310,350,390,430,470];
const T8_M3 = [240,320,400,480,560,640,720,810,890,970];
const T8_D3 = T8_Z1;
const T8_M3R = [240,320,400,480,560,640,720,800,880,960];

// ------------------------- math helpers (closed form) ------------------------

/** Single level cost: coeff*(level + addition) - negative */
export const levelCostCalc = (coeff, addition, level, negative = 0) =>
  (coeff * (level + addition)) - negative;

/** Sum for levels (level+1 .. totalLevels) of coeff*(i+addition) - negative. */
function sumLinearLevels(coeff, addition, level, totalLevels, negative = 0) {
  if (level >= totalLevels) return 0;
  const start = level + 1;
  const end = totalLevels;
  const n = end - start + 1;
  const sumI = (start + end) * n / 2;
  return coeff * (sumI + addition * n) - negative * n;
}

/** Time sum: Σ( (baseLevelCost*modA) - modB - flatTime ), levels as above. */
function sumTimeLinearLevels(modA, modB, flatTime, coeff, addition, level, totalLevels, negative = 0) {
  if (level >= totalLevels) return 0;
  const start = level + 1;
  const end = totalLevels;
  const n = end - start + 1;
  const sumI = (start + end) * n / 2;

  const baseSum = coeff * (sumI + addition * n) - negative * n;
  return (modA * baseSum) - (modB * n) - (flatTime * n);
}

/** Sum tail of an array from index = level */
function sumTail(arr, level) {
  if (!arr || level >= arr.length) return 0;
  let s = 0;
  for (let i = level; i < arr.length; i++) s += arr[i];
  return s;
}

// ------------------------- core engine config -------------------------------

/**
 * A per-tier config that declares:
 * - totalLevels for normal nodes
 * - nodes: left1, right1, left2, right2, left3, right3 config:
 *   - btad: {coeff, add, neg}
 *   - time: {coeff, add, neg}
 *   - form: {coeff, add, neg}
 *   - cells: per species arrays to sum as tail
 * - compass: maxLevel + how to add btads/form/time & extra cells
 * - ritual: what to add if ritualLv === 0
 */
const TIER = {
  5: {
    totalLevels: 10,
    nodes: {
      left1:  { btad:{coeff:2.5, add:3, neg:0}, time:{coeff:3, add:1, neg:0}, form:{coeff:2.5, add:3, neg:0},
                cells:{ zombie:[5.4,10,12,14,16,18,20,22,24,26], demon:dragonT5cellCostSetA } },
      right1: { btad:{coeff:2.5, add:3, neg:0}, time:{coeff:3, add:1, neg:0}, form:{coeff:2.5, add:3, neg:0},
                cells:{ zombie:dragonT5cellCostSetA, demon:dragonT5cellCostSetB } },

      left2:  { btad:{coeff:3.75, add:3, neg:0}, time:{coeff:4, add:1, neg:0}, form:{coeff:3, add:3, neg:0},
                cells:{ angel:dragonT5cellCostSetC, mutant:dragonT5cellCostSetA } },
      right2: { btad:{coeff:3.75, add:3, neg:0}, time:{coeff:4, add:1, neg:0}, form:{coeff:3, add:3, neg:0},
                cells:{ angel:dragonT5cellCostSetC, mecha:dragonT5cellCostSetA } },

      left3:  { btad:{coeff:5, add:3, neg:0},   time:{coeff:5, add:1, neg:0}, form:{coeff:4, add:3, neg:0},
                cells:{ zombie:dragonT5cellCostSetB, mecha:dragonT5cellCostSetD } },
      right3: { btad:{coeff:5, add:3, neg:0},   time:{coeff:5, add:1, neg:0}, form:{coeff:4, add:3, neg:0},
                cells:{ demon:dragonT5cellCostSetB, mutant:dragonT5cellCostSetD } },
    },
    compass: {
      maxLevel: 3,
      // linear adds for btads/form/time for levels (lv .. 2) using sumLinearLevels
      btad:  { coeff:50, add:0, neg:0 },
      form:  { coeff:20, add:0, neg:0 },
      time:  { coeff:20, add:0, neg:0 },
      extraCellsLinear: {
        angel: { coeff:30, add:0, neg:0 },
        mecha: { coeff:30, add:0, neg:0 },
      }
    },
    ritual: {
      btads: 75,
      hours: { base:120 }, // hours contribution = (modA*base) - modB - flat
      form: 30,
      cells: { mutant:45, mecha:45 }
    }
  },

  6: {
    totalLevels: 10,
    nodes: {
      left1:  { btad:{coeff:12.5, add:3, neg:0}, time:{coeff:8, add:0.5, neg:0}, form:{coeff:2.5, add:3, neg:0},
                cells:{ zombie:[5.4,10,12,14,16,18,20,22,24,26], demon:dragonT6cellCostSetA } },
      right1: { btad:{coeff:12.5, add:3, neg:0}, time:{coeff:8, add:0.5, neg:0}, form:{coeff:2.5, add:3, neg:0},
                cells:{ zombie:dragonT6cellCostSetA, demon:dragonT6cellCostSetB } },

      left2:  { btad:{coeff:15, add:3, neg:0},   time:{coeff:10, add:0.5, neg:0}, form:{coeff:3, add:3, neg:0},
                cells:{ angel:dragonT6cellCostSetC, mutant:dragonT6cellCostSetA } },
      right2: { btad:{coeff:15, add:3, neg:0},   time:{coeff:10, add:0.5, neg:0}, form:{coeff:3, add:3, neg:0},
                cells:{ angel:dragonT6cellCostSetC, mecha:dragonT6cellCostSetA } },

      left3:  { btad:{coeff:20, add:3, neg:0},   time:{coeff:12, add:0.5, neg:0}, form:{coeff:4, add:3, neg:0},
                cells:{ zombie:dragonT6cellCostSetB, mecha:dragonT6cellCostSetD } },
      right3: { btad:{coeff:20, add:3, neg:0},   time:{coeff:12, add:0.5, neg:0}, form:{coeff:4, add:3, neg:0},
                cells:{ demon:dragonT6cellCostSetB, mutant:dragonT6cellCostSetD } },
    },
    compass: {
      maxLevel: 3,
      time:  { coeff:144, add:0, neg:72 }, // neg=72 (your nodeTimeCostSum(..., 144, 0, lv, 3, NEG=72))
      // “front-loaded” lump costs by current compass level:
      lumps: {
        0: { btads:1080, form:450 },
        1: { btads: 960, form:400 },
        2: { btads: 600, form:250 },
      },
      extraCellsLinear: { // angel & mutant linear adds via nodeCostSum(

