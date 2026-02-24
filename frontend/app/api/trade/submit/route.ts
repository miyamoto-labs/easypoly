import { NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase-server';
import { decrypt } from '@/app/lib/crypto';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const CLOB_HOST = 'https://clob.polymarket.com';

/**
 * POST /api/trade/submit
 *
 * Receives a pre-signed order (signed client-side via MetaMask) and
 * submits it to the Polymarket CLOB with builder attribution headers.
 *
 * The order's EIP-712 signature was created client-side where the
 * private key lives. This server only adds HMAC L2 auth headers
 * and builder attribution before forwarding to the CLOB.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      signedOrder,
      walletAddress,
      direction,
      amount,
      price,
      source,
      sourceId,
      orderType = 'GTC',
    } = body;

    // ── Validate ────────────────────────────────────
    if (!signedOrder || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: signedOrder, walletAddress' },
        { status: 400 }
      );
    }

    if (!signedOrder.signature || !signedOrder.tokenId) {
      return NextResponse.json(
        { error: 'Invalid signed order — missing signature or tokenId' },
        { status: 400 }
      );
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // ── 1. Fetch user's API credentials ─────────────
    const { data: user, error: userError } = await supabase
      .from('ep_users')
      .select('clob_api_key, clob_api_secret, clob_api_passphrase')
      .eq('wallet_address', address)
      .single();

    if (userError || !user || !user.clob_api_key) {
      return NextResponse.json(
        { error: 'Wallet not connected. Please connect your wallet first.' },
        { status: 401 }
      );
    }

    const apiKey = decrypt(user.clob_api_key);
    const apiSecret = decrypt(user.clob_api_secret);
    const apiPassphrase = decrypt(user.clob_api_passphrase);

    // ── 2. Build the order payload ──────────────────
    // Format matches what the CLOB client's orderToJson() produces
    const orderPayload = {
      deferExec: false,
      order: {
        salt: typeof signedOrder.salt === 'string' ? parseInt(signedOrder.salt, 10) : signedOrder.salt,
        maker: signedOrder.maker,
        signer: signedOrder.signer,
        taker: signedOrder.taker,
        tokenId: signedOrder.tokenId,
        makerAmount: signedOrder.makerAmount,
        takerAmount: signedOrder.takerAmount,
        side: signedOrder.side,
        expiration: signedOrder.expiration,
        nonce: signedOrder.nonce,
        feeRateBps: signedOrder.feeRateBps,
        signatureType: signedOrder.signatureType,
        signature: signedOrder.signature,
      },
      owner: apiKey,
      orderType,
    };

    const orderBody = JSON.stringify(orderPayload);

    // ── 3. Build L2 HMAC auth headers ───────────────
    const timestamp = Math.floor(Date.now() / 1000);
    const method = 'POST';
    const requestPath = '/order';

    const hmacSignature = buildHmacSignature(
      apiSecret,
      timestamp,
      method,
      requestPath,
      orderBody
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      POLY_ADDRESS: address,
      POLY_SIGNATURE: hmacSignature,
      POLY_TIMESTAMP: `${timestamp}`,
      POLY_API_KEY: apiKey,
      POLY_PASSPHRASE: apiPassphrase,
    };

    // ── 4. Add builder attribution headers ──────────
    const builderKey = process.env.POLY_BUILDER_API_KEY;
    const builderSecret = process.env.POLY_BUILDER_SECRET;
    const builderPassphrase = process.env.POLY_BUILDER_PASSPHRASE;

    if (builderKey && builderSecret && builderPassphrase) {
      const builderSig = buildHmacSignature(
        builderSecret,
        timestamp,
        method,
        requestPath,
        orderBody
      );

      headers['POLY_BUILDER_API_KEY'] = builderKey;
      headers['POLY_BUILDER_PASSPHRASE'] = builderPassphrase;
      headers['POLY_BUILDER_SIGNATURE'] = builderSig;
      headers['POLY_BUILDER_TIMESTAMP'] = `${timestamp}`;
    }

    // ── 5. Submit to CLOB ───────────────────────────
    const clobRes = await fetch(`${CLOB_HOST}${requestPath}`, {
      method,
      headers,
      body: orderBody,
    });

    const clobData = await clobRes.json().catch(() => ({}));

    if (!clobRes.ok) {
      console.error('CLOB order submission error:', clobRes.status, clobData);
      return NextResponse.json(
        {
          success: false,
          error: clobData.error || clobData.message || `CLOB returned ${clobRes.status}`,
        },
        { status: clobRes.status >= 500 ? 502 : clobRes.status }
      );
    }

    // ── 6. Log the trade ────────────────────────────
    const orderId =
      clobData.orderID ||
      clobData.id ||
      clobData.order_id ||
      JSON.stringify(clobData);

    const shares = amount && price ? amount / price : 0;

    await supabase.from('ep_user_trades').insert({
      user_wallet: address,
      token_id: signedOrder.tokenId,
      side: signedOrder.side === 0 ? 'BUY' : 'SELL',
      direction: direction || 'YES',
      amount: amount || 0,
      price: price || 0,
      shares,
      order_id: typeof orderId === 'string' ? orderId : JSON.stringify(orderId),
      source: source || null,
      source_id: sourceId || null,
    });

    // ── 7. Increment trade count ────────────────────
    try {
      const { data: userData } = await supabase
        .from('ep_users')
        .select('trade_count')
        .eq('wallet_address', address)
        .single();

      await supabase
        .from('ep_users')
        .update({ trade_count: ((userData as any)?.trade_count || 0) + 1 })
        .eq('wallet_address', address);
    } catch {
      // Non-critical — trade was already placed
    }

    return NextResponse.json({
      success: true,
      orderID: orderId,
      message: `Order placed: ${signedOrder.side === 0 ? 'BUY' : 'SELL'} $${amount || '?'} at ${price ? (price * 100).toFixed(0) + '¢' : '?'}`,
    });
  } catch (err: any) {
    console.error('Trade submit error:', err);

    const msg = err.message || 'Trade failed';
    const isAuthError =
      msg.includes('401') || msg.includes('auth') || msg.includes('credential');

    return NextResponse.json(
      {
        success: false,
        error: isAuthError
          ? 'Credentials expired. Please reconnect your wallet.'
          : msg,
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

/* ─── HMAC Helper ───────────────────────────────── */

/**
 * Build the Polymarket CLOB HMAC signature (same algorithm as the SDK).
 * Uses Node.js crypto (server-side) instead of Web Crypto.
 */
function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string
): string {
  let message = `${timestamp}${method}${requestPath}`;
  if (body !== undefined) {
    message += body;
  }

  // Secret is base64/base64url encoded
  const keyBuffer = Buffer.from(
    secret.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  );

  const sig = crypto
    .createHmac('sha256', keyBuffer)
    .update(message)
    .digest('base64');

  // Convert to URL-safe base64 (keep = padding)
  return sig.replace(/\+/g, '-').replace(/\//g, '_');
}
