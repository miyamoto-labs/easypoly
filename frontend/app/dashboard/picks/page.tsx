"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PickCard,
  PickCardSkeleton,
  FilterBar,
  SortDropdown,
  DailySuperPick,
  DailySuperPickSkeleton,
  CategorySection,
  PickTierBadge,
} from "@/app/components/ui";

// ── Categories ──────────────────────────────────
const categories = [
  { id: "all", label: "All", emoji: "📊" },
  { id: "politics", label: "Politics", emoji: "🏛️" },
  { id: "sports", label: "Sports", emoji: "⚽" },
  { id: "crypto", label: "Crypto", emoji: "💎" },
  { id: "culture", label: "Culture", emoji: "🎬" },
  { id: "finance", label: "Finance", emoji: "💰" },
  { id: "wild", label: "Wild Picks", emoji: "🎲" },
];

const KNOWN_CATEGORIES = ["politics", "sports", "crypto", "culture", "finance"];

// ── Category inference from question text ───────
const categoryKeywords: Record<string, string[]> = {
  politics: [
    "president", "trump", "biden", "harris", "election", "congress", "senate",
    "governor", "democrat", "republican", "political", "vote", "legislation",
    "government", "white house", "supreme court", "cabinet", "impeach",
    "primary", "electoral", "parliament", "nato", "un ", "geopolit",
    "tariff", "executive order", "ambassador", "diplomat", "sanctions",
    "starmer", "macron", "putin", "zelensky", "xi jinping", "modi",
  ],
  sports: [
    "nba", "nfl", "mlb", "nhl", "mls", "ufc", "pga", "atp", "wta",
    "soccer", "football", "basketball", "baseball", "hockey", "tennis",
    "golf", "boxing", "mma", "playoffs", "championship", "finals",
    "super bowl", "world series", "world cup", "mvp", "draft", "coach",
    "standings", "season", "tournament", "grand slam", "olympics",
    "f1 ", "formula 1", "nascar", "premier league", "la liga",
    "serie a", "bundesliga", "champions league",
    "lakers", "celtics", "warriors", "knicks", "nets", "heat", "bucks",
    "spurs", "nuggets", "thunder", "cavaliers", "76ers", "suns", "mavs",
    "mavericks", "timberwolves", "rockets", "grizzlies", "pacers",
    "chiefs", "eagles", "cowboys", "49ers", "ravens", "bills",
    "yankees", "dodgers", "cubs", "mets", "red sox", "braves",
    "cooper flagg", "lebron", "curry", "mahomes", "ohtani",
  ],
  crypto: [
    "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto",
    "token", "defi", "nft", "blockchain", "web3", "mining", "altcoin",
    "stablecoin", "memecoin", "meme coin", "dogecoin", "doge", "xrp",
    "cardano", "polkadot", "avalanche", "polygon", "matic", "airdrop",
    "halving", "coinbase", "binance", "sec crypto", "bitcoin etf",
  ],
  culture: [
    "movie", "film", "music", "oscar", "grammy", "emmy", "celebrity",
    "tv ", "tv show", "entertainment", "award", "tiktok", "youtube",
    "streaming", "netflix", "disney", "spotify", "album", "concert",
    "box office", "reality tv", "bachelor", "influencer", "viral",
    "social media", "podcast", "book", "novel", "taylor swift",
    "drake", "kanye", "beyonce", "kardashian", "elon musk",
    "ai ", "artificial intelligence", "openai", "chatgpt", "apple",
    "google", "meta ", "microsoft", "spacex", "tesla",
  ],
  finance: [
    "stock", "market cap", "fed ", "federal reserve", "interest rate",
    "gdp", "inflation", "recession", "s&p", "nasdaq", "dow jones",
    "earnings", "ipo", "revenue", "profit", "bond", "yield",
    "unemployment", "jobs report", "cpi", "fomc", "rate cut",
    "rate hike", "wall street", "hedge fund", "etf", "index",
    "commodity", "oil price", "gold price", "housing market",
  ],
};

/**
 * Get the effective category for a pick.
 * Uses the stored category if valid, otherwise infers from question text,
 * market_id slug, or other available text fields.
 * Returns "wild" only if no category can be determined.
 */
