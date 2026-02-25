"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";

const TELEGRAM_COMMUNITY_URL = "https://t.me/easypolycommunity";
const TELEGRAM_ALERTS_URL = "https://t.me/+l_s-Z6OpIKBlNzlk";
const TELEGRAM_BOT_URL = "https://t.me/EasyPolyBot";

/* ───── Animations ───── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};
const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`relative px-5 sm:px-8 ${className}`}>
      {children}
    </section>
  );
}

/* ───── Logo ───── */
function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="flex items-center gap-2.5">
      <div className={`relative ${s}`}>
        <svg viewBox="0 0 512 512" className="h-full w-full">
          <rect width="512" height="512" fill="#0F1118" rx="96" />
          <g transform="translate(256,256)">
            <circle cx="0" cy="0" r="120" fill="none" stroke="#00F0A0" strokeWidth="6" opacity="0.2" />
            <circle cx="0" cy="0" r="80" fill="none" stroke="#00F0A0" strokeWidth="8" opacity="0.4" />
            <circle cx="0" cy="0" r="40" fill="#00F0A0" />
            <path d="M-140,60 L-80,20 L-20,-20 L40,-60 L100,-100 L140,-140" fill="none" stroke="#00F0A0" strokeWidth="10" strokeLinecap="round" />
            <circle cx="140" cy="-140" r="8" fill="#00F0A0" />
          </g>
        </svg>
      </div>
      <span className="text-xl font-display font-bold tracking-tight">
        Easy<span className="text-gradient">Poly</span>
      </span>
    </div>
  );
}

/* ───── CTA ───── */
function CTAButton({ size = "lg", label }: { size?: "lg" | "md" | "sm"; label?: string }) {
  const sizes = { lg: "px-8 py-4 text-base", md: "px-6 py-3 text-sm", sm: "px-5 py-2.5 text-sm" };
  return (
    <motion.a
      href="/dashboard"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`btn-accent inline-flex items-center gap-2 font-bold ${sizes[size]}`}
    >
      {label || "Start Trading Smarter"}
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </motion.a>
  );
}

