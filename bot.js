require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Memory: čuva zadnjih 10 poruka po korisniku
const memory = new Map();

const SYSTEM_PROMPT = `Ti si Iris, AI asistent kompanije Digital Nature.
Pomaži klijentima odgovarajući na pitanja o uslugama, terminima i općim upitima.
Budi ljubazan, profesionalan i koncizan. Odgovaraj na jeziku kojim ti korisnik piše.`;

function getHistory(userId) {
  if (!memory.has(userId)) memory.set(userId, []);
  return memory.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  // Čuvaj samo zadnjih 10 poruka
  if (history.length > 10) history.splice(0, history.length - 10);
}

bot.start((ctx) => {
  ctx.reply('Hallo! Ich bin Iris, dein KI-Assistent von Digital Nature. Wie kann ich dir helfen? 👋');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;

  // Typing indicator
  await ctx.sendChatAction('typing');

  addToHistory(userId, 'user', userMessage);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: getHistory(userId),
    });

    const reply = response.content[0].text;
    addToHistory(userId, 'assistant', reply);

    await ctx.reply(reply);
  } catch (err) {
    console.error('Claude greška:', err.message);
    await ctx.reply('Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.');
  }
});

bot.launch()
  .then(() => console.log('✅ Iris bot je pokrenut!'))
  .catch((err) => console.error('❌ Greška pri pokretanju:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