function getEffectiveCategory(pick: any): string {
  const stored = (pick.category || pick.market?.category || "").toLowerCase().trim();

  // If stored category is one of the known ones, use it directly
  if (KNOWN_CATEGORIES.includes(stored)) return stored;

  // Build search text from all available fields
  // question is best, but market_id/slug work too (replace hyphens with spaces)
  const question = (pick.question || pick.market?.question || "").toLowerCase();
  const slug = (pick.market_id || pick.slug || pick.condition_id || "").replace(/-/g, " ").toLowerCase();
  const searchText = question || slug;

  if (searchText) {
    let bestMatch = "";
    let bestScore = 0;
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
      let score = 0;
      for (const kw of keywords) {
        if (searchText.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    if (bestMatch) return bestMatch;
  }

  // Truly uncategorizable
  return "wild";
}

// ── Speculative Pick Detection ──────────────────
// Marks picks as speculative for the 🎲 indicator on cards.
// Only triggers on genuinely unusual conditions, NOT missing data.
const wildKeywords = [
  "alien", "ufo", "supernatural", "ghost", "bigfoot",
  "conspiracy", "elvis", "mars colony", "time travel", "simulation",
  "zombie", "vampire", "apocalypse", "flat earth", "illuminati",
  "loch ness", "yeti", "sasquatch", "paranormal", "multiverse",
];

function isSpeculativePick(pick: any): boolean {
  const price = pick.entry_price || 0;
  const question = (pick.question || pick.market?.question || "").toLowerCase();

  // Extreme prices (very likely or very unlikely) — genuinely speculative
  if (price > 0 && (price < 0.05 || price > 0.95)) return true;

  // Wild keywords in question — genuinely unusual topics
  if (wildKeywords.some((kw) => question.includes(kw))) return true;

  // No question at all — uncertain/incomplete data
  if (!pick.question && !pick.market?.question) return true;

  return false;
}

// ── Sorting ─────────────────────────────────────
const sortOptions = [
  { value: "newest", label: "Newest First" },
  { value: "score", label: "Highest Score" },
  { value: "rr", label: "Best R/R" },
  { value: "tier", label: "By Tier" },
];

const statusOptions = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "won", label: "Target Hit" },
  { value: "lost", label: "Lost" },
];

const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

