require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { searchFlights, formatFlights } = require('./flights');
const { startWhatsApp } = require('./whatsapp');
const {
  getHistory, addMessage,
  getUserReminders,
  getPrefs, setPrefs,
  addRecurring, getUserRecurring, deleteRecurring,
} = require('./db');
const { getAuthUrl, exchangeCode, listUpcomingEvents } = require('./calendar');
const { startReminderCron } = require('./reminders');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ti si Iris, AI asistent kompanije Digital Nature.
Pomaži korisniku sa kalendarom, podsjetnicima i općim upitima.
Budi ljubazan, profesionalan i koncizan. Odgovaraj na jeziku kojim ti korisnik piše.`;

// Čuva privremeno stanje multi-step tokova
const pendingInput = new Map();

// --- /start ---
bot.start((ctx) => {
  ctx.reply(
    'Hallo! Ich bin Iris, dein KI-Assistent von Digital Nature. 👋\n\n' +
    'Verfügbare Befehle:\n' +
    '/auth — Google Calendar verbinden\n' +
    '/events — Nächste Termine anzeigen\n' +
    '/reminders — Meine Erinnerungen\n' +
    '/prefs — Meine Präferenzen\n' +
    '/recurring — Wiederkehrende Aufgaben\n' +
    '/email — E-Mail-Entwurf erstellen\n' +
    '/flug — Flüge suchen (Amadeus)\n\n' +
    'Oder schreib mir einfach eine Nachricht!'
  );
});

// --- /auth ---
bot.command('auth', (ctx) => {
  const url = getAuthUrl();
  ctx.reply('🔗 Klicke auf den Link, melde dich an und sende mir den Code:\n\n' + url);
});

// --- /code ---
bot.command('code', async (ctx) => {
  const code = ctx.message.text.split(' ')[1];
  if (!code) return ctx.reply('Verwendung: /code DEIN_CODE');
  try {
    await exchangeCode(String(ctx.from.id), code);
    ctx.reply('✅ Google Calendar erfolgreich verbunden!');
  } catch (err) {
    console.error('OAuth error:', err.message);
    ctx.reply('❌ Fehler beim Verbinden. Bitte versuche /auth erneut.');
  }
});

// --- /events ---
bot.command('events', async (ctx) => {
  try {
    const events = await listUpcomingEvents(String(ctx.from.id));
    if (!events.length) return ctx.reply('📅 Keine bevorstehenden Termine.');
    const lines = events.map((e) => {
      const when = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })
        : e.start.date;
      return `• *${e.summary}*\n  📆 ${when}`;
    });
    ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
  } catch (err) {
    if (err.message === 'NO_AUTH') return ctx.reply('❌ Kein Google-Konto verbunden. Bitte /auth verwenden.');
    ctx.reply('❌ Fehler beim Laden der Termine.');
  }
});

// --- /reminders ---
bot.command('reminders', (ctx) => {
  const list = getUserReminders(String(ctx.from.id));
  if (!list.length) return ctx.reply('📭 Keine aktiven Erinnerungen.');
  const lines = list.map((r) => {
    const when = new Date(r.remind_at).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
    return `• *${r.title}*\n  ⏰ ${when}`;
  });
  ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
});

// --- /prefs — Preferencijski profil (#10) ---
bot.command('prefs', (ctx) => {
  const p = getPrefs(String(ctx.from.id));
  const text =
    `⚙️ *Meine Präferenzen*\n\n` +
    `✈️ Airline: ${p.airline || '—'}\n` +
    `💺 Sitzplatz: ${p.seat || '—'}\n` +
    `🏨 Hotelkategorie: ${p.hotel_stars ? p.hotel_stars + ' ⭐' : '—'}\n` +
    `🍽️ Ernährung: ${p.diet || '—'}`;

  ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✈️ Airline', 'pref_airline'), Markup.button.callback('💺 Sitzplatz', 'pref_seat')],
      [Markup.button.callback('🏨 Hotel ⭐', 'pref_hotel'), Markup.button.callback('🍽️ Ernährung', 'pref_diet')],
    ]),
  });
});

function askPref(ctx, field, question) {
  pendingInput.set(String(ctx.from.id), { type: 'pref', field });
  ctx.answerCbQuery();
  ctx.reply(question);
}

bot.action('pref_airline', (ctx) => askPref(ctx, 'airline', '✈️ Welche Airline bevorzugst du? (z.B. Austrian, Lufthansa)'));
bot.action('pref_seat',    (ctx) => askPref(ctx, 'seat',    '💺 Welchen Sitzplatz bevorzugst du? (Fenster / Gang / Mitte)'));
bot.action('pref_hotel',   (ctx) => askPref(ctx, 'hotel_stars', '🏨 Wie viele Sterne soll das Hotel haben? (1–5)'));
bot.action('pref_diet',    (ctx) => askPref(ctx, 'diet',    '🍽️ Hast du Ernährungsvorlieben? (z.B. vegetarisch, vegan, keine)'));

// --- /recurring — Ponavljajući zadaci (#12) ---
bot.command('recurring', (ctx) => {
  const list = getUserRecurring(String(ctx.from.id));

  const keyboard = [
    [Markup.button.callback('➕ Dodaj zadatak', 'recurring_add')],
  ];

  if (list.length) {
    list.forEach((t) => {
      keyboard.push([Markup.button.callback(`🗑️ ${t.title}`, `recurring_del_${t.id}`)]);
    });
  }

  const text = list.length
    ? `🔁 *Ponavljajući zadaci:*\n\n` + list.map((t) => {
        const next = new Date(t.next_fire).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' });
        return `• *${t.title}* (${t.interval_type})\n  Sljedeći: ${next}`;
      }).join('\n\n')
    : '📭 Nema ponavljajućih zadataka.';

  ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) });
});

bot.action('recurring_add', (ctx) => {
  pendingInput.set(String(ctx.from.id), { type: 'recurring_title' });
  ctx.answerCbQuery();
  ctx.reply('📝 Naziv zadatka? (npr. "Tjedni sastanak")');
});

bot.action(/recurring_del_(\d+)/, (ctx) => {
  const id = parseInt(ctx.match[1]);
  deleteRecurring(id, String(ctx.from.id));
  ctx.answerCbQuery('Obrisano ✓');
  ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  ctx.reply('✅ Zadatak obrisan.');
});

// --- Inline keyboard za interval ---
function showIntervalKeyboard(ctx) {
  ctx.reply('🔁 Koliko često?', Markup.inlineKeyboard([
    [Markup.button.callback('Svaki dan', 'ri_daily'),  Markup.button.callback('Svake nedjelje', 'ri_weekly')],
    [Markup.button.callback('Svaki mjesec', 'ri_monthly'), Markup.button.callback('Svake godine', 'ri_yearly')],
  ]));
}

['daily', 'weekly', 'monthly', 'yearly'].forEach((interval) => {
  bot.action(`ri_${interval}`, (ctx) => {
    const userId = String(ctx.from.id);
    const state = pendingInput.get(userId);
    if (!state || state.type !== 'recurring_interval') return ctx.answerCbQuery();

    const nextFire = new Date();
    if (interval === 'daily')   nextFire.setDate(nextFire.getDate() + 1);
    if (interval === 'weekly')  nextFire.setDate(nextFire.getDate() + 7);
    if (interval === 'monthly') nextFire.setMonth(nextFire.getMonth() + 1);
    if (interval === 'yearly')  nextFire.setFullYear(nextFire.getFullYear() + 1);

    addRecurring(userId, state.title, interval, 60, nextFire.toISOString());
    pendingInput.delete(userId);
    ctx.answerCbQuery();
    ctx.reply(`✅ Zadatak *${state.title}* dodan (${interval}).`, { parse_mode: 'Markdown' });
  });
});

// --- Poruke — Claude + pending input handler ---
bot.on('text', async (ctx) => {
  const userId = String(ctx.from.id);
  const text = ctx.message.text;

  if (text.startsWith('/')) return;

  // Multi-step flow handler
  const state = pendingInput.get(userId);
  if (state) {
    if (state.type === 'pref') {
      const value = state.field === 'hotel_stars' ? parseInt(text) || null : text;
      setPrefs(userId, { [state.field]: value });
      pendingInput.delete(userId);
      return ctx.reply('✅ Gespeichert!', Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Zurück zu Präferenzen', 'back_prefs')],
      ]));
    }

    if (state.type === 'recurring_title') {
      pendingInput.set(userId, { type: 'recurring_interval', title: text });
      return showIntervalKeyboard(ctx);
    }

    if (state.type === 'email_edit_instruction') {
      await ctx.sendChatAction('typing');
      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: `Du bist ein professioneller E-Mail-Assistent. Modifiziere den E-Mail-Entwurf basierend auf der Anweisung. Gib den vollständigen modifizierten Entwurf zurück (BETREFF: ... --- [Text]).`,
          messages: [{ role: 'user', content: `Originaler Entwurf:\n${state.draft}\n\nÄnderung: ${text}` }],
        });
        const newDraft = response.content[0].text;
        pendingInput.set(userId, { type: 'email_draft', draft: newDraft, input: state.input });
        await ctx.reply(
          `📧 *Überarbeiteter Draft*\n\n\`\`\`\n${newDraft}\n\`\`\``,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📋 Kopieren', 'email_copy'), Markup.button.callback('🔄 Neu generieren', 'email_regen')],
              [Markup.button.callback('✏️ Ändern', 'email_edit')],
            ]),
          }
        );
      } catch (err) {
        ctx.reply('❌ Fehler. Bitte versuche es erneut.');
      }
      pendingInput.delete(userId);
      return;
    }
  }

  // Normalni Claude chat
  await ctx.sendChatAction('typing');
  addMessage(userId, 'user', text);
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
    await ctx.reply(reply);
  } catch (err) {
    console.error('Claude greška:', err.message);
    await ctx.reply('Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.');
  }
});

