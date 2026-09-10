const test = require("node:test");
const assert = require("node:assert");
const {
  getWinnerAddressForfeitureKind,
  canRequestWinnerAddressAgain,
  clearWinnerAddressForRerequest,
} = require("./winner-address-request");

const DRAW = { id: "draw_1", projectId: "brand_beef_1001" };
const expired = () => true;
const notExpired = () => false;
const hasAddress = (notify) => Boolean(notify.trc20Address || notify.addressReceivedAt);

function can(notify, extra = {}) {
  return canRequestWinnerAddressAgain(DRAW, notify, {
    isAddressWindowExpired: notExpired,
    hasSavedAddress: hasAddress,
    ...extra,
  });
}

test("a winner with an address that turned out to be wrong can be asked again", () => {
  assert.strictEqual(
    can({ status: "confirmed", verifiedAt: "2026-09-01T10:00:00Z", trc20Address: "TWn..." }),
    true,
  );
});

test("a winner still inside the address window can be asked again", () => {
  assert.strictEqual(can({ status: "awaiting_address", verifiedAt: "2026-09-01T10:00:00Z" }), true);
});

test("a prize burned only for the missing address can be revived", () => {
  const notify = {
    status: "forfeited",
    forfeitureReason: "address_timeout",
    addressExpired: true,
    antiFraudFlag: true,
    verifiedAt: "2026-09-01T10:00:00Z",
  };
  assert.strictEqual(getWinnerAddressForfeitureKind(notify), "address");
  assert.strictEqual(can(notify), true);
});

test("a prize burned by anti-fraud is not the owner's to undo", () => {
  const notify = {
    status: "forfeited",
    forfeitureReason: "antifraud",
    antiFraudFlag: true,
    verifiedAt: "2026-09-01T10:00:00Z",
  };
  assert.strictEqual(getWinnerAddressForfeitureKind(notify), "other");
  assert.strictEqual(can(notify), false);
});

test("a live anti-fraud flag refuses even when the record looks fine", () => {
  assert.strictEqual(
    can({ status: "confirmed", verifiedAt: "2026-09-01T10:00:00Z" }, { hasFraudFlag: true }),
    false,
  );
});

test("a prize already paid or refused is settled", () => {
  assert.strictEqual(can({ status: "confirmed", verifiedAt: "x", paidAt: "2026-09-02" }), false);
  assert.strictEqual(
    can({ status: "confirmed", verifiedAt: "x", paymentDeniedAt: "2026-09-02" }),
    false,
  );
});

test("someone who never passed the check is not asked for an address", () => {
  // That case is "Оповестить заново"; asking for an address first would skip
  // the subscription check the prize depends on.
  assert.strictEqual(can({ status: "pending", sentAt: "2026-09-01T10:00:00Z" }), false);
});

test("a confirmation window that ran out is not reopened from here", () => {
  assert.strictEqual(
    can({ status: "pending", sentAt: "2026-09-01T10:00:00Z" }, { isNotificationExpired: () => true }),
    false,
  );
});

test("a draw with no project cannot ask: nothing decides the network", () => {
  assert.strictEqual(
    canRequestWinnerAddressAgain({ id: "d", projectId: "" }, { status: "confirmed", verifiedAt: "x" }, {}),
    false,
  );
});

test("an address window that has quietly run out counts as the address ending", () => {
  const notify = { status: "awaiting_address", verifiedAt: "x" };
  assert.strictEqual(getWinnerAddressForfeitureKind(notify, expired), "address");
  assert.strictEqual(can(notify, { isAddressWindowExpired: expired }), true);
});

test("clearing leaves nothing that would make the record look answered", () => {
  const notify = {
    status: "confirmed",
    verifiedAt: "2026-09-01T10:00:00Z",
    trc20Address: "TWnOld",
    addressReceivedAt: "2026-09-01T10:05:00Z",
    walletTxCheckedAt: "2026-09-01T10:05:00Z",
    walletTxCount: 3,
    walletHasTransactions: true,
  };
  clearWinnerAddressForRerequest(notify, notExpired, new Date("2026-09-08T12:00:00Z"));
  assert.strictEqual(notify.trc20Address, "");
  // This one is the trap: it alone makes the record read as "already answered".
  assert.strictEqual("addressReceivedAt" in notify, false);
  assert.strictEqual("walletTxCount" in notify, false);
  assert.strictEqual(notify.addressRerequestedAt, "2026-09-08T12:00:00.000Z");
  assert.strictEqual(notify.addressRerequestCount, 1);
});

test("clearing un-burns a prize burned for the address, and only that one", () => {
  const address = {
    status: "forfeited",
    forfeitureReason: "address_timeout",
    addressExpired: true,
    antiFraudFlag: true,
    forfeitedAt: "2026-09-07T00:00:00Z",
    verifiedAt: "x",
  };
  clearWinnerAddressForRerequest(address, notExpired);
  assert.strictEqual("forfeitedAt" in address, false);
  assert.strictEqual("forfeitureReason" in address, false);
  assert.strictEqual(address.antiFraudFlag, false);

  const fraud = {
    status: "forfeited",
    forfeitureReason: "antifraud",
    antiFraudFlag: true,
    forfeitedAt: "2026-09-07T00:00:00Z",
  };
  clearWinnerAddressForRerequest(fraud, notExpired);
  assert.strictEqual(fraud.forfeitedAt, "2026-09-07T00:00:00Z");
  assert.strictEqual(fraud.antiFraudFlag, true);
});

test("asking a third time keeps counting", () => {
  const notify = { status: "confirmed", verifiedAt: "x", addressRerequestCount: 2 };
  clearWinnerAddressForRerequest(notify, notExpired);
  assert.strictEqual(notify.addressRerequestCount, 3);
});
