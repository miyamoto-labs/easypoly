import { NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/follows/settings
 * Update auto-trade settings for a followed trader.
 * Body: { walletAddress, traderId, auto_trade?, amount_per_trade?, max_daily_trades? }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress, traderId, ...settings } = body;

    if (!walletAddress || !traderId) {
      return NextResponse.json(
        { error: 'Missing walletAddress or traderId' },
        { status: 400 }
      );
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // Build update object from allowed fields
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof settings.auto_trade === 'boolean') updates.auto_trade = settings.auto_trade;
    if (typeof settings.amount_per_trade === 'number') {
      updates.amount_per_trade = Math.max(1, Math.min(1000, settings.amount_per_trade));
    }
    if (typeof settings.max_daily_trades === 'number') {
      updates.max_daily_trades = Math.max(1, Math.min(50, settings.max_daily_trades));
    }

    const { data, error } = await supabase
      .from('ep_user_follows')
      .update(updates)
      .eq('user_wallet', address)
      .eq('trader_id', traderId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, follow: data });
  } catch (err: any) {
    console.error('Follow settings error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to update follow settings' },
      { status: 500 }
    );
  }
}
