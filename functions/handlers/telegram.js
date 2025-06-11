const {handleTelegramWebhook} = require("../services/telegram");

exports.telegramWebhookHandler = async (req, res) => {
  await handleTelegramWebhook(req, res);
};