bot.action('back_prefs', (ctx) => {
  ctx.answerCbQuery();
  const p = getPrefs(String(ctx.from.id));
  const text =
    `⚙️ *Meine Präferenzen*\n\n` +
    `✈️ Airline: ${p.airline || '—'}\n` +
    `💺 Sitzplatz: ${p.seat || '—'}\n` +
    `🏨 Hotelkategorie: ${p.hotel_stars ? p.hotel_stars + ' ⭐' : '—'}\n` +
    `🍽️ Ernährung: ${p.diet || '—'}`;
  ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✈️ Airline', 'pref_airline'), Markup.button.callback('💺 Sitzplatz', 'pref_seat')],
      [Markup.button.callback('🏨 Hotel ⭐', 'pref_hotel'), Markup.button.callback('🍽️ Ernährung', 'pref_diet')],
    ]),
  });
});

// --- /email — Email draft generator (#8) ---
bot.command('email', async (ctx) => {
  const userId = String(ctx.from.id);
  const input = ctx.message.text.replace('/email', '').trim();

  if (!input) {
    return ctx.reply(
      '📧 *Email Draft Generator*\n\n' +
      'Beschreibe den E-Mail-Inhalt, z.B.:\n' +
      '`/email Angebot an Thomas für Webdesign-Projekt, auf Deutsch`',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.sendChatAction('typing');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Du bist ein professioneller E-Mail-Assistent. Erstelle professionelle, höfliche und präzise E-Mails für Geschäftskorrespondenz.
Gib IMMER das folgende Format zurück:
BETREFF: [Betreff hier]
---
[E-Mail-Text hier]`,
      messages: [{ role: 'user', content: `Erstelle eine professionelle E-Mail für folgendes: ${input}` }],
    });

    const draft = response.content[0].text;
    const lines = draft.split('\n');
    const subjectLine = lines.find(l => /^(BETREFF|Subject|Betreff):/i.test(l));
    const subject = subjectLine ? subjectLine.replace(/^(BETREFF|Subject|Betreff):\s*/i, '').trim() : '(Kein Betreff)';

    pendingInput.set(userId, { type: 'email_draft', draft, input });

    await ctx.reply(
      `📧 *Email Draft*\n\n*Betreff:* ${subject}\n\n\`\`\`\n${draft}\n\`\`\``,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 Kopieren', 'email_copy'), Markup.button.callback('🔄 Neu generieren', 'email_regen')],
          [Markup.button.callback('✏️ Ändern', 'email_edit')],
        ]),
      }
    );
  } catch (err) {
    console.error('Email draft error:', err.message);
    ctx.reply('❌ Fehler beim Erstellen des Entwurfs. Bitte versuche es erneut.');
  }
});

