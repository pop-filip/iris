const Anthropic = require('@anthropic-ai/sdk');
const { addLead, markLeadNotified } = require('./db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Detect if a message contains a lead intent (contact request, price inquiry, booking, etc.)
 * Returns { isLead: bool, confidence: 'high'|'medium'|'low' }
 */
async function detectLeadIntent(message) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: 'You detect if a message shows purchase intent or contact intent (wants a quote, wants to book, wants to be contacted, asks for price, says they are interested in buying/ordering). Return ONLY valid JSON: {"isLead": true/false, "confidence": "high"/"medium"/"low"}',
      messages: [{ role: 'user', content: message }],
    });
    const json = JSON.parse(response.content[0].text.trim().replace(/```json\n?|\n?```/g, ''));
    return json;
  } catch {
    return { isLead: false, confidence: 'low' };
  }
}

/**
 * Extract contact info from a message using Claude
 * Returns { name, email, phone } — any can be null
 */
async function extractContactInfo(message) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: 'Extract contact information from the message. Return ONLY valid JSON: {"name": null, "email": null, "phone": null}. Use null for fields not found.',
      messages: [{ role: 'user', content: message }],
    });
    return JSON.parse(response.content[0].text.trim().replace(/```json\n?|\n?```/g, ''));
  } catch {
    return { name: null, email: null, phone: null };
  }
}

/**
 * Save a lead and notify the owner via Telegram bot
 * @param {object} bot - Telegraf bot instance
 * @param {string} clientId - which client instance
 * @param {string} source - 'widget' | 'telegram' | 'whatsapp'
 * @param {string} message - the lead message
 * @param {object} contactInfo - { name, email, phone } (optional, will extract if not provided)
 */
async function captureLead(bot, clientId, source, message, contactInfo = null) {
  const info = contactInfo || await extractContactInfo(message);
  const { name, email, phone } = info;

  const leadId = addLead(clientId, source, name, email, phone, message);

  // Notify owner via Telegram if OWNER_TELEGRAM_ID is set
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  if (ownerId && bot) {
    const lines = [
      `🔔 *Neuer Lead* — #${leadId}`,
      `📡 Kanal: ${source}`,
      name  ? `👤 Name: ${name}`    : null,
      email ? `📧 Email: ${email}`  : null,
      phone ? `📞 Tel: ${phone}`    : null,
      `💬 Nachricht:\n_${message.substring(0, 300)}_`,
    ].filter(Boolean).join('\n');

    try {
      await bot.telegram.sendMessage(ownerId, lines, { parse_mode: 'Markdown' });
      markLeadNotified(leadId);
      console.log(`[leads] Lead #${leadId} notified to owner ${ownerId}`);
    } catch (err) {
      console.error(`[leads] Failed to notify owner:`, err.message);
    }
  }

  return leadId;
}

module.exports = { detectLeadIntent, extractContactInfo, captureLead };
