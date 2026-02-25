import { NextResponse } from "next/server";

const BACKEND_URL = process.env.STRATEGYLAB_BACKEND_URL || "http://localhost:8001";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/strategies`, {
      headers: {
        "Content-Type": "application/json",
      },
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
    console.error("Strategies API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch strategies" },
      { status: 500 }
    );
  }
}
