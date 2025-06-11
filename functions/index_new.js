require("dotenv").config();
const functions = require("firebase-functions");
const express = require("express");
const app = express();
const {telegramWebhookHandler} = require("./handlers/telegram");

app.use(express.json());
app.post("/", telegramWebhookHandler);

exports.telegramWebhook = functions.https.onRequest(app);