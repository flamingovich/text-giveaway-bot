const { Markup } = require("telegraf");
const { DateTime } = require("luxon");

const MEGA_WINNERS_MIN = 1;
const MEGA_WINNERS_MAX = 100;

const megaSessions = new Map();

function isMegaDraw(draw) {
  return draw?.kind === "mega" || draw?.joinMode === "mega";
}

function removeMegaSession(userId) {
  megaSessions.delete(Number(userId));
}

function createMegaDrawId() {
  return `draw_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function registerMegaGiveawayBot(deps) {
  const {
    bot,
    isOrganizer,
    readData,
    writeData,
    writeDataPreservingLiveWinners,
    filterByOwner,
    readKnownChannels,
    findOwnedKnownChannel,
    DRAW_STATUS,
    TIMEZONE,
    getKeyboardMarkup,
    markDrawPostParticipantCount,
    markDrawCountdownCache,
    scheduleDrawPostUpdate,
  } = deps;

  function getOrganizerChannels(userId) {
    return filterByOwner(readKnownChannels().channels || [], userId);
  }

  function startSession(userId) {
    const session = {
      step: "post",
      draft: {
        ownerId: userId,
        sourcePost: null,
        panelTitle: "",
        channelId: "",
        endMode: "manual",
        endAt: "",
        endAfterValue: null,
        endAfterUnit: null,
        winnerConfirmMode: "disabled",
        winnerConfirmValue: 0,
        winnerConfirmUnit: "minutes",
        winnersCount: null,
      },
    };
    megaSessions.set(Number(userId), session);
    return session;
  }

  function formatChannelLabel(channel) {
    const handle = channel.username ? `@${String(channel.username).replace(/^@/, "")}` : channel.id;
    return `${channel.title || "Канал"} (${handle})`;
  }

  function buildDrawFromDraft(draft) {
    const now = DateTime.now().setZone(TIMEZONE);
    let endAtISO = "";
    if (draft.endMode === "scheduled" && draft.endAfterValue && draft.endAfterUnit) {
      endAtISO = now
        .plus({ [draft.endAfterUnit]: draft.endAfterValue })
        .toISO();
    }

    const panelTitle = String(draft.panelTitle || "").trim();
    const prizeLabel = panelTitle || "Mega-розыгрыш";

    return {
      id: createMegaDrawId(),
      kind: "mega",
      joinMode: "mega",
      status: DRAW_STATUS.ACTIVE,
      publishTarget: "dm",
      awaitingChannelPost: true,
      ownerId: draft.ownerId,
      createdBy: draft.ownerId,
      createdAt: new Date().toISOString(),
      publishAt: now.toISO(),
      channelId: draft.channelId,
      postTitle: panelTitle,
      prizeType: "custom",
      prize: prizeLabel,
      projectId: null,
      askProjectIdOnJoin: false,
      askWalletOnJoin: false,
      showProjectInPost: false,
      imagePath: "",
      sourcePost: { ...draft.sourcePost },
      winnersCount: draft.winnersCount,
      endMode: draft.endMode,
      endAt: endAtISO,
      endAfterValue: draft.endAfterValue,
      endAfterUnit: draft.endAfterUnit,
      winnerConfirmMode: draft.winnerConfirmMode,
      winnerConfirmValue: draft.winnerConfirmValue,
      winnerConfirmUnit: draft.winnerConfirmUnit,
      messageId: null,
      messageType: draft.sourcePost?.hasPhoto ? "photo" : "text",
      participantIds: [],
      winnerIds: [],
      winnerNotifications: {},
      participantReferrals: {},
      drawReferrals: {},
    };
  }

  async function copyMegaPostToChat(chatId, draw, count = 0) {
    const source = draw.sourcePost;
    if (!source?.chatId || !source?.messageId) {
      throw new Error("Исходный пост не найден.");
    }
    return bot.telegram.copyMessage(chatId, source.chatId, source.messageId, {
      reply_markup: getKeyboardMarkup(draw.id, count),
    });
  }

  async function finalizeMegaDraw(ctx, session) {
    const draw = buildDrawFromDraft(session.draft);
    const data = readData();
    data.draws.push(draw);
    writeData(data);

    const organizerId = Number(ctx.from.id);
    await copyMegaPostToChat(organizerId, draw, 0);

    const channelLabel = formatChannelLabel(
      findOwnedKnownChannel(draw.channelId, organizerId) ||
        getOrganizerChannels(organizerId).find((c) => String(c.id) === String(draw.channelId)) ||
        { id: draw.channelId, title: draw.channelId },
    );

    await ctx.reply(
      [
        "✅ Mega-розыгрыш создан.",
        "",
        `Заголовок в панели: ${draw.prize}`,
        `Канал: ${channelLabel}`,
        `Победителей: ${draw.winnersCount}`,
        draw.endMode === "manual"
          ? "Завершение: вручную"
          : `Завершение: ${DateTime.fromISO(draw.endAt, { zone: TIMEZONE }).toFormat("dd.MM.yyyy HH:mm")}`,
        "",
        "Сообщение выше — пост с кнопкой «Участвовать».",
        "Premium emoji сохранены.",
        "",
        "Опубликуйте в канал:",
      ].join("\n"),
      Markup.inlineKeyboard([
        [Markup.button.callback("📣 Опубликовать в канал", `mega:publish:${draw.id}`)],
        [Markup.button.callback("↗️ Перешлю сам", `mega:manual:${draw.id}`)],
      ]),
    );

    removeMegaSession(organizerId);
  }

  async function publishMegaDrawToChannel(draw) {
    const message = await copyMegaPostToChat(draw.channelId, draw, (draw.participantIds || []).length);
    draw.messageId = message.message_id;
    draw.messageType = Array.isArray(message.photo) && message.photo.length > 0 ? "photo" : "text";
    draw.awaitingChannelPost = false;
    markDrawPostParticipantCount(draw);
    markDrawCountdownCache(draw);
  }

  bot.command("megagiveaway", async (ctx) => {
    if (ctx.chat?.type !== "private") {
      await ctx.reply("Откройте личный чат с ботом и отправьте /megagiveaway");
      return;
    }
    if (!isOrganizer(ctx.from?.id)) {
      await ctx.reply("Команда доступна организаторам с подключённым каналом. Добавьте канал через /link_channel");
      return;
    }

    const channels = getOrganizerChannels(ctx.from.id);
    if (channels.length === 0) {
      await ctx.reply(
        [
          "Сначала подключите канал:",
          "1. Добавьте бота админом в канал",
          "2. Перешлите сюда любой пост из канала",
          "",
          "Или отправьте /link_channel",
        ].join("\n"),
      );
      return;
    }

    removeMegaSession(ctx.from.id);
    startSession(ctx.from.id);
    await ctx.reply(
      [
        "🎰 Mega-розыгрыш",
        "",
        "Шаг 1/6. Пришлите пост:",
        "• фото + подпись с premium emoji, или",
        "• только текст (без картинки)",
        "",
        "Отмена: /cancel_draw",
      ].join("\n"),
    );
  });

  bot.action(/^mega:skip_title$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "panelTitle") {
      await ctx.answerCbQuery("Сессия устарела. Отправьте /megagiveaway");
      return;
    }
    await ctx.answerCbQuery();
    session.draft.panelTitle = "";
    session.step = "channel";
    await promptChannelStep(ctx, session);
  });

  bot.action(/^mega:channel:(.+)$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "channel") {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }
    const channelId = ctx.match[1];
    if (!findOwnedKnownChannel(channelId, ctx.from.id)) {
      await ctx.answerCbQuery("Канал не найден.");
      return;
    }
    await ctx.answerCbQuery();
    session.draft.channelId = channelId;
    session.step = "endMode";
    await ctx.reply(
      "Шаг 4/6. Когда завершать розыгрыш?",
      Markup.inlineKeyboard([
        [Markup.button.callback("✋ Вручную", "mega:end:manual")],
        [Markup.button.callback("⏰ По времени", "mega:end:scheduled")],
      ]),
    );
  });

  bot.action(/^mega:end:(manual|scheduled)$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "endMode") {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }
    await ctx.answerCbQuery();
    const mode = ctx.match[1];
    session.draft.endMode = mode;
    if (mode === "manual") {
      session.step = "winnerConfirm";
      await promptWinnerConfirmStep(ctx);
      return;
    }
    session.step = "endDuration";
    await ctx.reply(
      "Через сколько завершить?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("1 ч", "mega:duration:1:hours"),
          Markup.button.callback("6 ч", "mega:duration:6:hours"),
        ],
        [
          Markup.button.callback("1 д", "mega:duration:1:days"),
          Markup.button.callback("3 д", "mega:duration:3:days"),
        ],
        [Markup.button.callback("7 д", "mega:duration:7:days")],
      ]),
    );
  });

  bot.action(/^mega:duration:(\d+):(hours|days)$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "endDuration") {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }
    await ctx.answerCbQuery();
    session.draft.endAfterValue = Number(ctx.match[1]);
    session.draft.endAfterUnit = ctx.match[2];
    session.step = "winnerConfirm";
    await promptWinnerConfirmStep(ctx);
  });

  bot.action(/^mega:confirm:(required|disabled)$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "winnerConfirm") {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }
    await ctx.answerCbQuery();
    const mode = ctx.match[1];
    session.draft.winnerConfirmMode = mode === "required" ? "required" : "disabled";
    if (mode === "disabled") {
      session.draft.winnerConfirmValue = 0;
      session.step = "winnersCount";
      await ctx.reply(`Шаг 6/6. Сколько победителей? (${MEGA_WINNERS_MIN}–${MEGA_WINNERS_MAX})`);
      return;
    }
    session.step = "winnerConfirmTime";
    await ctx.reply(
      "Сколько времени на подтверждение победы?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("30 мин", "mega:wctime:30:minutes"),
          Markup.button.callback("1 ч", "mega:wctime:1:hours"),
        ],
        [
          Markup.button.callback("2 ч", "mega:wctime:2:hours"),
          Markup.button.callback("6 ч", "mega:wctime:6:hours"),
        ],
      ]),
    );
  });

  bot.action(/^mega:wctime:(\d+):(minutes|hours)$/, async (ctx) => {
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session || session.step !== "winnerConfirmTime") {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }
    await ctx.answerCbQuery();
    session.draft.winnerConfirmValue = Number(ctx.match[1]);
    session.draft.winnerConfirmUnit = ctx.match[2];
    session.step = "winnersCount";
    await ctx.reply(`Шаг 6/6. Сколько победителей? (${MEGA_WINNERS_MIN}–${MEGA_WINNERS_MAX})`);
  });

  bot.action(/^mega:publish:(.+)$/, async (ctx) => {
    const drawId = ctx.match[1];
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId && isMegaDraw(item));
    if (!draw || !itemBelongsToOwner(draw, ctx.from?.id, deps)) {
      await ctx.answerCbQuery("Розыгрыш не найден.");
      return;
    }
    if (draw.messageId) {
      await ctx.answerCbQuery("Уже опубликован.");
      return;
    }
    try {
      await publishMegaDrawToChannel(draw);
      // The snapshot above predates the channel post. A plain write here would
      // roll back every join and winner notification saved while it was sent.
      writeDataPreservingLiveWinners(data);
      scheduleDrawPostUpdate?.(draw.id, false);
      await ctx.answerCbQuery("Опубликовано ✅");
      await ctx.reply(`Пост опубликован в канал. Розыгрыш активен.\nID: ${draw.id}`);
    } catch (error) {
      console.error("[mega] publish:", error.message);
      await ctx.answerCbQuery("Ошибка публикации");
      await ctx.reply(`Не удалось опубликовать: ${error.message}\nПроверьте, что бот — админ канала.`);
    }
  });

  bot.action(/^mega:manual:(.+)$/, async (ctx) => {
    const drawId = ctx.match[1];
    const data = readData();
    const draw = data.draws.find((item) => item.id === drawId && isMegaDraw(item));
    if (!draw || !itemBelongsToOwner(draw, ctx.from?.id, deps)) {
      await ctx.answerCbQuery("Розыгрыш не найден.");
      return;
    }
    await ctx.answerCbQuery();
    const channelLabel = formatChannelLabel(
      findOwnedKnownChannel(draw.channelId, ctx.from.id) || { id: draw.channelId, title: draw.channelId },
    );
    await ctx.reply(
      [
        "Перешлите сообщение с постом (выше) в канал:",
        channelLabel,
        "",
        "Кнопка «Участвовать» и premium emoji сохранятся.",
        "После публикации розыгрыш активируется автоматически.",
      ].join("\n"),
    );
  });

  async function promptChannelStep(ctx, session) {
    const channels = getOrganizerChannels(ctx.from.id);
    if (channels.length === 1) {
      session.draft.channelId = channels[0].id;
      session.step = "endMode";
      await ctx.reply(
        `Канал: ${formatChannelLabel(channels[0])}\n\nШаг 4/6. Когда завершать розыгрыш?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✋ Вручную", "mega:end:manual")],
          [Markup.button.callback("⏰ По времени", "mega:end:scheduled")],
        ]),
      );
      return;
    }
    const rows = channels.map((channel) => [
      Markup.button.callback(formatChannelLabel(channel).slice(0, 60), `mega:channel:${channel.id}`),
    ]);
    await ctx.reply("Шаг 3/6. Выберите канал:", Markup.inlineKeyboard(rows));
  }

  async function promptWinnerConfirmStep(ctx) {
    await ctx.reply(
      "Шаг 5/6. Победитель должен отметиться после победы?",
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Да, нужно подтверждение", "mega:confirm:required")],
        [Markup.button.callback("❌ Нет", "mega:confirm:disabled")],
      ]),
    );
  }

  function captureSourcePost(ctx) {
    const msg = ctx.message;
    if (!msg) {
      return null;
    }
    if (msg.photo?.length) {
      const caption = String(msg.caption || "").trim();
      if (!caption) {
        return { error: "Добавьте подпись к фото (текст поста)." };
      }
      return {
        chatId: msg.chat.id,
        messageId: msg.message_id,
        hasPhoto: true,
      };
    }
    const text = String(msg.text || "").trim();
    if (!text || text.startsWith("/")) {
      return { error: "Пришлите пост: фото с подписью или текстовое сообщение." };
    }
    return {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      hasPhoto: false,
    };
  }

  bot.on("message", async (ctx, next) => {
    if (ctx.chat?.type !== "private") {
      return next();
    }
    const session = megaSessions.get(Number(ctx.from?.id));
    if (!session) {
      return next();
    }

    if (session.step === "post") {
      const captured = captureSourcePost(ctx);
      if (captured?.error) {
        await ctx.reply(captured.error);
        return;
      }
      session.draft.sourcePost = captured;
      session.step = "panelTitle";
      await ctx.reply(
        [
          "Шаг 2/6. Заголовок в панели",
          "",
          "Как розыгрыш будет называться в админке (история, списки).",
          "На пост в канале это не влияет.",
          "",
          "Отправьте текст или нажмите «Пропустить».",
        ].join("\n"),
        Markup.inlineKeyboard([[Markup.button.callback("Пропустить", "mega:skip_title")]]),
      );
      return;
    }

    if (session.step === "panelTitle") {
      const text = String(ctx.message?.text || "").trim();
      if (!text || text.startsWith("/")) {
        await ctx.reply("Отправьте заголовок текстом или нажмите «Пропустить».");
        return;
      }
      session.draft.panelTitle = text.slice(0, 120);
      session.step = "channel";
      await promptChannelStep(ctx, session);
      return;
    }

    if (session.step === "winnersCount") {
      const value = Number(String(ctx.message?.text || "").trim());
      if (!Number.isInteger(value) || value < MEGA_WINNERS_MIN || value > MEGA_WINNERS_MAX) {
        await ctx.reply(`Введите целое число от ${MEGA_WINNERS_MIN} до ${MEGA_WINNERS_MAX}.`);
        return;
      }
      session.draft.winnersCount = value;
      await finalizeMegaDraw(ctx, session);
      return;
    }

    if (["channel", "endMode", "endDuration", "winnerConfirm", "winnerConfirmTime"].includes(session.step)) {
      await ctx.reply("На этом шаге выберите вариант кнопкой выше или отправьте /cancel_draw для отмены.");
      return;
    }

    return next();
  });
}

function itemBelongsToOwner(draw, userId, deps) {
  if (deps.itemBelongsToOwner) {
    return deps.itemBelongsToOwner(draw, userId);
  }
  const expected = Number(userId);
  const actual = draw?.ownerId != null ? Number(draw.ownerId) : null;
  return actual === expected;
}

module.exports = {
  isMegaDraw,
  removeMegaSession,
  registerMegaGiveawayBot,
  megaSessions,
};
