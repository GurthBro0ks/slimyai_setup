"use strict";

const startedAt = new Date();
let requestCount = 0;
let imagesProcessed = 0;
let chatMessages = 0;

function recordRequest() {
  requestCount += 1;
}

function recordImages(count = 1) {
  imagesProcessed += Number(count) || 0;
}

function recordChatMessage() {
  chatMessages += 1;
}

function snapshot() {
  return {
    startedAt: startedAt.toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    requests: requestCount,
    imagesProcessed,
    chatMessages,
  };
}

module.exports = {
  recordRequest,
  recordImages,
  recordChatMessage,
  snapshot,
};
