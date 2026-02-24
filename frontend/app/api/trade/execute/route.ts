import { NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase-server';
import { decrypt } from '@/app/lib/crypto';
import { createServerClobClient, getBuilderConfig } from '@/app/lib/server-signer';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/trade/execute
 * Saves take-profit / stop-loss targets for an existing trade.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { orderID, walletAddress, takeProfit, stopLoss } = body;

    if (!orderID || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: orderID, walletAddress' },
        { status: 400 }
      );
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // Update the trade with TP/SL — only if it belongs to this user
    const { error } = await supabase
      .from('ep_user_trades')
      .update({
        take_profit: takeProfit ?? null,
        stop_loss: stopLoss ?? null,
      })
      .eq('order_id', orderID)
      .eq('user_wallet', address);

    if (error) {
      console.error('TP/SL update error:', error);
      return NextResponse.json(
        { error: 'Failed to save TP/SL' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('TP/SL PATCH error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to save TP/SL' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trade/execute
 * Places an order on Polymarket CLOB using the user's stored credentials.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress, tokenId, side, amount, price, direction, source, sourceId } = body;

    // Validate required fields
    if (!walletAddress || !tokenId || !side || !amount || !price) {
      return NextResponse.json(
        { error: 'Missing required fields: walletAddress, tokenId, side, amount, price' },
        { status: 400 }
      );
    }

    if (amount < 1 || amount > 1000) {
      return NextResponse.json(
        { error: 'Amount must be between $1 and $1,000' },
        { status: 400 }
      );
    }

    if (!['BUY', 'SELL'].includes(side)) {
      return NextResponse.json(
        { error: 'Side must be BUY or SELL' },
        { status: 400 }
      );
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // 1. Fetch user's encrypted credentials + private key
    const { data: user, error: userError } = await supabase
      .from('ep_users')
      .select('clob_api_key, clob_api_secret, clob_api_passphrase, encrypted_private_key')
      .eq('wallet_address', address)
      .single();

    if (userError || !user || !user.clob_api_key) {
      return NextResponse.json(
        { error: 'Wallet not connected. Please connect your wallet first.' },
        { status: 401 }
      );
    }

    if (!user.encrypted_private_key) {
      return NextResponse.json(
        { error: 'Server-side trading not enabled. Please add your private key in Settings.' },
        { status: 403 }
      );
    }

    // 2. Create CLOB client with server-side signer + builder attribution
    const builderConfig = await getBuilderConfig();
    const clobClient = await createServerClobClient(
      user.encrypted_private_key,
      user.clob_api_key,
      user.clob_api_secret,
      user.clob_api_passphrase,
      builderConfig,
    );

    // Calculate shares from dollar amount and price
    const size = amount / price;

    const order = await clobClient.createAndPostOrder({
      tokenID: tokenId,
      side: side as any,
      size,
      price,
    });

    // 4. Log the trade
    const shares = size;
    const orderId = typeof order === 'object' ? (order as any).id || (order as any).orderID || JSON.stringify(order) : String(order);

    await supabase.from('ep_user_trades').insert({
      user_wallet: address,
      token_id: tokenId,
      side,
      direction: direction || (side === 'BUY' ? 'YES' : 'NO'),
      amount,
      price,
      shares,
      order_id: orderId,
      source: source || null,
      source_id: sourceId || null,
    });

    // 5. Increment trade count
    try {
      await supabase
        .from('ep_users')
        .update({ trade_count: ((user as any).trade_count || 0) + 1 })
        .eq('wallet_address', address);
    } catch {
      // Non-critical — trade was already placed
    }

    return NextResponse.json({
      success: true,
      orderID: orderId,
      message: `Order placed: ${side} $${amount} at ${(price * 100).toFixed(0)}¢`,
    });
  } catch (err: any) {
    console.error('Trade execution error:', err);

    // Provide user-friendly error messages
    const msg = err.message || 'Trade failed';
    const isAuthError = msg.includes('401') || msg.includes('auth') || msg.includes('credential');

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
