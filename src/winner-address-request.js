// When the owner may ask a winner for a deposit address again, and what has to
// be cleared before asking.
//
// Lives here rather than in index.js because the rules are the kind that look
// obvious and are not: a prize burned for a missing address and a prize burned
// by anti-fraud are the same status on disk, and only one of them is the
// owner's to undo.
//
// The time-dependent parts are injected: this module decides, it does not read
// the clock.

// Both endings write status "forfeited". Telling them apart is the whole point.
function getWinnerAddressForfeitureKind(notify, isAddressWindowExpired = () => false) {
  if (!notify) {
    return "";
  }
  if (notify.forfeitureReason === "address_timeout" || notify.addressExpired) {
    return "address";
  }
  if (notify.status === "awaiting_address" && isAddressWindowExpired(notify)) {
    return "address";
  }
  if (notify.status === "forfeited" || notify.antiFraudFlag) {
    return "other";
  }
  return "";
}

function canRequestWinnerAddressAgain(draw, notify, deps = {}) {
  const {
    hasFraudFlag = false,
    isAddressWindowExpired = () => false,
    isNotificationExpired = () => false,
    hasSavedAddress = () => false,
  } = deps;

  // Not "was this draw set up to ask for an address": that says where the
  // first address came from, and asking again exists because the first one is
  // no good. The project is what is actually needed - it decides the network
  // and the guide pictures.
  if (!draw?.projectId || !notify) {
    return false;
  }
  if (notify.paidAt || notify.paymentDeniedAt) {
    return false;
  }
  // Anti-fraud and a dead account are decisions about the person. Re-asking
  // would quietly undo them.
  if (hasFraudFlag) {
    return false;
  }
  if (getWinnerAddressForfeitureKind(notify, isAddressWindowExpired) === "other") {
    return false;
  }
  if (isNotificationExpired(notify, draw)) {
    return false;
  }
  // Someone who never passed the check has nothing to be asked for yet: that
  // case is "Оповестить заново", not this one.
  return (
    Boolean(notify.verifiedAt) ||
    notify.status === "confirmed" ||
    notify.status === "awaiting_address" ||
    hasSavedAddress(notify)
  );
}

// Re-asking has to leave the record exactly as a first ask leaves it, and the
// leftovers matter more than they look. addressReceivedAt alone keeps
// hasSavedWinnerDepositAddress true, which keeps the record out of the
// "still awaiting" set: the new twenty minutes would never expire, and the
// merge in winner-notify-sync would rank the stale record above the fresh one.
function clearWinnerAddressForRerequest(notify, isAddressWindowExpired = () => false, now = new Date()) {
  if (!notify) {
    return notify;
  }
  // Read the kind before deleting the fields it is read from.
  const wasAddressForfeiture =
    getWinnerAddressForfeitureKind(notify, isAddressWindowExpired) === "address";

  notify.trc20Address = "";
  delete notify.addressReceivedAt;
  delete notify.addressExpired;
  delete notify.walletTxCheckedAt;
  delete notify.walletTxCount;
  delete notify.walletHasTransactions;

  if (wasAddressForfeiture) {
    delete notify.forfeitedAt;
    delete notify.forfeitureReason;
    notify.antiFraudFlag = false;
  }

  notify.addressRerequestedAt = now.toISOString();
  notify.addressRerequestCount = Number(notify.addressRerequestCount || 0) + 1;
  return notify;
}

module.exports = {
  getWinnerAddressForfeitureKind,
  canRequestWinnerAddressAgain,
  clearWinnerAddressForRerequest,
};