function sortPicks(items: any[], sortBy: string): any[] {
  const sorted = [...items];
  switch (sortBy) {
    case "score":
      sorted.sort((a, b) => (b.composite_score || b.conviction_score || 0) - (a.composite_score || a.conviction_score || 0));
      break;
    case "rr":
      sorted.sort((a, b) => (b.risk_reward || 0) - (a.risk_reward || 0));
      break;
    case "tier":
      sorted.sort((a, b) => (tierOrder[a.tier] ?? 5) - (tierOrder[b.tier] ?? 5));
      break;
    default: // newest
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return sorted;
}

// ── Category filtering (uses effective category) ─
function filterPicksByCategory(picks: any[], categoryId: string): any[] {
  if (categoryId === "all") return picks;
  return picks.filter((p) => getEffectiveCategory(p) === categoryId);
}

// ── Category counts (uses effective category) ───
function getCategoryCounts(picks: any[]): Record<string, number> {
  const counts: Record<string, number> = { all: picks.length };

  for (const p of picks) {
    const cat = getEffectiveCategory(p);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

// ── Tier Stats ──────────────────────────────────
function getTierStats(picks: any[]): { tier: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const p of picks) {
    const t = p.tier;
    if (!t || !(t in tierOrder)) continue; // Skip picks without a known tier
    counts[t] = (counts[t] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => (tierOrder[a.tier] ?? 5) - (tierOrder[b.tier] ?? 5));
}

// ═══════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════
export default function PicksPage() {
  const [picks, setPicks] = useState<any[]>([]);
  const [superPick, setSuperPick] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState<
    Record<string, { yes: number; no: number; yesToken: string; noToken: string }>
  >({});

  /** Fetch live prices from Gamma API for all picks */
  const fetchLivePrices = useCallback(async (pickList: any[]) => {
    try {
      // Build id→slug map so we can key prices by the pick's identifier
      // Prefer slug for Gamma lookups (condition_id matches wrong markets)
      const idMap: Record<string, string> = {};
      for (const p of pickList) {
        const key = p.condition_id || p.market_id;
        const slug = p.slug || p.market_id;
        if (key && slug) idMap[key] = slug;
      }
      const uniqueSlugs = [...new Set(Object.values(idMap))];
      if (uniqueSlugs.length === 0) return;

      const res = await fetch(
        `/api/dashboard/picks/prices?ids=${uniqueSlugs.join(",")}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.prices) return;

      // Re-key by condition_id/market_id so enrichedPicks can look them up
      const reKeyed: typeof livePrices = {};
      for (const [key, slug] of Object.entries(idMap)) {
        if (data.prices[slug]) reKeyed[key] = data.prices[slug];
      }
      setLivePrices(reKeyed);
    } catch {
      // Silent — stale prices still show
    }
  }, []);

  const fetchPicks = useCallback(async () => {
    try {
      const fetchLimit = statusFilter === "resolved" ? "200" : "100";
      const params = new URLSearchParams({ limit: fetchLimit });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/dashboard/picks?${params}`);
      const data = await res.json();

      const newPicks = data.picks || [];
      setPicks(newPicks);
      setSuperPick(data.superPick || null);

      // Fetch live prices after picks load
      fetchLivePrices(newPicks);
    } catch (err) {
      console.error("Picks fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fetchLivePrices]);

  useEffect(() => {
    setLoading(true);
    fetchPicks();
  }, [fetchPicks]);

  useEffect(() => {
    const interval = setInterval(fetchPicks, 30000);
    return () => clearInterval(interval);
  }, [fetchPicks]);

  // Live price refresh (5s intervals — near-real-time market prices)
  useEffect(() => {
    if (picks.length === 0) return;
    const priceInterval = setInterval(() => {
      fetchLivePrices(picks);
    }, 5_000);
    return () => clearInterval(priceInterval);
  }, [picks, fetchLivePrices]);

  // ── Merge live prices into picks ────────────
  const enrichedPicks = useMemo(() => {
    if (Object.keys(livePrices).length === 0) return picks;
    return picks.map((p: any) => {
      const id = p.condition_id || p.market_id;
      const lp = id ? livePrices[id] : null;
      if (!lp) return p;
      return {
        ...p,
        live_yes_price: lp.yes,
        live_no_price: lp.no,
        live_yes_token: lp.yesToken,
        live_no_token: lp.noToken,
      };
    });
  }, [picks, livePrices]);

  // ── Derived data ────────────────────────────
  const sortedPicks = useMemo(() => sortPicks(enrichedPicks, sort), [enrichedPicks, sort]);
  const categoryCounts = useMemo(() => getCategoryCounts(picks), [picks]);
  const tierStats = useMemo(() => getTierStats(picks), [picks]);
  const activePicks = useMemo(() => enrichedPicks.filter((p: any) => p.status === "active"), [enrichedPicks]);

  // Filter by active category
  const filteredPicks = useMemo(() => {
    const filtered = filterPicksByCategory(sortedPicks, activeCategory);
    return filtered;
  }, [sortedPicks, activeCategory]);

  // Build a set of speculative pick IDs for the 🎲 indicator
  const speculativeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of enrichedPicks) {
      if (isSpeculativePick(p)) ids.add(p.id);
    }
    return ids;
  }, [enrichedPicks]);

  // Group by effective category for "all" view — each pick in exactly one group
  const categoryGroups = useMemo(() => {
    if (activeCategory !== "all") return null;

    const groups: { category: typeof categories[number]; picks: any[] }[] = [];
    // Real categories first (politics, sports, crypto, culture, finance)
    for (const cat of categories.filter((c) => c.id !== "all" && c.id !== "wild")) {
      const catPicks = filterPicksByCategory(sortedPicks, cat.id);
      if (catPicks.length > 0) {
        groups.push({ category: cat, picks: catPicks });
      }
    }

    // Wild = truly uncategorizable picks only (no duplicates from above)
    const wildPicks = filterPicksByCategory(sortedPicks, "wild");
    if (wildPicks.length > 0) {
      groups.push({
        category: { id: "wild", label: "Wild Picks", emoji: "🎲" },
        picks: wildPicks,
      });
    }

    return groups;
  }, [sortedPicks, activeCategory]);

  // ── Render ──────────────────────────────────
  return (
    <div className="py-6 space-y-6">
      {/* ── Header ───────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold flex items-center gap-2">
            <span>🎯</span> AI Picks
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            {picks.length} picks total · {activePicks.length} active
            {tierStats.length > 0 && (
              <span className="ml-2">
                {tierStats.map((t) => (
                  <span key={t.tier} className="inline-flex items-center gap-0.5 ml-1.5">
                    <PickTierBadge tier={t.tier} size="sm" showLabel={false} />
                    <span className="text-[10px] text-text-muted">×{t.count}</span>
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Daily Super Pick ─────────────────── */}
      {loading ? (
        <DailySuperPickSkeleton />
      ) : superPick ? (
        <DailySuperPick pick={(() => {
          const id = superPick.condition_id || superPick.market_id;
          const lp = id ? livePrices[id] : null;
          if (!lp) return superPick;
          return { ...superPick, live_yes_price: lp.yes, live_no_price: lp.no, live_yes_token: lp.yesToken, live_no_token: lp.noToken };
        })()} />
      ) : null}

      {/* ── Category Tabs ────────────────────── */}
      <div className="space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
          {categories.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all
                  ${
                    isActive
                      ? cat.id === "wild"
                        ? "bg-purple-500/15 text-purple-400 border border-purple-500/25 shadow-[0_0_8px_rgba(168,85,247,0.15)]"
                        : "bg-accent/15 text-accent border border-accent/25 shadow-[0_0_8px_rgba(0,240,160,0.1)]"
                      : "bg-ep-surface/40 text-text-muted border border-ep-border/50 hover:text-text-secondary hover:border-ep-border"
                  }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] font-mono px-1 py-px rounded ${
                      isActive ? "bg-white/10" : "bg-ep-surface/60"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-4">
          <FilterBar label="Status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
          <div className="ml-auto">
            <SortDropdown options={sortOptions} value={sort} onChange={setSort} />
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────── */}
      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <PickCardSkeleton key={i} />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <EmptyState statusFilter={statusFilter} />
      ) : activeCategory === "all" && categoryGroups ? (
        /* ── Grouped "All" View ──────────────── */
        <div className="space-y-8">
          {categoryGroups.map(({ category, picks: catPicks }) => (
            <CategorySection
              key={category.id}
              category={category}
              picks={catPicks}
              defaultOpen={category.id === "wild" || catPicks.length <= 10}
              isWild={category.id === "wild"}
              speculativeIds={speculativeIds}
            />
          ))}
        </div>
      ) : activeCategory === "wild" ? (
        /* ── Wild Picks View ─────────────────── */
        <div className="space-y-3">
          <CategorySection
            category={{ id: "wild", label: "Wild Picks", emoji: "🎲" }}
            picks={filteredPicks}
            defaultOpen={true}
            isWild={true}
            speculativeIds={speculativeIds}
          />
        </div>
      ) : filteredPicks.length > 0 ? (
        /* ── Single Category View ────────────── */
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filteredPicks.map((pick: any) => (
            <PickCard
              key={pick.id}
              pick={pick}
              variant="grid"
              isSpeculative={speculativeIds.has(pick.id)}
            />
          ))}
        </motion.div>
      ) : (
        <EmptyState statusFilter={statusFilter} category={activeCategory} />
      )}
    </div>
  );
}

// ── Empty state ─────────────────────────────────
function EmptyState({ statusFilter, category }: { statusFilter?: string; category?: string }) {
  const catLabel = categories.find((c) => c.id === category)?.label;

  return (
    <div className="ep-card p-12 text-center">
      <div className="text-4xl mb-3">{category === "wild" ? "🎲" : "📋"}</div>
      <h3 className="font-display font-semibold text-text-primary">
        No {catLabel ? `${catLabel} ` : ""}picks found
      </h3>
      <p className="text-sm text-text-muted mt-1">
        {statusFilter && statusFilter !== "all"
          ? "Try a different filter."
          : category
          ? `No picks in this category yet. Check back soon!`
          : "The engine will generate picks once it's running."}
      </p>
    </div>
  );
}
