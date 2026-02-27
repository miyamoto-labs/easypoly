import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { strategy_name, params, results } = body;

    if (!strategy_name || !params || !results) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate hash from params
    const hashData = {
      strategy: strategy_name,
      edge: params.edge_threshold,
      confidence: params.confidence_threshold,
      asset: params.asset,
      timeframe: params.timeframe,
    };
    const hash = Buffer.from(JSON.stringify(hashData))
      .toString("base64")
      .replace(/[/+=]/g, "")
      .substring(0, 16);

    // Insert into Supabase (create table if doesn't exist)
    const { data, error } = await supabase
      .from("lab_backtests")
      .insert({
        hash,
        strategy_name,
        params,
        results,
        shares_count: 0,
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, return hash anyway
      if (error.code === "42P01") {
        console.warn("Table lab_backtests doesn't exist yet. Run migration.");
        return NextResponse.json({ hash, warning: "Table not created yet" });
      }
      throw error;
    }

    return NextResponse.json({ hash, data });
  } catch (error) {
    console.error("Share API error:", error);
    return NextResponse.json(
      { error: "Failed to save backtest" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get("hash");

    if (!hash) {
      return NextResponse.json(
        { error: "Hash parameter required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("lab_backtests")
      .select("*")
      .eq("hash", hash)
      .single();

    if (error) {
      throw error;
    }

    // Increment shares_count
    await supabase
      .from("lab_backtests")
      .update({ shares_count: (data.shares_count || 0) + 1 })
      .eq("hash", hash);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Get shared backtest error:", error);
    return NextResponse.json(
      { error: "Backtest not found" },
      { status: 404 }
    );
  }
}
