// lib/queue.js
function createQueue({ concurrency = 1 } = {}) {
  const safeConcurrency = Math.max(1, Number(concurrency) || 1);
  let active = 0;
  const pending = [];

  function runNext() {
    if (active >= safeConcurrency) return;
    const next = pending.shift();
    if (!next) return;
    active += 1;

    Promise.resolve()
      .then(next.fn)
      .then(next.resolve, next.reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  }

  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      pending.push({ fn, resolve, reject });
      runNext();
    });
  }

  return {
    enqueue,
    get active() {
      return active;
    },
    get size() {
      return pending.length;
    },
  };
}

module.exports = { createQueue };
