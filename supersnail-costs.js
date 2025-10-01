// supersnail-costs.js
// CommonJS version: drop-in with your existing commands/snail.js

'use strict';

// ---------------------- base data arrays ----------------------
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

// ---------------------- helpers ----------------------
const nodeCostSum = (coeff, additonConstant, level, totalLevels = 10, negativeConstant = 0) => {
  if (level === 10) return 0;
  let sum = 0;
  level++;
  for (let i = level; i <= totalLevels; i++) {
    const levelBaseCost = ((coeff * (i + additonConstant)) - negativeConstant);
    sum += levelBaseCost;
  }
  return sum;
};
const nodeTimeCostSum = (timeModA, timeModB, flatTime, coeff, additonConstant, level, totalLevels = 10, negativeConstant = 0) => {
  let sum = 0;
  level++;
  for (let i = level; i <= totalLevels; i++) {
    sum += ((((coeff * (i + additonConstant)) - negativeConstant) * timeModA) - timeModB) - flatTime;
  }
  return sum;
};

const levelCostCalc = (coeff, additonConstant, level, negativeConstant = 0) => {
  return (coeff * (level + additonConstant)) - negativeConstant;
};

function costReductionCalc(buffCost, tier, row, level, btad = false) {
  let baseCost = 0;
  if (tier === 5) {
    if (btad) {
      baseCost = levelCostCalc((row + 1) * 1.25, 3, level);
    } else {
      baseCost = levelCostCalc((row * 0.5) + 0.5, 3, level);
    }
  } else if (tier === 6) {
    if (btad) {
      baseCost = levelCostCalc(t6BtadCoeffs[row - 1], 3, level);
    } else {
      baseCost = row === 1 ? levelCostCalc(2.5, 3, level)
           : row === 2 ? levelCostCalc(3, 3, level)
                       : levelCostCalc(4, 3, level);
    }
  } else if (tier === 7) {
    if (btad) {
      baseCost = levelCostCalc(t7BtadCoeffs[row - 1], 3, level);
    } else {
      baseCost = row === 1 ? levelCostCalc(5, 3, level)
           : row === 2 ? levelCostCalc(8, 3, level)
                       : levelCostCalc(12, 3, level);
    }
  } else if (tier === 8) {
    if (btad) {
      baseCost = levelCostCalc(t8BtadCoeffs[row - 1], 2, level);
    } else {
      baseCost = row === 1 ? levelCostCalc(20, 2, level)
           : row === 2 ? levelCostCalc(30, 2, level)
                       : levelCostCalc(40, 2, level);
    }
  }
  return buffCost / (baseCost * 1000);
}

function singleLevelCostHandler(tier, row, level, timeModA = 1, timeModB = 0, flatTime = 0, btadMod = 1, cellMod = 1) {
  let btadCost = 0;
  let cellCost = 0;
  let hoursCost = 0;

  if (tier === 5) {
    if (row === 'Middle') {
      btadCost = level * 50;
      cellCost = level * 20;
      hoursCost = level * 20;
    } else if (row === 'Ritual') {
      btadCost = 75;
      cellCost = 30;
      hoursCost = 120;
    } else {
      btadCost = levelCostCalc((row + 1) * 1.25, 3, level);
      cellCost = levelCostCalc(row + 2, 1, level);
      hoursCost = nodeTimeCostSum(timeModA, timeModB, flatTime, row + 2, 1, level - 1, level);
    }
  } else if (tier === 6) {
    if (row === 'Middle') {
      btadCost = (level * 240) - 120;
      cellCost = (level * 100) - 50;
      hoursCost = (level * 144) - 72;
    } else if (row === 'Ritual') {
      btadCost = 30;
      cellCost = 60;
      hoursCost = 720;
    } else {
      btadCost = levelCostCalc((row + 1) * 1.25, 3, level);
      cellCost = levelCostCalc(row + 2, 1, level);
      hoursCost = nodeTimeCostSum(timeModA, timeModB, flatTime, ((row * 2) + 6), 0.5, level - 1, level);
    }
  }
  return [(cellCost * 1000) * cellMod, (btadCost * 1000) * btadMod, hoursCost];
}

