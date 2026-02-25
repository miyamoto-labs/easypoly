import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.STRATEGYLAB_BACKEND_URL || "http://localhost:8001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Backtest API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run backtest" },
      { status: 500 }
    );
  }
}
