# Testing Guide

## Local Testing

### 1. Setup Test Environment

```bash
# Copy env file
cp .env.example .env.test

# Edit with test credentials
# Use a separate Supabase project for testing
```

### 2. Create Test Bot

1. Create a new bot with @BotFather: `/newbot`
2. Name it something like "EasyPoly Test Bot"
3. Save token to `.env.test`

### 3. Run Test Bot

```bash
# Load test env
export $(cat .env.test | xargs)

# Start bot
npm run dev
```

### 4. Manual Testing Checklist

#### Onboarding Flow
- [ ] `/start` - Shows welcome message with buttons
- [ ] "Help" button - Shows help text
- [ ] "Settings" button - Opens settings menu
- [ ] Referral link works: `?start=referral_code`

#### Wallet Management
- [ ] `/wallet` - Shows "Create Wallet" for new users
- [ ] "Create Wallet" - Creates Privy wallet successfully
- [ ] "Deposit" - Shows deposit address
- [ ] "Withdraw" - Shows withdrawal instructions
- [ ] Balance displays correctly

#### Daily Picks
- [ ] `/picks` - Loads picks from database
- [ ] Shows top 3 picks with conviction scores
- [ ] Trade buttons ($10/$25/$50) appear
- [ ] Clicking trade button executes (or fails gracefully if insufficient balance)
- [ ] "View Market" link works

#### Copy Trading
- [ ] `/copy` - Shows copy trading menu
- [ ] "Browse Top Traders" - Shows curated traders
- [ ] "Add Custom Trader" - Prompts for address
- [ ] Paste valid address → shows stats preview
- [ ] Paste invalid address → error message
- [ ] Confirm copy → prompts for amount
- [ ] Select amount → creates copy trade config
- [ ] Copy trades appear in list

#### Portfolio
- [ ] `/portfolio` - Shows summary (even if empty)
- [ ] Active positions display correctly
- [ ] P&L calculated correctly (24h, 7d, all-time)
- [ ] "Details" button - Shows position details
- [ ] "Sell" button - Shows sell info (or placeholder)

#### Settings
- [ ] `/settings` - Shows all settings
- [ ] "Notifications" - Toggle options work
- [ ] "Auto-Copy" - Toggle works
- [ ] "Referrals" - Shows stats and link
- [ ] Toggles persist (check database)

#### Edge Cases
- [ ] Spamming buttons → doesn't break bot
- [ ] Invalid input → graceful error messages
- [ ] Missing env vars → bot logs error
- [ ] Database down → error message shown
- [ ] Long market titles → message not cut off

## Automated Testing

### Unit Tests

```bash
# TODO: Add jest/mocha tests
npm test
```

Example test structure:

```javascript
// tests/validation.test.js
import { isValidAddress } from '../src/utils/validation.js';

test('validates Ethereum addresses', () => {
  expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')).toBe(true);
  expect(isValidAddress('invalid')).toBe(false);
});
```

### Integration Tests

Test database operations:

```javascript
// tests/database.test.js
import { getOrCreateUser } from '../src/db/supabase.js';

test('creates new user', async () => {
  const user = await getOrCreateUser(12345, 'testuser', 'Test');
  expect(user.telegram_id).toBe(12345);
});
```

## Load Testing

### Simulate Multiple Users

```javascript
// scripts/load-test.js
import axios from 'axios';

async function simulateUsers(count) {
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    promises.push(
      axios.post('https://api.telegram.org/bot<TOKEN>/sendMessage', {
        chat_id: TEST_CHAT_ID,
        text: '/start'
      })
    );
  }
  
  await Promise.all(promises);
}

simulateUsers(100);
```

### Monitor Performance

```bash
# Check Railway metrics
railway logs --tail 1000 | grep "Error"

# Database queries
# Run in Supabase SQL Editor:
SELECT 
  query, 
  calls, 
  mean_exec_time, 
  max_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 20;
```

## Production Testing

### Smoke Tests (After Deploy)

```bash
# Health check
curl https://your-bot.railway.app/health

# Send test message
# Message the bot: /start

# Check logs
railway logs --tail 50
```

### Monitoring Checklist

- [ ] Bot responds to `/start`
- [ ] Database queries working
- [ ] Background jobs running (check logs)
- [ ] Error rate < 1%
- [ ] Response time < 2s

## Debugging

### Enable Verbose Logging

```javascript
// In bot.js
bot.use((ctx, next) => {
  console.log('Update:', JSON.stringify(ctx.update, null, 2));
  return next();
});
```

### Inspect Database State

```sql
-- Check user count
SELECT COUNT(*) FROM telegram_users;

-- Recent activity
SELECT * FROM bot_trades ORDER BY created_at DESC LIMIT 10;

-- Copy trading status
SELECT 
  u.username,
  ct.trader_address,
  ct.status,
  ct.amount_per_trade
FROM copy_trades ct
JOIN telegram_users u ON ct.user_id = u.id
WHERE ct.status = 'active';
```

### Test Specific Features

#### Test Copy Trading Monitor

```javascript
// Manually trigger
import { monitorAndCopyTrades } from './src/services/copyTrade.js';
import bot from './src/bot.js';

await monitorAndCopyTrades(bot);
```

#### Test Referral System

```javascript
// Manually process referral
import { processReferral } from './src/services/referrals.js';

const user = { telegram_id: 12345 };
const referrer = await processReferral(user, 'test_code');
console.log('Referrer:', referrer);
```

## Common Issues

### "Bot not responding"
- Check token is correct
- Verify bot is running: `railway logs`
- Test with `/start` command

### "Database error"
- Check Supabase credentials
- Verify tables exist (run migrations)
- Check RLS policies (disabled for service key)

### "Wallet creation fails"
- Verify Privy credentials
- Check Privy dashboard for errors
- Test with Privy API directly

### "Copy trades not executing"
- Check cron job logs
- Verify Polymarket API access
- Test trader address manually

## Performance Benchmarks

Expected metrics:

- Response time: < 2s
- Database query time: < 100ms
- Message send time: < 500ms
- Background job cycle: < 30s

Monitor with:

```javascript
// Add timing to handlers
const start = Date.now();
// ... handler code ...
console.log(`Handler took ${Date.now() - start}ms`);
```

## Security Testing

- [ ] SQL injection attempts → sanitized
- [ ] XSS in messages → escaped
- [ ] Rate limiting → enforced
- [ ] Invalid callbacks → handled gracefully
- [ ] Malicious addresses → validated
- [ ] Large numbers → handled without overflow

---

Happy testing! 🧪
