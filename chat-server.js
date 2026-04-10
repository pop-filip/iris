require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const { getHistory, addMessage } = require('./db');
const { buildContext } = require('./knowledge');
const { detectLeadIntent, captureLead } = require('./leads');

const app = express();
app.use(express.json());

// CORS — allow embed from any domain
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Rate limiting — 20 messages/min per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});
app.use('/chat', chatLimiter);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLIENT_NAME  = process.env.CLIENT_NAME  || 'Iris';
const BUSINESS_NAME = process.env.BUSINESS_NAME || '';
const BUSINESS_HOURS = process.env.BUSINESS_HOURS || ''; // e.g. "Mo-Fr 08:00-18:00"
const WIDGET_PORT  = parseInt(process.env.WIDGET_PORT || '3002');

function buildSystemPrompt() {
  const base = process.env.IRIS_SYSTEM_PROMPT ||
    `Du bist ${CLIENT_NAME}, ein KI-Assistent${BUSINESS_NAME ? ` von ${BUSINESS_NAME}` : ''}.
Du hilfst Kunden mit Produktfragen, Bestellungen und allgemeinen Anfragen.
Budi ljubazan, profesionalan i koncizan. Antworte in der Sprache des Kunden.
Wenn ein Kunde Interesse an einem Kauf zeigt oder Kontaktdaten hinterlässt, bestätige dies freundlich.`;

  const context = buildContext();
  const hours = BUSINESS_HOURS
    ? `\n\nÖffnungszeiten: ${BUSINESS_HOURS}. Falls außerhalb der Öffnungszeiten, weise freundlich darauf hin und biete an, eine Nachricht zu hinterlassen.`
    : '';

  return base + hours + context;
}

function isWithinBusinessHours() {
  if (!BUSINESS_HOURS) return true; // no restriction if not configured

  try {
    // Simple parse: "Mo-Fr 08:00-18:00"
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon...5=Fri, 6=Sat
    const hour = now.getHours() + now.getMinutes() / 60;

    const match = BUSINESS_HOURS.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (!match) return true;

    const open  = parseInt(match[1]) + parseInt(match[2]) / 60;
    const close = parseInt(match[3]) + parseInt(match[4]) / 60;

    const weekdayOnly = BUSINESS_HOURS.toLowerCase().includes('mo-fr') || BUSINESS_HOURS.toLowerCase().includes('mo–fr');
    if (weekdayOnly && (day === 0 || day === 6)) return false;

    return hour >= open && hour < close;
  } catch {
    return true;
  }
}

// POST /chat — main endpoint for widget
app.post('/chat', async (req, res) => {
  const { message, userId, clientId } = req.body;

  if (!message || !userId) {
    return res.status(400).json({ error: 'message and userId required' });
  }

  const cId = clientId || process.env.CLIENT_ID || 'default';

  console.log(`[widget] ${cId}/${userId}: ${message.substring(0, 60)}`);

  // Outside business hours — still answer but add note
  const withinHours = isWithinBusinessHours();

  addMessage(userId, 'user', message);
  const history = getHistory(userId, 10);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: history,
    });

    const reply = response.content[0].text;
    addMessage(userId, 'assistant', reply);

    // Async lead detection — don't block the response
    detectLeadIntent(message).then(async ({ isLead, confidence }) => {
      if (isLead && (confidence === 'high' || confidence === 'medium')) {
        // lazy-load bot only if available
        try {
          const { getBotInstance } = require('./bot-instance');
          const bot = getBotInstance();
          await captureLead(bot, cId, 'widget', message);
        } catch {
          // bot not available in standalone mode — save lead without Telegram notify
          const { addLead } = require('./db');
          addLead(cId, 'widget', null, null, null, message);
        }
      }
    }).catch(() => {});

    res.json({
      reply,
      withinHours,
      offHoursNote: !withinHours ? `Wir sind aktuell nicht erreichbar. Öffnungszeiten: ${BUSINESS_HOURS}` : null,
    });
  } catch (err) {
    console.error('[widget] Claude error:', err.message);
    res.status(500).json({ error: 'Service temporarily unavailable' });
  }
});

// GET /health
app.get('/health', (req, res) => res.json({
  ok: true,
  service: 'iris-widget',
  client: process.env.CLIENT_NAME || 'default',
  withinHours: isWithinBusinessHours(),
}));

function startChatServer() {
  app.listen(WIDGET_PORT, () => {
    console.log(`[widget] ✅ Chat API listening on port ${WIDGET_PORT}`);
  });
}

module.exports = { startChatServer, app };

// Auto-start when run directly: node chat-server.js
if (require.main === module) startChatServer();
