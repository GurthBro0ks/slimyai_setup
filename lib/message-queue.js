// lib/message-queue.js
const { createQueue } = require('./queue');

const MAX_QUEUE_CONCURRENCY = 2;
const MIN_QUEUE_CONCURRENCY = 1;
const concurrency = Math.min(
  MAX_QUEUE_CONCURRENCY,
  Math.max(MIN_QUEUE_CONCURRENCY, Number(process.env.MESSAGE_QUEUE_CONCURRENCY) || 2),
);

const messageQueue = createQueue({ concurrency });

module.exports = messageQueue;
