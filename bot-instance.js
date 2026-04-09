// Shared Telegraf bot instance — set once in bot.js, read in chat-server.js / whatsapp.js
let _bot = null;

function setBotInstance(bot) {
  _bot = bot;
}

function getBotInstance() {
  return _bot;
}

module.exports = { setBotInstance, getBotInstance };