bot.action('email_copy', (ctx) => {
  const userId = String(ctx.from.id);
  const state = pendingInput.get(userId);
  ctx.answerCbQuery('📋 Hier zum Kopieren!');
  if (state?.draft) {
    ctx.reply(`📋 *Draft zum Kopieren:*\n\n${state.draft}`, { parse_mode: 'Markdown' });
  }
});

bot.action('email_regen', async (ctx) => {
  const userId = String(ctx.from.id);
  const state = pendingInput.get(userId);
  if (!state?.input) return ctx.answerCbQuery('Keine Daten gefunden.');

  ctx.answerCbQuery('🔄 Generiere neu...');
  await ctx.sendChatAction('typing');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Du bist ein professioneller E-Mail-Assistent. Erstelle professionelle E-Mails.
Gib IMMER das folgende Format zurück:
BETREFF: [Betreff hier]
---
[E-Mail-Text hier]`,
      messages: [{ role: 'user', content: `Erstelle eine andere Version der E-Mail für: ${state.input}. Verwende einen anderen Stil oder andere Formulierungen.` }],
    });

    const draft = response.content[0].text;
    pendingInput.set(userId, { type: 'email_draft', draft, input: state.input });

    await ctx.reply(
      `📧 *Neuer Email Draft*\n\n\`\`\`\n${draft}\n\`\`\``,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📋 Kopieren', 'email_copy'), Markup.button.callback('🔄 Neu generieren', 'email_regen')],
          [Markup.button.callback('✏️ Ändern', 'email_edit')],
        ]),
      }
    );
  } catch (err) {
    ctx.reply('❌ Fehler. Bitte versuche es erneut.');
  }
});

