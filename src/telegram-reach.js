// Whether the bot may write to a person at all. Getting this wrong is costly in
// both directions: call someone reachable when they are not and they join a
// draw whose prize they can never be told about; call someone unreachable when
// the network merely blinked and you have barred them from entering.

function isCannotMessageUserError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("can't initiate conversation") ||
    message.includes("cant initiate") ||
    message.includes("chat not found") ||
    message.includes("bot was blocked") ||
    message.includes("blocked by the user") ||
    message.includes("user is deactivated")
  );
}

module.exports = { isCannotMessageUserError };
