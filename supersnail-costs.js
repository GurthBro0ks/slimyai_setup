// Temporary stub to unblock Phase 1; replace with real data in Phase 2.
const dragonT5cellCostSetA = [];
const dragonT5cellCostSetB = [];
const dragonT5cellCostSetC = [];
const dragonT5cellCostSetD = [];

const dragonT6cellCostSetA = [];
const dragonT6cellCostSetB = [];
const dragonT6cellCostSetC = [];
const dragonT6cellCostSetD = [];

const t6BtadCoeffs = [];
const t6CompassBtads = [];
const t6CompassCellCosts = [];
const t7BtadCoeffs = [];
const t8BtadCoeffs = [];

function levelCostCalc() { return 0; }
function nodeTimeCostSum() { return 0; }

// Stub calculation functions for T5-T8
// Signature: (l1, r1, l2, compass, r2, l3, r3, ritual, timeModA, timeModB, flatTime, btadMod, cellMod, dragon)
// Returns: dragon ? [zombie, demon, angel, mutant, mecha, btads, hours] : [formCells, btads, hours]

function formT5Calc(l1, r1, l2, compass, r2, l3, r3, ritual, timeModA, timeModB, flatTime, btadMod, cellMod, dragon) {
  // Placeholder calculation - replace with actual game formulas
  const baseCells = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 1000 * cellMod;
  const btads = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 10 * btadMod;
  const hours = (baseCells / 100 * timeModA + timeModB / 3600 + flatTime / 60);

  if (dragon) {
    // Split cells across species for dragon mode
    return [
      Math.floor(baseCells * 0.2), // zombie
      Math.floor(baseCells * 0.2), // demon
      Math.floor(baseCells * 0.2), // angel
      Math.floor(baseCells * 0.2), // mutant
      Math.floor(baseCells * 0.2), // mecha
      Math.floor(btads),
      Math.floor(hours)
    ];
  }
  return [Math.floor(baseCells), Math.floor(btads), Math.floor(hours)];
}

function formT6Calc(l1, r1, l2, compass, r2, l3, r3, ritual, timeModA, timeModB, flatTime, btadMod, cellMod, dragon) {
  // Placeholder calculation - T6 typically costs more than T5
  const baseCells = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 2000 * cellMod;
  const btads = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 20 * btadMod;
  const hours = (baseCells / 100 * timeModA + timeModB / 3600 + flatTime / 60);

  if (dragon) {
    return [
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(btads),
      Math.floor(hours)
    ];
  }
  return [Math.floor(baseCells), Math.floor(btads), Math.floor(hours)];
}

function formT7Calc(l1, r1, l2, compass, r2, l3, r3, ritual, timeModA, timeModB, flatTime, btadMod, cellMod, dragon) {
  // Placeholder calculation - T7 costs more than T6
  const baseCells = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 5000 * cellMod;
  const btads = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 50 * btadMod;
  const hours = (baseCells / 100 * timeModA + timeModB / 3600 + flatTime / 60);

  if (dragon) {
    return [
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(btads),
      Math.floor(hours)
    ];
  }
  return [Math.floor(baseCells), Math.floor(btads), Math.floor(hours)];
}

function formT8Calc(l1, r1, l2, compass, r2, l3, r3, ritual, timeModA, timeModB, flatTime, btadMod, cellMod, dragon) {
  // Placeholder calculation - T8 is the highest tier
  const baseCells = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 10000 * cellMod;
  const btads = (l1 + r1 + l2 + compass + r2 + l3 + r3 + ritual) * 100 * btadMod;
  const hours = (baseCells / 100 * timeModA + timeModB / 3600 + flatTime / 60);

  if (dragon) {
    return [
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(baseCells * 0.2),
      Math.floor(btads),
      Math.floor(hours)
    ];
  }
  return [Math.floor(baseCells), Math.floor(btads), Math.floor(hours)];
}

module.exports = {
  dragonT5cellCostSetA,
  dragonT5cellCostSetB,
  dragonT5cellCostSetC,
  dragonT5cellCostSetD,
  dragonT6cellCostSetA,
  dragonT6cellCostSetB,
  dragonT6cellCostSetC,
  dragonT6cellCostSetD,
  t6BtadCoeffs,
  t6CompassBtads,
  t6CompassCellCosts,
  t7BtadCoeffs,
  t8BtadCoeffs,
  levelCostCalc,
  nodeTimeCostSum,
  formT5Calc,
  formT6Calc,
  formT7Calc,
  formT8Calc,
};
