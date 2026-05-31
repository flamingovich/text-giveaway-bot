function withNoLinkPreview(extra) {
  const base = extra && typeof extra === "object" ? { ...extra } : {};
  return {
    ...base,
    link_preview_options: { is_disabled: true },
  };
}

function wrapTelegramMethod(original, extraIndex) {
  return (...args) => {
    if (args.length > extraIndex) {
      args[extraIndex] = withNoLinkPreview(args[extraIndex]);
    } else {
      while (args.length < extraIndex) {
        args.push(undefined);
      }
      args[extraIndex] = withNoLinkPreview();
    }
    return original(...args);
  };
}

function applyNoLinkPreview(telegram) {
  for (const [method, extraIndex] of [
    ["sendMessage", 2],
    ["sendPhoto", 2],
    ["sendVideo", 2],
    ["editMessageText", 4],
    ["editMessageCaption", 4],
  ]) {
    if (typeof telegram[method] === "function") {
      telegram[method] = wrapTelegramMethod(telegram[method].bind(telegram), extraIndex);
    }
  }
  return telegram;
}

module.exports = {
  withNoLinkPreview,
  applyNoLinkPreview,
};
