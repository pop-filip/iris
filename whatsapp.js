require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const { getHistory, addMessage } = require('./db');

const app = express();
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ti si Iris, AI asistent kompanije Digital Nature.
Pomaži korisniku sa kalendarom, podsjetnicima i općim upitima.
Budi ljubazan, profesionalan i koncizan. Odgovaraj na jeziku kojim ti korisnik piše.`;

const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// POST /whatsapp — Twilio webhook
app.post('/whatsapp', async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const from = req.body.From; // 'whatsapp:+43...'

  if (!incomingMsg || !from) {
    return res.status(400).send('Bad Request');
  }

  // Koristi WhatsApp broj kao userId (wa_ prefix razlikuje od Telegram usera)
  const userId = `wa_${from.replace('whatsapp:', '').replace('+', '')}`;

  console.log(`[whatsapp] Message from ${userId}: ${incomingMsg.substring(0, 50)}`);

  addMessage(userId, 'user', incomingMsg);
  const history = getHistory(userId, 10);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    const reply = response.content[0].text;
    addMessage(userId, 'assistant', reply);

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: WHATSAPP_FROM,
      to: from,
      body: reply,
    });

    console.log(`[whatsapp] Replied to ${userId}`);

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('[whatsapp] Error:', err.message);

    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: WHATSAPP_FROM,
        to: from,
        body: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
      });
    } catch {}

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, service: 'iris-whatsapp' }));

const PORT = process.env.WHATSAPP_PORT || 3001;

function startWhatsApp() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[whatsapp] ⚠ Twilio credentials not set — WhatsApp channel disabled');
    return;
  }

  app.listen(PORT, () => {
    console.log(`[whatsapp] ✅ WhatsApp webhook listening on port ${PORT}`);
    console.log(`[whatsapp] Webhook URL: https://YOUR_DOMAIN/whatsapp`);
  });
}

module.exports = { startWhatsApp };
