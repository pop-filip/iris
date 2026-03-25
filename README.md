# Ferdis Persönlicher Assistent

> Pilot projekt za **DN AI Assistant** — personalni AI asistent koji organizira termine, traži letove, rezervira hotele i automatizira svakodnevne zadatke.

Razvijeno od [Digital Nature](https://digitalnature.at) · 2026

---

## O projektu

**Ferdi** je pilot klijent. Ovaj projekat je osnova za skalabilan B2B produkt koji Digital Nature nudi putem [digitalnature.at](https://digitalnature.at).

Svaki klijent dobija:
- Embeddable web chat widget (jedan `<script>` tag na njihov website)
- WhatsApp notifikacije via Twilio
- Konfigurabilne module (calendar, flights, hotels, email...)
- Personalizirano ime i branding asistenta

---

## Arhitektura

```
Klijent website
  └── <script> embed → Web Chat Widget (brandabilno)
        ↓
  DN Backend (Node.js)
        ↓
  Claude API (Tool Use / Agents)
        ↓
  Tools: Google Calendar · Amadeus API · Booking.com · Playwright · Twilio
        ↓
  SQLite — conversation memory + client config
```

**Multi-tenant:** Svaki klijent = zasebna konfiguracija (moduli, API ključevi, branding). Jedan backend, N klijenata.

---

## Tech Stack

| Sloj | Tehnologija |
|---|---|
| AI model | Claude (Anthropic) — Tool Use / Agents |
| Backend | Node.js · Express |
| Chat interface | Web Widget (embeddable) · Telegram (opcija) |
| Notifikacije | WhatsApp via Twilio |
| Letovi | Amadeus API |
| Hoteli | Booking.com API |
| Kalendar | Google Calendar API |
| Web automation | Playwright |
| Baza | SQLite (conversation memory, client config) |
| Hosting | Hetzner VPS · Docker |

---

## Roadmap

### Phase 1 — Kalender & Erinnerungen ✅ (in progress)
- [ ] Telegram Bot (Ferdi pilot)
- [ ] Node.js backend + Claude Tool Use
- [ ] Google Calendar API
- [ ] Conversation memory (SQLite)
- [ ] Telegram Inline Keyboards

### Phase 2 — Flüge & Hotels
- [ ] Amadeus API (flight search)
- [ ] Booking.com API (hotels)
- [ ] Playwright automation
- [ ] E-mail drafts

### Phase 3 — Produkt & Multi-tenant
- [ ] Web Chat Widget (embeddable)
- [ ] Twilio WhatsApp notifikacije
- [ ] Multi-tenant client config
- [ ] Admin dashboard (Digital Nature)
- [ ] Vollautomatik + preferencijski profil

---

## Issues

Sve zadatke pratimo na [GitHub Issues](https://github.com/pop-filip/ferdis-asistent/issues).

Milestones:
- [Phase 1](https://github.com/pop-filip/ferdis-asistent/milestone/1)
- [Phase 2](https://github.com/pop-filip/ferdis-asistent/milestone/2)
- [Phase 3](https://github.com/pop-filip/ferdis-asistent/milestone/3)
