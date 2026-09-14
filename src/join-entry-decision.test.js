const test = require("node:test");
const assert = require("node:assert/strict");

const { decideJoinEntry } = require("./join-entry-decision");

test("someone the bot cannot message is not added straight away, even with a known project", () => {
  // The bug: this person used to be added before the "open the bot" step.
  assert.equal(decideJoinEntry({ alreadyParticipant: false, canSkipRegistration: true, canReachUser: false }), "flow");
});

test("someone the bot can message who took part before is added straight away, as before", () => {
  assert.equal(decideJoinEntry({ alreadyParticipant: false, canSkipRegistration: true, canReachUser: true }), "auto_join");
});

test("when the check was unavailable, the person is treated as reachable", () => {
  assert.equal(decideJoinEntry({ alreadyParticipant: false, canSkipRegistration: true }), "auto_join");
});

test("someone already in the draw sees it whether or not the bot can reach them", () => {
  assert.equal(decideJoinEntry({ alreadyParticipant: true, canSkipRegistration: true, canReachUser: false }), "already_joined");
  assert.equal(decideJoinEntry({ alreadyParticipant: true, canSkipRegistration: false, canReachUser: true }), "already_joined");
});

test("someone who still has registration ahead goes through the steps either way", () => {
  assert.equal(decideJoinEntry({ alreadyParticipant: false, canSkipRegistration: false, canReachUser: true }), "flow");
  assert.equal(decideJoinEntry({ alreadyParticipant: false, canSkipRegistration: false, canReachUser: false }), "flow");
});