bot.action('email_edit', (ctx) => {
  const userId = String(ctx.from.id);
  const state = pendingInput.get(userId);
  if (!state?.draft) return ctx.answerCbQuery();

  pendingInput.set(userId, { type: 'email_edit_instruction', draft: state.draft, input: state.input });
  ctx.answerCbQuery();
  ctx.reply('✏️ Was soll geändert werden? (z.B. "Füge eine Referenz auf unser letztes Meeting hinzu")');
});

// --- /flug — Pretraga letova via Amadeus (#14) ---
bot.command('flug', async (ctx) => {
  const userId = String(ctx.from.id);
  const input = ctx.message.text.replace('/flug', '').trim();

  if (!input) {
    return ctx.reply(
      '✈️ *Flugsuche*\n\n' +
      'Format: `/flug VIE LHR 2026-05-15`\n' +
      'oder: `/flug Wien London morgen 2 Personen`\n\n' +
      '_IATA-Codes oder Städtenamen werden akzeptiert._',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.sendChatAction('typing');

  try {
    // Parsuj input via Claude
    const parseResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Extract flight search parameters from the text. Return ONLY valid JSON: {"origin":"IATA","destination":"IATA","date":"YYYY-MM-DD","adults":1}. Use IATA airport codes (3 letters). If city names are given, convert to nearest major airport. If date is relative (e.g. "morgen"), calculate from today ' + new Date().toISOString().split('T')[0] + '. If adults not specified, use 1.',
      messages: [{ role: 'user', content: input }],
    });

    let params;
    try {
      const jsonText = parseResponse.content[0].text.trim().replace(/```json\n?|\n?```/g, '');
      params = JSON.parse(jsonText);
    } catch {
      return ctx.reply('❌ Konnte die Suchanfrage nicht verstehen.\nBeispiel: `/flug VIE LHR 2026-05-15`', { parse_mode: 'Markdown' });
    }

    const { origin, destination, date, adults } = params;
    if (!origin || !destination || !date) {
      return ctx.reply('❌ Bitte gib Abflugort, Ziel und Datum an.\nBeispiel: `/flug VIE LHR 2026-05-15`', { parse_mode: 'Markdown' });
    }

    const flights = await searchFlights(origin, destination, date, adults || 1);
    const message = formatFlights(flights, origin, destination, date);

    pendingInput.set(userId, { type: 'flight_results', flights, params });

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Neu suchen', 'flight_new'), Markup.button.callback('📧 Als E-Mail', 'flight_email')],
      ]),
    });
  } catch (err) {
    console.error('Flight search error:', err.message);
    if (err.message === 'AMADEUS_NOT_CONFIGURED') {
      return ctx.reply('⚠️ Amadeus API ist nicht konfiguriert. Bitte AMADEUS_API_KEY und AMADEUS_API_SECRET in .env setzen.');
    }
    if (err.message === 'AMADEUS_AUTH_ERROR') {
      return ctx.reply('❌ Amadeus API Authentifizierungsfehler. Bitte API-Key überprüfen.');
    }
    ctx.reply('❌ Fehler bei der Flugsuche. Bitte versuche es erneut.');
  }
});

bot.action('flight_new', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('✈️ Neue Suche: `/flug VIE LHR 2026-05-20`', { parse_mode: 'Markdown' });
});

bot.action('flight_email', async (ctx) => {
  const userId = String(ctx.from.id);
  const state = pendingInput.get(userId);
  if (!state?.flights) return ctx.answerCbQuery('Keine Ergebnisse.');

  ctx.answerCbQuery('📧 Erstelle E-Mail...');
  await ctx.sendChatAction('typing');

  const flightSummary = formatFlights(state.flights, state.params.origin, state.params.destination, state.params.date);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'Erstelle eine professionelle E-Mail mit Fluginformationen. Format: BETREFF: [...] --- [E-Mail-Text]',
      messages: [{ role: 'user', content: `Erstelle eine E-Mail mit diesen Fluginformationen:\n${flightSummary}` }],
    });
    const draft = response.content[0].text;
    pendingInput.set(userId, { type: 'email_draft', draft, input: flightSummary });
    await ctx.reply(`📧 *Email Draft:*\n\n\`\`\`\n${draft}\n\`\`\``, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Kopieren', 'email_copy')],
      ]),
    });
  } catch {
    ctx.reply('❌ Fehler beim Erstellen des Entwurfs.');
  }
});

// --- Start ---
startReminderCron(bot);
startWhatsApp();

bot.launch()
  .then(() => console.log('✅ Iris bot je pokrenut!'))
  .catch((err) => console.error('❌ Greška pri pokretanju:', err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