// ---------------------- T5–T8 calculators ----------------------
function formT5Calc(leftNodeFirstLv, rightNodeFirstLv, leftNodeSecondLv, compassNodeLv, rightNodeSecondLv, leftNodeThirdLv, rightNodeThirdLv, ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon = false) {
  timeModB = timeModB / 3600;
  flatTime = flatTime / 60;

  let totalBTads = 0;
  let totalHours = 0;
  let formCells = 0;
  let zombieCells = 0;
  let demonCells = 0;
  let angelCells = 0;
  let mutantCells = 0;
  let mechaCells = 0;

  if (leftNodeFirstLv < 10) {
    totalBTads += nodeCostSum(2.5, 3, leftNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 3, 1, leftNodeFirstLv);
    formCells += nodeCostSum(2.5, 3, leftNodeFirstLv);
    zombieCells += [5.4, 10, 12, 14, 16, 18, 20, 22, 24, 26].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += dragonT5cellCostSetA.slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeFirstLv < 10) {
    totalBTads += nodeCostSum(2.5, 3, rightNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 3, 1, rightNodeFirstLv);
    formCells += nodeCostSum(2.5, 3, rightNodeFirstLv);
    zombieCells += dragonT5cellCostSetA.slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += dragonT5cellCostSetB.slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeSecondLv < 10) {
    totalBTads += nodeCostSum(3.75, 3, leftNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 4, 1, leftNodeSecondLv);
    formCells += nodeCostSum(3, 3, leftNodeSecondLv);
    angelCells += dragonT5cellCostSetC.slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
    mutantCells += dragonT5cellCostSetA.slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (compassNodeLv < 3) {
    totalBTads += nodeCostSum(50, 0, compassNodeLv, 3);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 20, 0, compassNodeLv, 3);
    formCells += nodeCostSum(20, 0, compassNodeLv, 3);
    angelCells += nodeCostSum(30, 0, compassNodeLv, 3);
    mechaCells += nodeCostSum(30, 0, compassNodeLv, 3);
  }

  if (rightNodeSecondLv < 10) {
    totalBTads += nodeCostSum(3.75, 3, rightNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 4, 1, rightNodeSecondLv);
    formCells += nodeCostSum(3, 3, rightNodeSecondLv);
    angelCells += dragonT5cellCostSetC.slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
    mechaCells += dragonT5cellCostSetA.slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeThirdLv < 10) {
    totalBTads += nodeCostSum(5, 3, leftNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 5, 1, leftNodeThirdLv);
    formCells += nodeCostSum(4, 3, leftNodeThirdLv);
    zombieCells += dragonT5cellCostSetB.slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
    mechaCells += dragonT5cellCostSetD.slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeThirdLv < 10) {
    totalBTads += nodeCostSum(5, 3, rightNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 5, 1, rightNodeThirdLv);
    formCells += nodeCostSum(4, 3, rightNodeThirdLv);
    demonCells += dragonT5cellCostSetB.slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
    mutantCells += dragonT5cellCostSetD.slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (ritualLv === 0) {
    totalBTads += 75;
    totalHours += ((timeModA * 120) - timeModB) - flatTime;
    formCells += 30;
    mutantCells += 45;
    mechaCells += 45;
  }

  totalBTads *= btadMod;
  formCells *= cellMod;
  zombieCells *= cellMod;
  demonCells *= cellMod;
  angelCells *= cellMod;
  mutantCells *= cellMod;
  mechaCells *= cellMod;

  let response;
  if (dragon) {
    response = [zombieCells * 1000, demonCells * 1000, angelCells * 1000, mutantCells * 1000, mechaCells * 1000, totalBTads * 1000, totalHours];
  } else {
    response = [formCells * 1000, totalBTads * 1000, totalHours];
  }
  return response.map(el => Math.round(el));
}

function formT6Calc(leftNodeFirstLv, rightNodeFirstLv, leftNodeSecondLv, compassNodeLv, rightNodeSecondLv, leftNodeThirdLv, rightNodeThirdLv, ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon = false) {
  timeModB = timeModB / 3600;
  flatTime = flatTime / 60;

  let totalBTads = 0;
  let totalHours = 0;
  let formCells = 0;
  let zombieCells = 0;
  let demonCells = 0;
  let angelCells = 0;
  let mutantCells = 0;
  let mechaCells = 0;

  if (leftNodeFirstLv < 10) {
    totalBTads += nodeCostSum(12.5, 3, leftNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 8, 0.5, leftNodeFirstLv);
    formCells += nodeCostSum(2.5, 3, leftNodeFirstLv);
    zombieCells += [5.4, 10, 12, 14, 16, 18, 20, 22, 24, 26].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += dragonT6cellCostSetA.slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeFirstLv < 10) {
    totalBTads += nodeCostSum(12.5, 3, rightNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 8, 0.5, rightNodeFirstLv);
    formCells += nodeCostSum(2.5, 3, rightNodeFirstLv);
    zombieCells += dragonT6cellCostSetA.slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += dragonT6cellCostSetB.slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeSecondLv < 10) {
    totalBTads += nodeCostSum(15, 3, leftNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 10, 0.5, leftNodeSecondLv);
    formCells += nodeCostSum(3, 3, leftNodeSecondLv);
    angelCells += dragonT6cellCostSetC.slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
    mutantCells += dragonT6cellCostSetA.slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (compassNodeLv === 0) {
    totalBTads += 1080;
    formCells += 450;
  } else if (compassNodeLv === 1) {
    totalBTads += 960;
    formCells += 400;
  } else if (compassNodeLv === 2) {
    totalBTads += 600;
    formCells += 250;
  }
  if (compassNodeLv < 3) {
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 144, 0, compassNodeLv, 3, 72);
    angelCells += nodeCostSum(100, 0, compassNodeLv, 3);
    mutantCells += nodeCostSum(100, 0, compassNodeLv, 3);
  }

  if (rightNodeSecondLv < 10) {
    totalBTads += nodeCostSum(15, 3, rightNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 10, 0.5, rightNodeSecondLv);
    formCells += nodeCostSum(3, 3, rightNodeSecondLv);
    angelCells += dragonT6cellCostSetC.slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
    mechaCells += dragonT6cellCostSetA.slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeThirdLv < 10) {
    totalBTads += nodeCostSum(20, 3, leftNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 12, 0.5, leftNodeThirdLv);
    formCells += nodeCostSum(4, 3, leftNodeThirdLv);
    zombieCells += dragonT6cellCostSetB.slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
    mechaCells += dragonT6cellCostSetD.slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeThirdLv < 10) {
    totalBTads += nodeCostSum(20, 3, rightNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 12, 0.5, rightNodeThirdLv);
    formCells += nodeCostSum(4, 3, rightNodeThirdLv);
    demonCells += dragonT6cellCostSetB.slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
    mutantCells += dragonT6cellCostSetD.slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (ritualLv === 0) {
    totalBTads += 30;
    totalHours += ((timeModA * 720) - timeModB) - flatTime;
    formCells += 60;
    mutantCells += 90;
    mechaCells += 90;
  }

  totalBTads *= btadMod;
  formCells *= cellMod;
  zombieCells *= cellMod;
  demonCells *= cellMod;
  angelCells *= cellMod;
  mutantCells *= cellMod;
  mechaCells *= cellMod;

  let response;
  if (dragon) {
    response = [zombieCells * 1000, demonCells * 1000, angelCells * 1000, mutantCells * 1000, mechaCells * 1000, totalBTads * 1000, totalHours];
  } else {
    response = [formCells * 1000, totalBTads * 1000, totalHours];
  }
  return response.map(el => Math.round(el));
}

function formT7Calc(leftNodeFirstLv, rightNodeFirstLv, leftNodeSecondLv, compassNodeLv, rightNodeSecondLv, leftNodeThirdLv, rightNodeThirdLv, ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon = false) {
  timeModB = timeModB / 3600;
  flatTime = flatTime / 60;

  let totalBTads = 0;
  let totalHours = 0;
  let formCells = 0;
  let zombieCells = 0;
  let demonCells = 0;
  let angelCells = 0;
  let mutantCells = 0;
  let mechaCells = 0;

  if (leftNodeFirstLv < 10) {
    totalBTads += nodeCostSum(50, 3, leftNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 24, 1, leftNodeFirstLv);
    formCells += nodeCostSum(5, 3, leftNodeFirstLv);
    zombieCells += [45,56,67,78,90,100,110,120,130,140].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += [30,37,45,52,60,67,75,82,90,97].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeFirstLv < 10) {
    totalBTads += nodeCostSum(50, 3, rightNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 24, 1, rightNodeFirstLv);
    formCells += nodeCostSum(5, 3, rightNodeFirstLv);
    zombieCells += [30,37,45,52,60,67,75,82,90,97].slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += [43,54,65,75,89,97,100,110,130,140].slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeSecondLv < 10) {
    totalBTads += nodeCostSum(80, 3, leftNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 48, 1, leftNodeSecondLv);
    formCells += nodeCostSum(18, 0.777, leftNodeSecondLv);
    angelCells += [63,78,94,110,120,140,150,170,180,200].slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
    mutantCells += [30,37,45,52,60,67,75,82,90,97].slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (compassNodeLv === 0) {
    totalBTads += 6800;
    formCells += 680;
  } else if (compassNodeLv === 1) {
    totalBTads += 6080;
    formCells += 608;
  } else if (compassNodeLv === 2) {
    totalBTads += 5040;
    formCells += 504;
  } else if (compassNodeLv === 3) {
    totalBTads += 3680;
    formCells += 368;
  } else if (compassNodeLv === 4) {
    totalBTads += 2000;
    formCells += 200;
  }
  if (compassNodeLv < 5) {
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 192, 0.25, compassNodeLv, 5);
    angelCells += nodeCostSum(50, 1, compassNodeLv, 5);
    mutantCells += nodeCostSum(50, 1, compassNodeLv, 5);
  }

  if (rightNodeSecondLv < 10) {
    totalBTads += nodeCostSum(80, 3, rightNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 48, 1, rightNodeSecondLv);
    formCells += nodeCostSum(18, 0.777, rightNodeSecondLv);
    angelCells += [63,78,94,110,120,140,150,170,180,200].slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
    mechaCells += [31,39,47,55,63,71,78,86,94,10].slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeThirdLv < 10) {
    totalBTads += nodeCostSum(120, 3, leftNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 72, 1, leftNodeThirdLv);
    formCells += nodeCostSum(12, 3, leftNodeThirdLv);
    zombieCells += [45,56,67,78,90,100,110,120,130,140].slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
    mechaCells += [90,110,130,150,180,200,220,240,270,290].slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeThirdLv < 10) {
    totalBTads += nodeCostSum(120, 3, rightNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 72, 1, rightNodeThirdLv);
    formCells += nodeCostSum(12, 3, rightNodeThirdLv);
    demonCells += [45,56,67,78,90,100,110,120,130,140].slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
    mutantCells += [90,110,130,150,180,200,220,240,270,290].slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (ritualLv === 0) {
    totalBTads += 1600;
    totalHours += ((timeModA * 720) - timeModB) - flatTime;
    formCells += 160;
    mutantCells += 240;
    mechaCells += 240;
  }

  totalBTads *= btadMod;
  formCells *= cellMod;
  zombieCells *= cellMod;
  demonCells *= cellMod;
  angelCells *= cellMod;
  mutantCells *= cellMod;
  mechaCells *= cellMod;

  let response;
  if (dragon) {
    response = [zombieCells * 1000, demonCells * 1000, angelCells * 1000, mutantCells * 1000, mechaCells * 1000, totalBTads * 1000, totalHours];
  } else {
    response = [formCells * 1000, totalBTads * 1000, totalHours];
  }
  return response.map(el => Math.round(el));
}

function formT8Calc(leftNodeFirstLv, rightNodeFirstLv, leftNodeSecondLv, compassNodeLv, rightNodeSecondLv, leftNodeThirdLv, rightNodeThirdLv, ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon = false) {
  timeModB = timeModB / 3600;
  flatTime = flatTime / 60;

  let totalBTads = 0;
  let totalHours = 0;
  let formCells = 0;
  let zombieCells = 0;
  let demonCells = 0;
  let angelCells = 0;
  let mutantCells = 0;
  let mechaCells = 0;

  if (leftNodeFirstLv < 10) {
    totalBTads += nodeCostSum(500, 2, leftNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 168, 0, leftNodeFirstLv);
    formCells += nodeCostSum(20, 2, leftNodeFirstLv);
    zombieCells += [120,160,200,240,280,320,360,400,440,480].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += [81,100,130,160,180,210,240,270,290,320].slice(leftNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeFirstLv < 10) {
    totalBTads += nodeCostSum(500, 2, rightNodeFirstLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 168, 0, rightNodeFirstLv);
    formCells += nodeCostSum(20, 2, rightNodeFirstLv);
    zombieCells += [81,100,130,160,180,210,240,270,290,320].slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
    demonCells += [120,160,200,240,280,320,360,400,440,480].slice(rightNodeFirstLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeSecondLv < 10) {
    totalBTads += nodeCostSum(750, 2, leftNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 240, 0, leftNodeSecondLv);
    formCells += nodeCostSum(30, 2, leftNodeSecondLv);
    angelCells += [180,220,280,340,390,450,510,560,620,680].slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
    mutantCells += [77,100,120,150,180,200,230,250,280,300].slice(leftNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (compassNodeLv === 0) {
    totalBTads += 75000;
    formCells += 3000;
  } else if (compassNodeLv === 1) {
    totalBTads += 70000;
    formCells += 2800;
  } else if (compassNodeLv === 2) {
    totalBTads += 60000;
    formCells += 2400;
  } else if (compassNodeLv === 3) {
    totalBTads += 45000;
    formCells += 1800;
  } else if (compassNodeLv === 4) {
    totalBTads += 25000;
    formCells += 1000;
  }
  if (compassNodeLv < 5) {
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 960, 0, compassNodeLv, 5, 10);
    angelCells += [300,400,500,600,900].slice(compassNodeLv).reduce((a, b) => a + b, 0);
    mutantCells += [300,400,500,600,900].slice(compassNodeLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeSecondLv < 10) {
    totalBTads += nodeCostSum(750, 2, rightNodeSecondLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 240, 0, rightNodeSecondLv);
    formCells += nodeCostSum(30, 2, rightNodeSecondLv);
    angelCells += [180,240,300,360,420,480,540,600,660,720].slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
    mechaCells += [120,170,210,250,300,340,380,430,470,510].slice(rightNodeSecondLv).reduce((a, b) => a + b, 0);
  }

  if (leftNodeThirdLv < 10) {
    totalBTads += nodeCostSum(1000, 2, leftNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 360, 0, leftNodeThirdLv);
    formCells += nodeCostSum(40, 2, leftNodeThirdLv);
    zombieCells += [110,150,190,230,270,310,350,390,430,470].slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
    mechaCells += [240,320,400,480,560,640,720,810,890,970].slice(leftNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (rightNodeThirdLv < 10) {
    totalBTads += nodeCostSum(1000, 2, rightNodeThirdLv);
    totalHours += nodeTimeCostSum(timeModA, timeModB, flatTime, 360, 0, rightNodeThirdLv);
    formCells += nodeCostSum(40, 2, rightNodeThirdLv);
    demonCells += [120,160,200,240,280,320,360,400,440,480].slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
    mutantCells += [240,320,400,480,560,640,720,800,880,960].slice(rightNodeThirdLv).reduce((a, b) => a + b, 0);
  }

  if (ritualLv === 0) {
    totalBTads += 12500;
    totalHours += ((timeModA * 4320) - timeModB) - flatTime;
    formCells += 500;
    mutantCells += 500;
    mechaCells += 12500;
  }

  totalBTads *= btadMod;
  formCells *= cellMod;
  zombieCells *= cellMod;
  demonCells *= cellMod;
  angelCells *= cellMod;
  mutantCells *= cellMod;
  mechaCells *= cellMod;

  let response;
  if (dragon) {
    response = [zombieCells * 1000, demonCells * 1000, angelCells * 1000, mutantCells * 1000, mechaCells * 1000, totalBTads * 1000, totalHours];
  } else {
    response = [formCells * 1000, totalBTads * 1000, totalHours];
  }
  return response.map(el => Math.round(el));
}

// ---------------------- exports ----------------------
module.exports = {
  // helpers
  nodeCostSum,
  nodeTimeCostSum,
  levelCostCalc,
  costReductionCalc,
  singleLevelCostHandler,

  // calculators
  formT5Calc,
  formT6Calc,
  formT7Calc,
  formT8Calc,

  // data (if other files want them)
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
};
