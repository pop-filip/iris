const { google } = require('googleapis');
const { saveTokens, getTokens } = require('./db');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  );
}

function getAuthUrl() {
  const auth = createOAuth2Client();
  return auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function exchangeCode(userId, code) {
  const auth = createOAuth2Client();
  const { tokens } = await auth.getToken(code);
  saveTokens(userId, tokens);
  return tokens;
}

async function getCalendar(userId) {
  const tokens = getTokens(userId);
  if (!tokens) throw new Error('NO_AUTH');

  const auth = createOAuth2Client();
  auth.setCredentials(tokens);

  // Auto-refresh token
  auth.on('tokens', (newTokens) => {
    const updated = { ...tokens, ...newTokens };
    saveTokens(userId, updated);
  });

  return google.calendar({ version: 'v3', auth });
}

async function listUpcomingEvents(userId, maxResults = 5) {
  const calendar = await getCalendar(userId);
  const res = await calendar.events.list({
    calendarId: process.env.CALENDAR_ID || 'primary',
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

async function createEvent(userId, { title, start, end, description = '' }) {
  const calendar = await getCalendar(userId);
  const res = await calendar.events.insert({
    calendarId: process.env.CALENDAR_ID || 'primary',
    requestBody: {
      summary: title,
      description,
      start: { dateTime: new Date(start).toISOString(), timeZone: 'Europe/Vienna' },
      end: { dateTime: new Date(end).toISOString(), timeZone: 'Europe/Vienna' },
    },
  });
  return res.data;
}

async function deleteEvent(userId, eventId) {
  const calendar = await getCalendar(userId);
  await calendar.events.delete({
    calendarId: process.env.CALENDAR_ID || 'primary',
    eventId,
  });
}

module.exports = { getAuthUrl, exchangeCode, listUpcomingEvents, createEvent, deleteEvent };
