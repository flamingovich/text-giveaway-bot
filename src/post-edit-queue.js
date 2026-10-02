// One edit of a channel post at a time.
//
// Three things edit a draw's post, each on its own clock: the update after a
// join, the countdown on the scheduler's tick, and the tick's catch-up of a
// stale participant count. When two met on one post Telegram dropped the
// first - "400: canceled by new edit message request", 34 times in four days -
// and a burst of edits on one post is also what earns a 429. Queued per post,
// each edit starts once the one before it has finished, whatever its outcome.

function createPostEditQueue() {
  const tails = new Map();

  function run(key, task) {
    const previous = tails.get(key) || Promise.resolve();
    const result = previous.then(() => task());
    const tail = result.then(
      () => {},
      () => {},
    );
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    });
    return result;
  }

  run.pendingPosts = () => tails.size;
  return run;
}

module.exports = { createPostEditQueue };
