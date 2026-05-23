const axios = require("axios");
const {OpenAI} = require("openai");
const {
  notion,
  findExistingSignup,
  deleteSignup,
  createSignup,
  buildSignupsSummaryAndSyncToTelegram,
  isBotActive,
} = require("./notion");
const {getCurrentDateUtc, formatGameDateUkUa} = require("../utils/date");

function getOpenAIClient() {
  return new OpenAI({apiKey: process.env.OPENAI_API_KEY});
}

async function sendMessage(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
  });
}

async function handleTelegramWebhook(req, res) {
  try {
    const admins = process.env.TELEGRAM_BOT_ADMIN || [];
    const message = req.body?.message;
    const callback = req.body?.callback_query;
    const allowedChats = process.env.TELEGRAM_ALLOWED_CHAT || [];
    const chatId = message?.chat?.id || callback?.message?.chat?.id;

    console.log("allowedChats", allowedChats);
    console.log("message", chatId, message);
    if (!allowedChats.includes(chatId)) {
      console.log(`⛔ Запит з chatId ${chatId} відхилено`);
      return res.status(200).send("Chat not allowed");
    }

    const username = message?.from?.username || callback?.from?.username;
    const tgId = message?.from?.id || callback?.from?.id;
    // if (username === "informex") {
    //   return res.status(200).send("Chat not allowed");
    // }

    const text = message?.text?.trim();
    const isAdmin = admins.includes(username);

    const isActive = await isBotActive();
    if (!isActive && !isAdmin) return res.status(200).send("Bot is inactive for non-admins");

    if (text === "/startbot" || text === "/stopbot") {
      if (!isAdmin) {
        console.log( "⛔ У вас немає прав для цієї команди.");
        return res.status(200).send("Access denied");
      }
      const newStatus = text === "/startbot" ? "Active" : "Stopped";
      const state = await notion.databases.query({database_id: process.env.NOTION_DB_ID_BOT_STATE});
      const pageId = state.results[0]?.id;
      if (pageId) {
        await notion.pages.update({
          page_id: pageId,
          properties: {"Status": {status: {name: newStatus}}},
        });
        await sendMessage(chatId, newStatus === "Active"
          ? "✅ Запис на ігри відкритий"
          : "⛔ Запис тимчасово призупинений");
      } else {
        await console.log("❌ Не знайдено сторінку з Bot State.");
      }
      return res.status(200).send("Bot state updated");
    }

    if (text === "/actual") {
      await buildSignupsSummaryAndSyncToTelegram(notion, chatId, true);
      return res.status(200).send("OK");
    }

    if (text === "/settime") {
      const todayISO = getCurrentDateUtc();
      const meta = await notion.databases.query({
        database_id: process.env.NOTION_DB_ID_GAME_METADATA,
        filter: {
          and: [
            {property: "Date", rich_text: {is_not_empty: true}},
            {property: "Date", rich_text: {does_not_contain: "past"}},
          ],
        },
      });

      const dates = meta.results
        .map(p => p.properties?.Date?.rich_text?.[0]?.text?.content)
        .filter(Boolean).filter(d => d >= todayISO).sort();

      const keyboard = dates.map(date => {
        const label = formatGameDateUkUa(date);
        return [{text: label, callback_data: `settime_date_${date}`}];
      });

      if (!keyboard.length) {
        await console.log( "⛔ Немає доступних майбутніх ігор для редагування.");
        return res.status(200).send("No dates available");
      }

      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "🗓 Обери день для зміни часу:",
        reply_markup: {inline_keyboard: keyboard},
      });

      return res.status(200).send("Date options sent");
    }

    const callbackData = callback?.data;
    const cbChatId = callback?.message?.chat?.id;
    const messageId = callback?.message?.message_id;

    if (callbackData?.startsWith("settime_date_")) {
      const selectedDate = callbackData.replace("settime_date_", "");
      const timeOptions = ["17:00", "18:00", "19:00"].map(time => [{
        text: time, callback_data: `settime_time_${selectedDate}_${time}`
      }]);

      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
        chat_id: cbChatId,
        message_id: messageId,
        text: `🕰 Обери час для *${selectedDate}*:`,
        parse_mode: "Markdown",
        reply_markup: {inline_keyboard: timeOptions},
      });

      return res.status(200).send("Time options sent");
    }

    if (callbackData?.startsWith("settime_time_")) {
      const [, , selectedDate, selectedTime] = callbackData.split("_");
      const meta = await notion.databases.query({
        database_id: process.env.NOTION_DB_ID_GAME_METADATA,
        filter: {property: "Date", rich_text: {equals: selectedDate}},
      });

      const page = meta.results[0];
      if (page?.id) {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            GameTime: {
              rich_text: [{text: {content: selectedTime}}],
            },
          },
        });

        await buildSignupsSummaryAndSyncToTelegram(notion, cbChatId, true);

        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
          chat_id: cbChatId,
          message_id: messageId,
          text: `✅ Час гри на ${selectedDate} оновлено: *${selectedTime}*`,
          parse_mode: "Markdown",
        });

        return res.status(200).send("Time updated");
      } else {
        await console.log("⚠️ Не знайдено гру для цієї дати.");
        return res.status(404).send("Not found");
      }
    }

    if (text?.startsWith("/deleteplayer")) {
      await console.log( "Функція видалення гравця ще не реалізована.");
      return res.status(200).send("OK");
    }

    if (message) {
      const openai = getOpenAIClient();
      const thread = await openai.beta.threads.create();
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: [{
          type: "text",
          text: JSON.stringify({...message, current_date: getCurrentDateUtc()})
        }],
      });

      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
      });

      let runStatus = "queued";
      while (runStatus !== "completed") {
        const updatedRun = await openai.beta.threads.runs.retrieve(run.id, {thread_id: thread.id});
        runStatus = updatedRun.status;
        if (runStatus === "failed") return res.status(500).send("Помилка в асистенті");
        if (runStatus !== "completed") await new Promise((r) => setTimeout(r, 1000));
      }

      const messages = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data.find(m => m.role === "assistant");
      const parsed = JSON.parse(lastMessage?.content?.[0]?.text?.value);
      console.log("parsed AI", parsed);
      const signups = parsed.signups || [];

      for (const signup of signups) {
        const {date, nickname, guest, telegramId} = signup;
        if (guest) {
          const guestPages = await notion.databases.query({
            database_id: process.env.NOTION_DB_ID_SIGNUPS,
            filter: {
              and: [
                {property: "Game date", rich_text: {equals: date}},
                {property: "isGuest", status: {equals: "True"}},
                {
                  or: [
                    {property: "whoAddName", rich_text: {equals: nickname}},
                    {property: "whoAddTelegramId", number: {equals: Number(telegramId)}},
                  ],
                },
              ],
            },
            sorts: [{property: "GuestNumber", direction: "descending"}],
            page_size: 1,
          });

          if (guestPages.results.length > 0) {
            await deleteSignup(guestPages.results[0].id, chatId);
          }
        } else {
          const existing = await findExistingSignup(date, nickname, guest, nickname, telegramId);
          for (const page of existing) {
            await deleteSignup(page.id, chatId);
          }
        }
      }

      for (const signup of signups) {
        const {date, time, nickname, action, guest, telegramId} = signup;
        if (action !== "add") continue;
        await createSignup({date, time, nickname, from: nickname, telegramId, isGuest: guest});
      }

      await buildSignupsSummaryAndSyncToTelegram(notion, chatId);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Помилка:", err);
    res.status(500).send("Помилка");
  }
}

module.exports = {
  sendMessage,
  handleTelegramWebhook,
};