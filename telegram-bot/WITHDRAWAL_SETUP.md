# Withdrawal Setup Guide

## ✅ Real Blockchain Withdrawals Implemented

The bot now executes **real USDC withdrawals** on Polygon network.

## Requirements

### 1. Polygon RPC Endpoint
Add to Railway environment variables:
```
POLYGON_RPC=https://polygon-rpc.com
```

Or use a faster/more reliable RPC:
- Alchemy: `https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY`
- Infura: `https://polygon-mainnet.infura.io/v3/YOUR_KEY`
- QuickNode: Your QuickNode Polygon endpoint

### 2. POL (Polygon) for Gas Fees

**IMPORTANT:** Each user wallet needs POL tokens to pay for gas fees!

- **Gas cost per withdrawal:** ~0.001-0.003 POL (~$0.0005-$0.0015)
- **Recommendation:** Fund each wallet with 0.1 POL (~$0.05) when created

**How to fund wallets with POL:**
1. When user creates wallet, send them 0.1 POL from a master wallet
2. Or: Prompt users to deposit POL along with USDC
3. Or: Use a gas relay service (e.g., Biconomy)

## What Happens During Withdrawal

1. **User initiates:** `/withdraw 50 0x123...`
2. **Bot validates:**
   - Amount is valid
   - Address format is correct
   - User has sufficient USDC
   - User has sufficient POL for gas
3. **User confirms:** Clicks ✅ Confirm button
4. **Bot executes:**
   - Creates USDC transfer transaction
   - Signs with user's private key
   - Broadcasts to Polygon network
   - Waits for confirmation (1 block)
5. **Bot responds:**
   - Success: Shows transaction hash + PolygonScan link
   - Failure: Shows specific error (insufficient funds, gas, etc.)
6. **Database:** Records withdrawal in `bot_trades` table

## Transaction Details

- **Network:** Polygon (Chain ID: 137)
- **Token:** USDC (Native) - `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **Confirmations:** 1 block (Polygon is fast, ~2 seconds)
- **Gas:** Paid in POL (Polygon's native token)

## Error Handling

The bot handles all common errors:
- ❌ Insufficient USDC balance
- ❌ Insufficient POL for gas
- ❌ Invalid recipient address
- ❌ Network errors (RPC down, etc.)
- ❌ Transaction reverted on-chain

## Testing

### Test on Polygon Mumbai Testnet First

1. Change `POLYGON_RPC` to Mumbai testnet
2. Use testnet USDC contract
3. Fund test wallet with test POL (free from faucet)
4. Test withdrawals with small amounts

### Production Checklist

- [ ] POLYGON_RPC environment variable set on Railway
- [ ] All user wallets have >= 0.1 POL for gas
- [ ] Monitor failed transactions
- [ ] Set up alerts for low POL balances

## Code Files

- **Blockchain service:** `src/services/blockchain.js`
- **Withdrawal handler:** `src/commands/wallet.js` (handleWithdrawConfirm)
- **Balance checking:** `src/services/privy.js` (getWalletBalance)

## Security Notes

⚠️ **Private keys are stored in database** (currently unencrypted in `settings.private_key`)

**For production:**
- Encrypt private keys before storing
- Use hardware security module (HSM) or key management service
- Or: Use Privy's embedded wallet SDK (they manage keys)
- Or: Implement multi-sig for large withdrawals
