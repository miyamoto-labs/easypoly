# EasyPoly Bot — Deploy Guide

## Railway Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `STRIPE_SECRET_KEY` | `sk_live_51SyXYx...` (from Miyamoto Labs Stripe account) |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting user API credentials (see below) |

### Generate ENCRYPTION_KEY
```bash
# Generate a random 32-byte hex key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
⚠️ **Store this securely.** If lost, all user Polymarket credentials become unreadable and users must /connect again.

### Optional
| Variable | Default | Description |
|----------|---------|-------------|
| `API_SECRET` | `easypoly-2026` | Auth key for `/broadcast` endpoint |
| `TRADER_URL` | `https://trader-production-a096.up.railway.app` | Polymarket trader service |
| `TRADER_KEY` | `pm-trader-erik-2026` | Trader API key |
| `PORT` | `3000` | HTTP port |
| `STRIPE_WEBHOOK_SECRET` | _(none)_ | Stripe webhook signing secret (recommended for production) |
| `STRIPE_PRICE_ID` | _(auto-created)_ | Skip auto-creation by providing existing price ID |
| `DB_FILE` | `/data/easypoly.db` | SQLite database path |

## Railway Setup

1. **Persistent Volume:** Mount a volume at `/data` (stores SQLite DB + legacy JSON)
2. **Deploy:** Push code, Railway auto-builds
3. **Stripe Webhook:**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://<your-railway-url>/webhook/stripe`
   - Events to listen for: `checkout.session.completed`, `customer.subscription.deleted`
   - Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` env var
4. **Stripe Product:** Auto-created on first boot ("EasyPoly Pro" $9/mo)

## How It Works

- **Free tier:** First 5 picks free for all users
- **Paywall:** After 5 picks, users see upgrade prompt instead of picks
- **Pro:** $9/mo via Stripe Checkout, unlimited picks
- **Per-user wallets:** Each user connects their own Polymarket API credentials via /connect
- **Encryption:** User API keys/secrets/passphrases encrypted with AES-256-GCM at rest in SQLite
- **Commands:** `/start`, `/stop`, `/connect`, `/disconnect`, `/wallet`, `/stats`, `/status`, `/subscribe`
- **Migration:** Existing JSON users auto-migrated to SQLite on first boot

## Per-User Wallet Flow

1. User sends `/connect` (private chat only)
2. Bot asks for API Key → API Secret → API Passphrase (one at a time)
3. Credentials encrypted with AES-256-GCM and stored in SQLite
4. User's credential messages auto-deleted for security
5. When user taps BET, their credentials are sent to the trader service
6. Trader creates a per-user CLOB client and places the order from THEIR account
7. `/disconnect` removes all stored credentials
8. `/wallet` shows connection status (masked key only)

## Trader Service Changes

The trader (`polymarket-trader`) now accepts optional per-user credentials in `/forward-order`:
- `apiKey`, `apiSecret`, `apiPassphrase` in request body
- If provided: uses user's Polymarket account (POLY_PROXY signature type)
- If not provided: falls back to default wallet (backward compatible)

## Files
- `index.js` — Main bot + Express server
- `db.js` — SQLite user tracking + encrypted credential storage (better-sqlite3)
- `stripe.js` — Stripe checkout + webhook verification
- `package.json` — Dependencies (added better-sqlite3)
