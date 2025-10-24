"use strict";

const corrections = require("./corrections");
const slimyCore = require("@slimy/core");
const vision = require("../../lib/club-vision");

function bufferToDataUrl(buffer, mimeType = "image/png") {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function rescanMember(guildId, payload, { userId = null } = {}) {
  const { fileBuffer, fileMime, filename, memberInput, metric, weekId } =
    payload;

  if (!fileBuffer || !memberInput) {
    throw new Error("File and memberInput are required");
  }

  const memberKey = slimyCore.normalizeMemberKey(memberInput);
  if (!memberKey) {
    throw new Error("Unable to normalize member key");
  }

  const dataUrl = bufferToDataUrl(fileBuffer, fileMime);

  let forcedMetric = null;
  if (metric && metric !== "auto") {
    forcedMetric = metric;
  } else {
    try {
      const classification = await vision.classifyPage(dataUrl, filename);
      if (classification?.type === "sim" || classification?.type === "total") {
        forcedMetric = classification.type;
      }
    } catch {
      // Ignore classification errors, we'll fallback to ensemble result metric
    }
  }

  const parseResult = await vision.parseManageMembersImageEnsemble(
    dataUrl,
    forcedMetric,
  );

  const targetRow = parseResult.rows.find(
    (row) => row.canonical === memberKey,
  );

  if (!targetRow) {
    throw new Error(
      `Member "${memberInput}" not found in screenshot for ${parseResult.metric}`,
    );
  }

  await corrections.createCorrection(
    guildId,
    {
      memberKey,
      displayName: targetRow.display || memberInput,
      metric: parseResult.metric,
      value: targetRow.value,
      reason: "rescan",
      source: "rescan",
      weekId: weekId || null,
    },
    { userId },
  );

  return {
    metric: parseResult.metric,
    memberKey,
    displayName: targetRow.display || memberInput,
    value: targetRow.value,
    ensemble: {
      totalMembers: parseResult.ensembleMetadata.totalMembers,
      disagreements: parseResult.ensembleMetadata.disagreements,
    },
  };
}

module.exports = {
  rescanMember,
};
