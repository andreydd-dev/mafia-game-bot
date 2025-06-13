const {Client} = require("@notionhq/client");
const axios = require("axios");
const {capitalizeFirstLetter} = require("../utils/helpers");

const notion = new Client({auth: process.env.NOTION_API_KEY});

async function findPlayerByUsername(username) {
  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID_PLAYERS,
    filter: {
      property: "Name",
      rich_text: {equals: username},
    },
  });
  return response.results[0];
}

async function findExistingSignup(date, nickname, guest, from, guestNumber = null) {
  const filters = [
    {property: "Game date", rich_text: {equals: date}},
    {property: "isGuest", status: {equals: guest ? "True" : "False"}},
  ];

  if (guest) {
    filters.push({property: "whoAddName", rich_text: {equals: from}});
    if (guestNumber !== null) {
      filters.push({property: "GuestNumber", number: {equals: guestNumber}});
    }
  } else {
    filters.push({property: "Name", title: {equals: nickname}});
  }

  const response = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID_SIGNUPS,
    filter: {and: filters},
  });

  return response.results;
}

async function deleteSignup(pageId, chatId) {
  const page = await notion.pages.retrieve({page_id: pageId});
  const date = page.properties["Game date"]?.rich_text?.[0]?.text?.content;
  if (!date) return;

  await notion.pages.update({page_id: pageId, archived: true});
  await buildSignupsSummaryAndSyncToTelegram(notion, chatId);
}

async function createSignup({date, time, nickname, from, isGuest = false}) {
  let displayName = from;
  let guestNumber = null;

  const player = await findPlayerByUsername(from);
  if (player) {
    const nameProp = player.properties?.["Game Nickname"]?.rich_text?.[0]?.text?.content;
    if (nameProp) displayName = nameProp;
  }

  let finalNickname = displayName;
  let messageId = null;

  try {
    const meta = await notion.databases.query({
      database_id: process.env.NOTION_DB_ID_GAME_METADATA,
      filter: {property: "Date", rich_text: {equals: date}},
    });
    const metadataPage = meta.results[0];
    if (metadataPage) {
      messageId = metadataPage.properties?.Message?.number || null;
    }
  } catch (e) {
    console.warn("Не вдалося отримати metadata:", e.message);
  }

  if (isGuest) {
    const existingGuests = await notion.databases.query({
      database_id: process.env.NOTION_DB_ID_SIGNUPS,
      filter: {
        and: [
          {property: "Game date", rich_text: {equals: date}},
          {property: "isGuest", status: {equals: "True"}},
          {property: "whoAddName", rich_text: {equals: from}},
        ],
      },
    });
    guestNumber = existingGuests.results.length + 1;
    finalNickname = `Гість #${guestNumber} від ${displayName}`;
  }

  await notion.pages.create({
    parent: {database_id: process.env.NOTION_DB_ID_SIGNUPS},
    properties: {
      "Name": {title: [{text: {content: nickname}}]},
      "Nickname": {rich_text: [{text: {content: finalNickname}}]},
      "Game date": {rich_text: [{text: {content: date}}]},
      "Game time": {rich_text: [{text: {content: time}}]},
      "whoAddName": {rich_text: [{text: {content: from}}]},
      "isGuest": {status: {name: isGuest ? "True" : "False"}},
      "GuestNumber": guestNumber !== null ? {number: guestNumber} : undefined,
      "mID": messageId ? {number: messageId} : undefined,
      "Timestamp": {number: Date.now()},
    },
  });
}

async function buildSignupsSummaryAndSyncToTelegram(notion, chatId, resend = false) {
  const pages = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID_SIGNUPS,
    filter: {property: "Game date", rich_text: {is_not_empty: true}},
  });

  const today = new Date();
  const groupedByDate = {};
  const sortedPages = pages.results.sort((a, b) => {
    const t1 = a.properties["Timestamp"]?.number || 0;
    const t2 = b.properties["Timestamp"]?.number || 0;
    return t1 - t2;
  });
  console.log("sortedPages",sortedPages);
  for (const page of sortedPages) {
    const props = page.properties;
    const dateStr = props["Game date"]?.rich_text?.[0]?.text?.content;
    const time = props["Game time"]?.rich_text?.[0]?.text?.content || "18:00";
    const nickname =
      props["Game Nickname"]?.rich_text?.[0]?.text?.content ||
      props["Nickname"]?.rich_text?.[0]?.text?.content || "Гість";

    if (!dateStr) continue;

    const date = new Date(dateStr);
    console.log("date",date);
    if (isNaN(date.getTime()) || date <= today) continue;

    if (!groupedByDate[dateStr]) groupedByDate[dateStr] = [];
    groupedByDate[dateStr].push(time !== "18:00" ? `${nickname} (${time})` : nickname);
  }

  for (const dateKey of Object.keys(groupedByDate).sort()) {
    const players = groupedByDate[dateKey];
    let gameTime = "18:00";
    let messageId = null;
    let metadataPage = null;

    try {
      const meta = await notion.databases.query({
        database_id: process.env.NOTION_DB_ID_GAME_METADATA,
        filter: {property: "Date", rich_text: {equals: dateKey}},
      });
      metadataPage = meta.results[0];

      if (!metadataPage) {
        const newPage = await notion.pages.create({
          parent: {database_id: process.env.NOTION_DB_ID_GAME_METADATA},
          properties: {
            "Date": {rich_text: [{text: {content: dateKey}}]},
            "GameTime": {rich_text: [{text: {content: gameTime}}]},
          },
        });
        metadataPage = newPage;
      }

      if (metadataPage?.properties?.GameTime?.rich_text?.length) {
        gameTime = metadataPage.properties.GameTime.rich_text[0].text?.content || "18:00";
      }

      messageId = metadataPage.properties?.Message?.number || null;
    } catch (e) {
      console.warn(`Metadata not found for ${dateKey}:`, e.message);
    }

    const formattedDate = new Date(dateKey).toLocaleDateString("uk-UA", {
      weekday: "long", day: "2-digit", month: "2-digit",
    });

    let messageText = `Мафія\n\n${capitalizeFirstLetter(formattedDate)} о ${gameTime}\n`;
    players.slice(0, 10).forEach((name, i) => {
      messageText += `${i + 1}. ${name}\n`;
    });

    try {
      if (resend && messageId) {
        try {
          await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
            chat_id: chatId,
            message_id: messageId,
          });
          messageId = null; // видалили — готові створювати нове
        } catch (err) {
          console.warn(`⚠️ Неможливо видалити повідомлення ${messageId}:`, err.response?.data?.description || err.message);
          messageId = null; // навіть якщо не вдалось видалити — все одно створимо нове
        }
      }


      if (messageId) {
        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: messageText.trim(),
        });
      } else {
        const response = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: messageText.trim(),
        });
        const newMessageId = response.data?.result?.message_id;
        if (newMessageId && metadataPage?.id) {
          await notion.pages.update({
            page_id: metadataPage.id,
            properties: {"Message": {number: newMessageId}},
          });
        }
      }
    } catch (err) {
      console.error(`Помилка при синхронізації дати ${dateKey}:`, err.message);
    }
  }
}

async function isBotActive() {
  const state = await notion.databases.query({
    database_id: process.env.NOTION_DB_ID_BOT_STATE,
  });

  const status = state.results[0]?.properties?.Status?.status?.name;
  return status === "Active";
}

module.exports = {
  notion,
  findPlayerByUsername,
  findExistingSignup,
  deleteSignup,
  createSignup,
  buildSignupsSummaryAndSyncToTelegram,
  isBotActive,
};