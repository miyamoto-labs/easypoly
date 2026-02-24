import { NextResponse } from 'next/server';
import { getSupabase } from '@/app/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/follows/toggle
 * Toggle follow/unfollow for a trader.
 * Body: { walletAddress, traderId }
 */
export async function POST(request: Request) {
  try {
    const { walletAddress, traderId } = await request.json();

    if (!walletAddress || !traderId) {
      return NextResponse.json(
        { error: 'Missing walletAddress or traderId' },
        { status: 400 }
      );
    }

    const address = walletAddress.toLowerCase();
    const supabase = getSupabase();

    // Check if follow already exists
    const { data: existing } = await supabase
      .from('ep_user_follows')
      .select('*')
      .eq('user_wallet', address)
      .eq('trader_id', traderId)
      .single();

    if (existing) {
      // Toggle active status
      const { data: updated, error } = await supabase
        .from('ep_user_follows')
        .update({ active: !existing.active, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, follow: updated });
    } else {
      // Create new follow
      const { data: created, error } = await supabase
        .from('ep_user_follows')
        .insert({
          user_wallet: address,
          trader_id: traderId,
          active: true,
          auto_trade: false,
          amount_per_trade: 10.0,
          max_daily_trades: 5,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, follow: created });
    }
  } catch (err: any) {
    console.error('Follow toggle error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to toggle follow' },
      { status: 500 }
    );
  }
}
