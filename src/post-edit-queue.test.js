const test = require("node:test");
const assert = require("node:assert");
const { createPostEditQueue } = require("./post-edit-queue");

const tick = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The incident: a join's update and the countdown met on one post, and
// Telegram cancelled the first with "canceled by new edit message request".
test("a second edit of the same post waits for the first to finish", async () => {
  const run = createPostEditQueue();
  const first = deferred();
  const started = [];
  const one = run("chan:1", () => {
    started.push("join");
    return first.promise;
  });
  const two = run("chan:1", () => {
    started.push("countdown");
    return "done";
  });
  await tick();
  assert.deepEqual(started, ["join"], "второй не начинается, пока идёт первый");
  first.resolve("ok");
  assert.equal(await one, "ok");
  assert.equal(await two, "done");
  assert.deepEqual(started, ["join", "countdown"]);
});

test("different posts are edited side by side", async () => {
  const run = createPostEditQueue();
  const first = deferred();
  const started = [];
  run("chan:1", () => {
    started.push("post 1");
    return first.promise;
  });
  run("chan:2", () => {
    started.push("post 2");
  });
  await tick();
  assert.deepEqual(started, ["post 1", "post 2"]);
  first.resolve();
});

test("a failed edit hands the post on and reports its own failure", async () => {
  const run = createPostEditQueue();
  const failing = run("chan:1", () => Promise.reject(new Error("429")));
  const next = run("chan:1", () => "next");
  await assert.rejects(failing, /429/);
  assert.equal(await next, "next");
});

test("nothing is kept once a post's edits are done", async () => {
  const run = createPostEditQueue();
  await run("chan:1", () => "a");
  await run("chan:2", () => "b");
  await tick();
  assert.equal(run.pendingPosts(), 0);
});
