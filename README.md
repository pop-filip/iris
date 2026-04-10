# Iris — AI Assistant by Digital Nature

> B2B AI asistent koji odgovara klijentima, hvata leadove, pretražuje letove i automatizira svakodnevne zadatke.

Razvijeno od [Digital Nature](https://digitalnature.at) · 2026
Landing: [digitalnature.at/iris.html](https://digitalnature.at/iris.html)
Widget (live): [digitalnature.at/widget/iris-widget.js](https://digitalnature.at/widget/iris-widget.js)
Widget (dev): [digitalnature.at/widget/iris-widget-dev.js](https://digitalnature.at/widget/iris-widget-dev.js)

---

## Što Iris radi

### B2B (customer-facing chat widget)
- **Chat widget** — embeddable JS snippet, dark theme, mobile-responsive, brandabilno po boji/poziciji/imenu
- **Lead capture** — detekcija purchase/contact intenta via Claude → save u SQLite → Telegram notifikacija owneru
- **Knowledge base** — per-client `knowledge.md` (FAQ, radno vrijeme, kontakt, usluge, cijene) injektovan u Claude context
- **Product catalog** — `catalog.json` (naziv, cijena, opis, dostupnost) — Claude pretražuje prirodnim jezikom
- **Business hours** — van radnog vremena bot automatski obavještava korisnika
- **Multilingual** — automatski odgovara na jeziku korisnika (DE/EN/HR/BS/...)
- **Quick replies** — konfigurabilan set dugmića za brze odgovore (`data-quick-replies`)
- **Custom greeting** — konfigurabilan pozdrav pri prvom otvaranju (`data-greeting`)
- **Animirani UI** — pulse animacija na dugmetu, slide-up otvaranje panela, avatar s inicijalima u headeru

### Personal assistant (Telegram / WhatsApp)
- **Google Calendar** — čita termine, OAuth2 flow
- **Podsjetnici** — custom reminders, cron firing svake minute
- **Ponavljajući zadaci** — daily/weekly/monthly/yearly recurring tasks
- **Email drafts** — generiše profesionalne emailove via Claude Haiku, inline edit/regen flow
- **Flight search** — Amadeus API, natural language parsing, top 3 rezultata sa cijenama
- **Travel preferences** — per-user profil (airline, sjedište, hotel stars, dijeta)
- **WhatsApp** — Twilio webhook, dijeli SQLite memory sa Telegram kanalom

### Owner komande (Telegram)
- `/leads` — lista zadnjih 20 leadova sa izvorom i porukom
- `/report` — summary leadova (7d / 30d / total)

---

## Arhitektura

```
Klijent website
  └── <script> embed → iris-widget.js (ili iris-widget-dev.js za staging)
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
| `chat-server.js` | Express REST API za web widget (POST /chat, GET /health) |
| `whatsapp.js` | Twilio WhatsApp webhook handler |
| `db.js` | SQLite — messages, reminders, leads, prefs, recurring tasks |
| `leads.js` | Lead intent detekcija, capture, Telegram notifikacija |
| `knowledge.js` | Učitava `knowledge.md` + `catalog.json` za Claude context |
| `flights.js` | Amadeus API wrapper — searchFlights, formatFlights |
| `calendar.js` | Google Calendar OAuth2 + listUpcomingEvents |
| `reminders.js` | node-cron job — firing podsjetnika svake minute |
| `bot-instance.js` | Shared Telegraf singleton za cross-module pristup |
| `widget/iris-widget.js` | Embeddable vanilla JS chat widget (LIVE) |
| `widget/iris-widget-dev.js` | Dev/staging kopija widgeta za testiranje |
| `knowledge.example.md` | Template za knowledge base |
| `catalog.example.json` | Template za katalog |
| `test/mato-preview.html` | Lokalni dev preview za matografie widget |
| `test/demo.html` | Demo sa AutoTeilePro sadržajem |

---

## Widget — embed

```html
<script
  src="https://digitalnature.at/widget/iris-widget.js"
  data-server="https://YOUR_DOMAIN/iris-api"
  data-client-id="slug"
  data-name="Iris"
  data-color="#84CC16"
  data-position="right"
  data-greeting="Hallo! Wie kann ich helfen? 👋"
  data-quick-replies="Frage 1|Frage 2|Frage 3"
></script>
```

### Widget atributi

| Atribut | Opis | Default |
|---|---|---|
| `data-server` | URL chat-server.js API | `http://localhost:3012` |
| `data-client-id` | Jedinstveni slug klijenta | `default` |
| `data-name` | Ime bota | `Iris` |
| `data-color` | Brand boja (HEX) | `#84CC16` |
| `data-position` | `right` ili `left` | `right` |
| `data-greeting` | Prva poruka bota pri otvaranju | Auto (DE) |
| `data-quick-replies` | Brzi odgovori odvojeni `\|` | prazno |

### Dev workflow

Za testiranje promjena bez utjecaja na live:

1. Uredi `widget/iris-widget-dev.js`
2. Otvori `test/mato-preview.html` u browseru
3. Kad zadovoljan → kopiraj u `widget/iris-widget.js` i pushaj

---

## Live klijenti

| Klijent | Domain | Container | Widget port | API path |
|---|---|---|---|---|
| iris (demo) | digitalnature.at | `iris` | 3012 | `/iris-api` |
| matografie | matografie.at | `matografie` | 3013 | `/iris-api` |

### Server (Hetzner VPS 157.180.67.68)

```bash
# Status
ssh root@157.180.67.68 "docker ps | grep -E 'iris|matografie'"

# Logs
ssh root@157.180.67.68 "docker logs iris --tail 30"
ssh root@157.180.67.68 "docker logs matografie --tail 30"

# Test API
curl -s https://matografie.at/iris-api/health
```

### Redeploy

```bash
# Lokalno
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='*.db' \
  ~/iris/ root@157.180.67.68:/var/www/iris/
ssh root@157.180.67.68 "docker restart iris"

# Ili: git push → GitHub Actions deployjа automatski (za mato-website i digital-nature-website)
```

### Novi klijent — setup

```bash
# Na serveru
cp -r /var/www/iris /var/www/[slug]
cp /var/www/[slug]/.env.example /var/www/[slug]/.env
nano /var/www/[slug]/.env          # popuni varijable
nano /var/www/[slug]/knowledge.md  # info o biznisu
nano /var/www/[slug]/catalog.json  # proizvodi/usluge

docker run -d \
  --name [slug] \
  --restart unless-stopped \
  --env-file /var/www/[slug]/.env \
  -v /var/www/[slug]:/app \
  -p [WIDGET_PORT]:[WIDGET_PORT] \
  --network web \
  -w /app \
  node:20 node chat-server.js
```

---

## .env varijable

```bash
# Telegram
TELEGRAM_BOT_TOKEN=           # od BotFather

# Anthropic (obavezno)
ANTHROPIC_API_KEY=             # console.anthropic.com → API Keys

# Google Calendar (opcionalno)
GOOGLE_CALENDAR_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Amadeus — letovi (opcionalno)
AMADEUS_API_KEY=
AMADEUS_API_SECRET=

# Twilio — WhatsApp (opcionalno)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_PORT=3011

# Chat Widget
WIDGET_PORT=3012
CLIENT_ID=default
CLIENT_NAME=Iris
BUSINESS_NAME=
BUSINESS_HOURS=Mo-Fr 08:00-18:00
OWNER_TELEGRAM_ID=
# IRIS_SYSTEM_PROMPT=          # opcionalno: custom system prompt
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
| Rate limiting | `express-rate-limit` (20 req/min) |
| Hosting | Hetzner VPS · Docker |
| Reverse proxy | Traefik (PathPrefix routing) |

---

## Roadmap

### Implementirano ✅
- Telegram bot — komande, conversation memory
- WhatsApp kanal (Twilio webhook)
- Web chat widget — embeddable, brandabilno, animirano
- Chat REST API sa rate limitingom i CORS
- Lead capture + Telegram notifikacije
- Knowledge base + product catalog (per-client)
- Business hours detection
- Google Calendar (čitanje termina)
- Podsjetnici + recurring tasks (cron)
- Email draft generator
- Flight search (Amadeus API)
- User preference profil
- `/leads` i `/report` komande
- Markdown render u widgetu
- Quick replies / brzi odgovori
- Custom greeting po klijentu
- Pulse animacija, slide-up panel, avatar header
- Staging widget (iris-widget-dev.js)
- Mato (matografie.at) — live klijent, multilingual (DE/EN/Ex-Yu)

### U planu
- [ ] Hotel search — issue #7
- [ ] Playwright web automation — issue #9
- [ ] Portfolio linkovi u knowledge base (per-client)
- [ ] Admin dashboard — pregled svih klijenata
- [ ] Light theme za widget (`data-theme="light"`)
- [ ] Calendar write (kreiranje termina)

---

## Issues

[github.com/pop-filip/iris/issues](https://github.com/pop-filip/iris/issues)
