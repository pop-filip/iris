# Iris — AI Assistant by Digital Nature

> B2B AI asistent koji odgovara klijentima, hvata leadove, pretražuje letove i automatizira svakodnevne zadatke.

Razvijeno od [Digital Nature](https://digitalnature.at) · 2026
Landing: [digitalnature.at/iris.html](https://digitalnature.at/iris.html) · Widget: [digitalnature.at/widget/iris-widget.js](https://digitalnature.at/widget/iris-widget.js)

---

## Što Iris radi

### B2B (customer-facing)
- **Chat widget** — embeddable JS snippet, dark theme, mobile, brandabilno
- **Lead capture** — detekcija purchase/contact intenta via Claude → save u SQLite → Telegram notifikacija owneru
- **Knowledge base** — per-client `knowledge.md` (FAQ, radno vrijeme, kontakt) injektovan u Claude context
- **Product catalog** — `catalog.json` (naziv, cijena, opis, dostupnost) — Claude pretražuje prirodnim jezikom
- **Business hours** — van radnog vremena bot automatski obavještava i nudi da ostavi poruku
- **Multilingual** — automatski odgovara na jeziku korisnika (DE/EN/HR/...)

### Personal assistant (Telegram / WhatsApp)
- **Google Calendar** — čita termine, OAuth2 flow
- **Podsjetnici** — custom reminders, cron firing svake minute
- **Ponavljajući zadaci** — daily/weekly/monthly/yearly recurring tasks
- **Email drafts** — generiše profesionalne emailove via Claude Haiku, inline edit/regen flow
- **Flight search** — Amadeus API, natural language parsing, top 3 rezultata sa cijenama
- **Travel preferences** — per-user profil (airline, sjedište, hotel stars, dijeta)
- **WhatsApp** — Twilio webhook, dijeli SQLite memory sa Telegram kanalomN

### Owner komande (Telegram)
- `/leads` — lista zadnjih 20 leadova
- `/report` — summary leadova (7d / 30d / total)

---

## Arhitektura

```
Klijent website
  └── <script> embed → iris-widget.js
        ↓ POST /chat
  chat-server.js  (port 3012)
        ├── knowledge.js  → knowledge.md + catalog.json
        ├── leads.js      → detekcija intent + Telegram notif
        └── Claude Haiku  → odgovor

Telegram / WhatsApp
  └── bot.js / whatsapp.js
        ├── Google Calendar API
        ├── Amadeus flights API
        ├── Email draft generator
        └── Claude Haiku (conversation memory, SQLite)
```

**Multi-tenant:** Svaki klijent = zasebna Docker instanca + `.env` + `knowledge.md` + `catalog.json`

---

## Fajlovi

| Fajl | Opis |
|---|---|
| `bot.js` | Glavna Telegraf bot logika — sve komande i handlers |
| `chat-server.js` | Express REST API za web widget (POST /chat) |
| `whatsapp.js` | Twilio WhatsApp webhook handler |
| `db.js` | SQLite — messages, reminders, leads, prefs, recurring tasks |
| `leads.js` | Lead intent detekcija, capture, Telegram notifikacija |
| `knowledge.js` | Učitava `knowledge.md` + `catalog.json` za Claude context |
| `flights.js` | Amadeus API wrapper — searchFlights, formatFlights |
| `calendar.js` | Google Calendar OAuth2 + listUpcomingEvents |
| `reminders.js` | node-cron job — firing podsjetnika svake minute |
| `bot-instance.js` | Shared Telegraf singleton za cross-module pristup |
| `widget/iris-widget.js` | Embeddable vanilla JS chat widget |
| `knowledge.example.md` | Template za knowledge base (kopirati → `knowledge.md`) |
| `catalog.example.json` | Template za katalog (kopirati → `catalog.json`) |

---

## Setup — novi klijent

### 1. Klonirati i instalirati

```bash
git clone https://github.com/pop-filip/iris /var/www/[slug]
cd /var/www/[slug]
npm install --omit=dev
```

### 2. Konfigurirati

```bash
cp .env.example .env
nano .env          # popuniti varijable (vidi dolje)

cp knowledge.example.md knowledge.md
nano knowledge.md  # info o biznisu klijenta

cp catalog.example.json catalog.json
nano catalog.json  # proizvodi/usluge klijenta
```

### 3. Pokrenuti (Docker)

```bash
docker run -d \
  --name [slug] \
  --restart unless-stopped \
  -v /var/www/[slug]:/app \
  -w /app \
  -p [PORT]:3000 \
  -p [WHATSAPP_PORT]:3011 \
  -p [WIDGET_PORT]:3012 \
  --env-file /var/www/[slug]/.env \
  node:20 \
  node bot.js
```

### 4. Embed widget na klijentov website

```html
<script
  src="https://digitalnature.at/widget/iris-widget.js"
  data-server="https://YOUR_DOMAIN/iris-api"
  data-client-id="[slug]"
  data-name="Iris"
  data-color="#84CC16"
></script>
```

Widget parametri:

| Atribut | Opis | Default |
|---|---|---|
| `data-server` | URL chat-server.js API | `http://localhost:3012` |
| `data-client-id` | Jedinstveni slug klijenta | `default` |
| `data-name` | Ime bota (prikazuje se korisniku) | `Iris` |
| `data-color` | Brand boja (HEX) | `#84CC16` |
| `data-position` | `right` ili `left` | `right` |

---

## .env varijable

```bash
# Telegram
TELEGRAM_BOT_TOKEN=           # od BotFather

# Anthropic
ANTHROPIC_API_KEY=             # console.anthropic.com

# Google Calendar (opcionalno)
GOOGLE_CALENDAR_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Amadeus — pretraga letova (opcionalno)
AMADEUS_API_KEY=               # developers.amadeus.com
AMADEUS_API_SECRET=

# Twilio — WhatsApp (opcionalno)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_PORT=3011

# Chat Widget B2B
WIDGET_PORT=3012
CLIENT_ID=default              # slug klijenta, npr. "autohaus-wien"
CLIENT_NAME=Iris               # ime bota
BUSINESS_NAME=                 # naziv kompanije
BUSINESS_HOURS=Mo-Fr 08:00-18:00  # radno vrijeme (opcionalno)
OWNER_TELEGRAM_ID=             # tvoj Telegram ID → prima lead notifikacije

# IRIS_SYSTEM_PROMPT=          # opcionalno: potpuno custom system prompt
```

---

## Produkcija (Hetzner VPS 157.180.67.68)

| Container | Port | Status |
|---|---|---|
| `iris` | 3011 (WhatsApp), 3012 (Widget API) | ✅ running |

Widget JS dostupan na:
`https://digitalnature.at/widget/iris-widget.js`

Provjera statusa:
```bash
ssh root@157.180.67.68 "docker ps | grep iris"
ssh root@157.180.67.68 "docker logs iris --tail 30"
```

Redeploy:
```bash
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='iris.db' \
  ~/iris/ root@157.180.67.68:/var/www/iris/ && \
ssh root@157.180.67.68 "docker restart iris"
```

---

## Tech Stack

| Sloj | Tehnologija |
|---|---|
| AI model | Claude Haiku 4.5 (Anthropic) |
| Backend | Node.js 20 · Express 5 |
| Telegram | Telegraf 4 |
| WhatsApp | Twilio |
| Letovi | Amadeus API |
| Kalendar | Google Calendar API (OAuth2) |
| Baza | SQLite (`better-sqlite3`) |
| Cron | `node-cron` |
| Hosting | Hetzner VPS · Docker |

---

## Roadmap

### Implementirano
- [x] Telegram bot — sve komande, conversation memory
- [x] WhatsApp kanal (Twilio webhook)
- [x] Web chat widget (embeddable JS)
- [x] Chat REST API (chat-server.js)
- [x] Lead capture + Telegram notifikacije
- [x] Knowledge base + product catalog (per-client)
- [x] Business hours detection
- [x] Google Calendar (čitanje termina)
- [x] Podsjetnici + recurring tasks (cron)
- [x] Email draft generator (Claude Haiku)
- [x] Flight search (Amadeus API)
- [x] User preference profil (airline, hotel, diet)
- [x] `/leads` i `/report` komande za ownera

### U planu
- [ ] Hotel search (Booking.com API) — issue #7
- [ ] Playwright web automation — issue #9
- [ ] Full travel itinerary (flights + hotels + transfers) — issue #11
- [ ] Calendar write (kreiranje/editovanje termina)
- [ ] Traefik route za widget API (https://digitalnature.at/iris-api/)
- [ ] Admin dashboard — pregled svih klijenata

---

## Issues

[github.com/pop-filip/iris/issues](https://github.com/pop-filip/iris/issues)