/* ───── Animated Counter ───── */
function Counter({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1500;
    const steps = 40;
    const inc = target / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current += inc;
      if (step >= steps) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref} className="font-mono tabular-nums">
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

/* ───── Check Icon ───── */
function Check() {
  return (
    <svg className="h-4 w-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* ───── Navbar ───── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-ep-border/50 glass">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <Logo />
        <div className="hidden items-center gap-8 text-sm text-text-secondary md:flex">
          <a href="#arcade" className="transition hover:text-text-primary">Arcade</a>
          <a href="#how" className="transition hover:text-text-primary">How It Works</a>
          <a href="#features" className="transition hover:text-text-primary">Features</a>
          <a href="#pricing" className="transition hover:text-text-primary">Pricing</a>
          <a href="/dashboard" className="rounded-lg bg-accent/10 px-3 py-1.5 font-medium text-accent transition hover:bg-accent/20">
            Dashboard
          </a>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <CTAButton size="sm" label="Get Started" />
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-text-secondary hover:text-text-primary transition"
            aria-label="Menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden md:hidden border-t border-ep-border/50"
          >
            <div className="flex flex-col gap-1 p-4">
              <a href="#arcade" onClick={() => setMobileOpen(false)} className="px-4 py-3 rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition">Arcade</a>
              <a href="#how" onClick={() => setMobileOpen(false)} className="px-4 py-3 rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition">How It Works</a>
              <a href="#features" onClick={() => setMobileOpen(false)} className="px-4 py-3 rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition">Features</a>
              <a href="#pricing" onClick={() => setMobileOpen(false)} className="px-4 py-3 rounded-lg text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition">Pricing</a>
              <a href="/dashboard" className="px-4 py-3 rounded-lg text-sm font-medium text-accent bg-accent/10 hover:bg-accent/20 transition">Dashboard</a>
              <div className="pt-2">
                <CTAButton size="sm" label="Get Started" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

/* ───── Hero ───── */
function Hero() {
  return (
    <Section className="flex min-h-[100vh] flex-col items-center justify-center pt-20 text-center mesh-gradient">
      {/* Live badge */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-accent/20 bg-accent/8 px-4 py-1.5 text-sm text-accent"
      >
        <span className="live-dot" />
        Live on Polymarket — real bets, real markets
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-5xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
      >
        Play the Chart.{" "}
        <br className="hidden sm:block" />
        Trade <span className="text-gradient">Polymarket</span>.{" "}
        <br className="hidden sm:block" />
        Your Way.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary sm:text-xl leading-relaxed"
      >
        Click-to-bet arcade with a live Snake game on the BTC chart — or let AI find 15%+ edges across 500+ markets. Two ways to trade. One platform.
      </motion.p>

      {/* Dual CTAs */}
      <motion.div initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <motion.a
          href="/dashboard/bot"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn-accent inline-flex items-center gap-2 font-bold px-8 py-4 text-base"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
          </svg>
          Play the Arcade
        </motion.a>
        <CTAButton label="AI Smart Trading" />
      </motion.div>

      {/* Secondary links */}
      <motion.div initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-5 flex items-center gap-4">
        <a href={TELEGRAM_ALERTS_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-2 text-sm">
          Free Alerts
        </a>
        <a href={TELEGRAM_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-2 text-sm">
          Community
        </a>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-text-muted"
      >
        <span className="flex items-center gap-1.5"><Check /> $1 click-to-bet arcade</span>
        <span className="flex items-center gap-1.5"><Check /> AI scans 500+ markets</span>
        <span className="flex items-center gap-1.5"><Check /> Your wallet, your keys</span>
      </motion.div>

      {/* Ambient orbs */}
      <div className="pointer-events-none absolute top-1/3 left-1/4 h-[500px] w-[500px] rounded-full bg-accent/[0.04] blur-[150px]" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/[0.03] blur-[120px]" />
    </Section>
  );
}

/* ───── Arcade Showcase ───── */
function ArcadeShowcase() {
  return (
    <Section id="arcade" className="mx-auto max-w-6xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent">
        The Arcade
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl">
        Bet on BTC. <span className="text-gradient">Play the chart.</span>
      </motion.h2>
      <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 max-w-xl text-text-secondary">
        Click UP or DOWN to place a real $1 Polymarket bet. Then watch the live BTC price chart turn into a game — collect coins, dodge obstacles, build combos while you wait for your bet to resolve.
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-12 grid gap-5 md:grid-cols-3">
        {/* How it works cards */}
        {[
          {
            icon: (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            ),
            title: "Click UP or DOWN",
            desc: "Place a real $1 bet on whether BTC will be higher or lower when the 5-minute window closes. Real Polymarket orders, real payouts.",
            accent: "#00F0A0",
          },
          {
            icon: (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
              </svg>
            ),
            title: "Play the Snake Game",
            desc: "While your bet is live, the BTC price comet becomes a snake. Collect XP coins, gems, and shields. Dodge spikes. Build combos for multiplied points.",
            accent: "#F0B000",
          },
          {
            icon: (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 01-4.27 1.772 6.04 6.04 0 01-4.27-1.772" />
              </svg>
            ),
            title: "Win + Earn XP",
            desc: "If BTC moves your way, you win real money. Plus, your game score earns XP for the weekly leaderboard and jackpot pool.",
            accent: "#A78BFA",
          },
        ].map((card) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="ep-card p-7">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl mb-5" style={{ background: `${card.accent}15`, color: card.accent }}>
              {card.icon}
            </div>
            <h3 className="text-lg font-display font-bold">{card.title}</h3>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">{card.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Game items preview */}
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-10 flex flex-wrap items-center justify-center gap-4">
        {[
          { emoji: "🪙", label: "+10 XP", color: "#F59E0B" },
          { emoji: "💎", label: "+25 XP", color: "#A78BFA" },
          { emoji: "⭐", label: "Streak", color: "#00F0A0" },
          { emoji: "🛡️", label: "Shield", color: "#60A5FA" },
          { emoji: "⚡", label: "Boost", color: "#00F0A0" },
          { emoji: "❌", label: "Spike", color: "#FF4060" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-full border border-ep-border bg-ep-surface/50 px-4 py-2">
            <span className="text-lg">{item.emoji}</span>
            <span className="text-xs font-mono font-semibold" style={{ color: item.color }}>{item.label}</span>
          </div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-8 text-center">
        <motion.a
          href="/dashboard/bot"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn-accent inline-flex items-center gap-2 font-bold px-8 py-4 text-base"
        >
          Try the Arcade
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </motion.a>
      </motion.div>
    </Section>
  );
}

/* ───── Social Proof Stats ───── */
function SocialProof() {
  return (
    <Section className="mx-auto max-w-5xl py-20">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { value: 500, suffix: "+", label: "Markets Scanned" },
          { value: 116, suffix: "+", label: "Traders Tracked" },
          { value: 80, suffix: "+", label: "Min Conviction" },
          { value: 10, suffix: " min", label: "Scan Interval" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="ep-card p-6 text-center"
          >
            <div className="text-stat-xl text-accent">
              <Counter target={stat.value} suffix={stat.suffix} />
            </div>
            <div className="mt-2 text-xs text-text-muted uppercase tracking-wider">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ───── How It Works — Discover → Decide → Act → Track ───── */
const flowSteps = [
  {
    num: "01",
    title: "Discover",
    desc: "Claude AI scans 500+ markets every hour, detecting mispriced probabilities, volume spikes, and edges others miss.",
    accent: "#00F0A0",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Decide",
    desc: "Every opportunity is scored 0-100 by Claude. Only 80+ conviction picks with 15%+ edges are surfaced. You see the reasoning, the risk, and the reward.",
    accent: "#F0B000",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Act",
    desc: "One-click to bet on a pick, copy a trader, or play the $1 click-to-bet arcade. Execution flows through your Polymarket wallet — instant.",
    accent: "#60A5FA",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    ),
  },
  {
    num: "04",
    title: "Track",
    desc: "Watch your PnL, see which traders you've copied and how they're performing, and refine your strategy over time.",
    accent: "#A78BFA",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
];

function HowItWorks() {
  return (
    <Section id="how" className="mx-auto max-w-6xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent">
        How It Works
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl">
        One smooth loop. <span className="text-gradient">Zero friction.</span>
      </motion.h2>

      <div className="mt-16 grid gap-5 md:grid-cols-4">
        {flowSteps.map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="ep-card p-7 relative group"
          >
            {/* Connector line (not on last) */}
            {i < 3 && (
              <div className="hidden md:block absolute top-1/2 -right-3 w-6 border-t border-dashed border-ep-border-bright" />
            )}
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl mb-5"
              style={{ background: `${step.accent}15`, color: step.accent }}
            >
              {step.icon}
            </div>
            <span className="font-mono text-xs" style={{ color: step.accent }}>
              {step.num}
            </span>
            <h3 className="mt-1 text-lg font-display font-bold">{step.title}</h3>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ───── Features ───── */
const features = [
  {
    title: "AI Conviction Scoring",
    desc: "Every pick is scored 0-100 by Claude AI. Only 80+ conviction picks with 15%+ edges are surfaced. You see the reasoning, the risk/reward, and the stop-loss — not just a number.",
    accent: "#00F0A0",
    stat: "0-100",
    statLabel: "Score Range",
  },
  {
    title: "116+ Classified Traders",
    desc: "Traders discovered across micro, small, mid, and whale tiers. Degens, snipers, grinders — each classified by style and ranked by ROI.",
    accent: "#60A5FA",
    stat: "4 Tiers",
    statLabel: "Bankroll Ranges",
  },
  {
    title: "Real-Time Copy Signals",
    desc: "When a top trader opens a position, you see it instantly. One click to copy their trade. Track how your copied positions perform.",
    accent: "#F0B000",
    stat: "< 30s",
    statLabel: "Signal Delay",
  },
  {
    title: "One-Click Execution",
    desc: "See a pick or signal. Hit the button. Your bet flows directly to Polymarket through your connected wallet. No copy-pasting addresses.",
    accent: "#F472B6",
    stat: "3 sec",
    statLabel: "Pick to Trade",
  },
];

function Features() {
  return (
    <Section id="features" className="mx-auto max-w-6xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent">
        Features
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl">
        Everything you need. <span className="text-gradient">Nothing you don't.</span>
      </motion.h2>

      <div className="mt-16 grid gap-5 md:grid-cols-2">
        {features.map((f) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="ep-card p-5 sm:p-7 flex flex-col sm:flex-row gap-4 sm:gap-6"
          >
            <div className="flex-1">
              <h3 className="text-base sm:text-lg font-display font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className="font-mono text-stat-lg" style={{ color: f.accent }}>{f.stat}</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider mt-1">{f.statLabel}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ───── Live Dashboard Preview ───── */
function DashboardPreview() {
  return (
    <Section className="mx-auto max-w-6xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent">
        The Dashboard
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl">
        Your command center. <span className="text-gradient">Always alive.</span>
      </motion.h2>
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 max-w-xl text-text-secondary">
        Picks, copy signals, portfolio — all in one view. Real-time updates, no refreshing.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-12 relative"
      >
        {/* Mock dashboard frame */}
        <div className="rounded-2xl border border-ep-border bg-ep-surface overflow-hidden shadow-card">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-ep-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-loss/60" />
              <div className="w-3 h-3 rounded-full bg-conviction-medium/60" />
              <div className="w-3 h-3 rounded-full bg-profit/60" />
            </div>
            <span className="text-xs text-text-muted ml-2 font-mono">easypoly.lol/dashboard</span>
          </div>
          {/* Content */}
          <div className="p-4 sm:p-6 grid md:grid-cols-3 gap-4">
            {/* Pick card mockup */}
            <div className="md:col-span-2 ep-card p-4 sm:p-5 bg-ep-card">
              <div className="flex items-center gap-2 mb-3">
                <span className="live-dot" />
                <span className="text-xs font-semibold text-accent uppercase tracking-wider">Live Pick</span>
                <span className="ml-auto badge" style={{ color: '#00F0A0', background: 'rgba(0,240,160,0.12)' }}>
                  SCORE: 87
                </span>
              </div>
              <h4 className="font-display font-semibold">Will BTC close above $120K on March 1?</h4>
              <p className="text-sm text-text-secondary mt-1.5">Strong institutional accumulation pattern. ETF inflows at record highs.</p>
              <div className="grid grid-cols-4 gap-3 mt-4">
                {[
                  { label: 'Entry', val: '42¢' },
                  { label: 'Target', val: '68¢' },
                  { label: 'R/R', val: '3.2x' },
                  { label: 'Time', val: 'Days' },
                ].map(s => (
                  <div key={s.label} className="bg-ep-surface/50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
                    <div className="font-mono text-sm font-semibold text-text-primary mt-0.5">{s.val}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <div className="flex-1 text-center py-2.5 rounded-lg bg-profit/15 text-profit font-semibold text-sm">BET YES</div>
                <div className="flex-1 text-center py-2.5 rounded-lg bg-loss/15 text-loss font-semibold text-sm">BET NO</div>
              </div>
            </div>

            {/* Copy signals mockup */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                Live Copy Signals
              </div>
              {[
                { name: 'elkmonkey', tier: 'MID', action: '▲ YES', amount: '$2.8K', time: '12s ago', color: '#FBBF24' },
                { name: 'joosangyoo', tier: 'WHALE', action: '▼ NO', amount: '$15K', time: '1m ago', color: '#34D399' },
                { name: 'cryptodegen', tier: 'MICRO', action: '▲ YES', amount: '$45', time: '3m ago', color: '#A78BFA' },
              ].map((sig) => (
                <div key={sig.name} className="ep-card p-3 bg-ep-card">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${sig.color}15`, color: sig.color }}>
                      {sig.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-text-primary truncate">{sig.name}</span>
                        <span className="badge" style={{ color: sig.color, background: `${sig.color}18`, fontSize: '8px', padding: '1px 5px' }}>{sig.tier}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-mono font-semibold ${sig.action.includes('YES') ? 'text-profit' : 'text-loss'}`}>
                          {sig.action}
                        </span>
                        <span className="text-[10px] font-mono text-text-primary">{sig.amount}</span>
                        <span className="text-[10px] text-text-muted">{sig.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Glow behind */}
        <div className="absolute inset-0 -z-10 rounded-2xl bg-accent/[0.03] blur-[40px] scale-105" />
      </motion.div>
    </Section>
  );
}

/* ───── Pricing ───── */
const plans = [
  {
    name: "Beta",
    price: "$0",
    period: "free during beta",
    features: [
      "Unlimited AI picks",
      "Click-to-Bet Arcade with Snake game",
      "Real-time Telegram alerts",
      "Copy trading from 116+ traders",
      "Take-profit & stop-loss automation",
      "Standing orders & auto-execution",
      "Performance analytics",
      "Community access",
    ],
    cta: true,
    ctaLabel: "Get Started Free",
    ctaHref: "/dashboard",
    highlight: true,
    badge: "Free During Beta",
  },
];

function Pricing() {
  return (
    <Section id="pricing" className="mx-auto max-w-5xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent text-center">
        Pricing
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl text-center">
        Everything included. <span className="text-gradient">Free during beta.</span>
      </motion.h2>

      <div className="mt-16 grid gap-5 max-w-md mx-auto">
        {plans.map((plan) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={`ep-card p-7 relative ${plan.highlight ? 'border-accent/30 glow-sm' : ''}`}
          >
            {plan.badge && (
              <span className={`absolute -top-3 right-5 rounded-full px-3 py-1 text-[10px] font-bold ${plan.highlight ? 'bg-accent text-ep-bg' : 'bg-ep-border-bright text-text-secondary'}`}>
                {plan.badge}
              </span>
            )}
            <h3 className="text-lg font-display font-bold">{plan.name}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-stat-xl font-display">{plan.price}</span>
              <span className="text-text-muted text-sm">{plan.period}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-text-secondary">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 space-y-3">
              {plan.cta ? (
                <motion.a
                  href={plan.ctaHref}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`block w-full text-center rounded-xl py-3 text-sm font-bold transition ${
                    plan.highlight
                      ? 'bg-accent text-ep-bg hover:bg-accent/90'
                      : 'bg-ep-surface border border-ep-border text-text-primary hover:bg-ep-border/50'
                  }`}
                >
                  {plan.ctaLabel}
                </motion.a>
              ) : (
                <div className="rounded-xl bg-ep-surface py-3 text-center text-sm text-text-muted border border-ep-border">
                  {plan.ctaLabel || "Coming soon"}
                </div>
              )}
              {(plan as any).paymentNote && (
                <div className="flex items-center justify-center gap-2 text-[11px] text-text-muted">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                  {(plan as any).paymentNote}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ───── FAQ ───── */
const faqs = [
  {
    q: "How does EasyPoly find opportunities?",
    a: "Claude AI scans 500+ active Polymarket markets every hour. It compares its own probability estimates against market prices to find mispriced outcomes. Only picks with 15%+ edge and 80+ conviction (out of 100) make the cut. You see exactly what to buy, at what price, and why.",
  },
  {
    q: "Is my wallet safe?",
    a: "Your funds never leave your Polymarket wallet. EasyPoly connects via your CLOB API keys to place trades on your behalf — we never custody your funds. All credentials are validated on connect and you can revoke access anytime from your Polymarket account.",
  },
  {
    q: "How long does setup take?",
    a: "Under 2 minutes. Connect your wallet, paste your Polymarket API keys, and you're live. Our onboarding wizard walks you through every step. No coding or technical knowledge needed.",
  },
  {
    q: "What if a pick loses?",
    a: "Every pick includes a built-in stop-loss price so your downside is capped. The conviction score and risk/reward ratio help you size your bets appropriately. We track and display all picks transparently — wins and losses — so you can see real performance data.",
  },
  {
    q: "Is EasyPoly really free?",
    a: "Yes — everything is free during our beta period. Unlimited AI picks, copy trading, standing orders, and all features are fully unlocked. No credit card required.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Section id="faq" className="mx-auto max-w-3xl py-28">
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-sm font-semibold uppercase tracking-widest text-accent">FAQ</motion.p>
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-3 font-display text-3xl font-bold sm:text-4xl">Got questions?</motion.h2>
      <div className="mt-12 space-y-2">
        {faqs.map((faq, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="ep-card overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between px-6 py-5 text-left">
              <span className="font-medium text-text-primary pr-4">{faq.q}</span>
              <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="shrink-0 text-xl text-accent">+</motion.span>
            </button>
            <motion.div
              initial={false}
              animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <p className="px-6 pb-5 text-sm text-text-secondary leading-relaxed">{faq.a}</p>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ───── Final CTA ───── */
function FinalCTA() {
  return (
    <Section className="mx-auto max-w-4xl py-28 text-center mesh-gradient">
      <motion.h2 initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="font-display text-3xl font-bold sm:text-5xl">
        Play the arcade.
        <br />
        <span className="text-gradient">Or let AI trade for you.</span>
      </motion.h2>
      <motion.p initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-5 max-w-lg text-text-secondary text-lg">
        $1 click-to-bet with a live Snake game on the chart. Or AI-powered edge detection across 500+ markets. Two ways to trade Polymarket.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
        <motion.a
          href="/dashboard/bot"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn-accent inline-flex items-center gap-2 font-bold px-8 py-4 text-base"
        >
          Play the Arcade
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </motion.a>
        <CTAButton label="AI Smart Trading" />
      </motion.div>
    </Section>
  );
}

/* ───── Footer ───── */
function Footer() {
  return (
    <footer className="border-t border-ep-border px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo size="sm" />
        <div className="flex items-center gap-6 text-sm text-text-muted">
          <a href="/dashboard/bot" className="transition hover:text-text-primary">Arcade</a>
          <a href="/our-bets" className="transition hover:text-text-primary">Our Bets</a>
          <a href={TELEGRAM_ALERTS_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-text-primary">Free Alerts</a>
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-text-primary">Pro Bot</a>
          <a href={TELEGRAM_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-text-primary">Community</a>
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="transition hover:text-text-primary">Polymarket</a>
          <a href="mailto:hello@miyamotolabs.com" className="transition hover:text-text-primary">Contact</a>
        </div>
        <div className="flex flex-col items-center gap-1 text-xs text-text-muted sm:items-end">
          <p>© {new Date().getFullYear()} EasyPoly by Miyamoto Labs. Not financial advice.</p>
          <p className="text-text-muted/60">
            Powered by{" "}
            <a 
              href="https://polymarket.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-ep-green hover:underline"
            >
              Polymarket
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ───── Page ───── */
export default function Home() {
  // Capture referral code from URL param (?ref=EP-XXXX) for tracking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('ep-ref-code', ref.toUpperCase());
    }
  }, []);

  return (
    <main className="overflow-x-hidden">
      <Navbar />
      <Hero />
      <SocialProof />
      <ArcadeShowcase />
      <HowItWorks />
      <Features />
      <DashboardPreview />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
