import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Core palette — dark luxury trading terminal
        ep: {
          bg: "#08090E",
          surface: "#0F1118",
          card: "#151823",
          "card-hover": "#1A1E2E",
          border: "#1E2235",
          "border-bright": "#2A3050",
        },
        // Text hierarchy
        text: {
          primary: "#E8ECF4",
          secondary: "#8B92A8",
          muted: "#505672",
          inverse: "#08090E",
        },
        // Accent — electric green
        accent: {
          DEFAULT: "#00F0A0",
          bright: "#00FFB0",
          dim: "#00C080",
          muted: "rgba(0, 240, 160, 0.15)",
          glow: "rgba(0, 240, 160, 0.25)",
        },
        // Conviction score spectrum
        conviction: {
          high: "#00F0A0",      // 80-100
          "high-bg": "rgba(0, 240, 160, 0.12)",
          medium: "#F0B000",    // 50-79
          "medium-bg": "rgba(240, 176, 0, 0.12)",
          low: "#FF4060",       // 0-49
          "low-bg": "rgba(255, 64, 96, 0.12)",
        },
        // PnL colors
        profit: "#00F0A0",
        loss: "#FF4060",
        // Tier badge colors
        tier: {
          micro: "#A78BFA",     // violet
          small: "#60A5FA",     // blue
          mid: "#FBBF24",       // amber
          whale: "#34D399",     // emerald
        },
        // Style badge colors
        style: {
          degen: "#F472B6",     // pink
          sniper: "#F97316",    // orange
          grinder: "#818CF8",   // indigo
          whale: "#22D3EE",     // cyan
        },
      },
      fontFamily: {
        display: ["'Clash Display'", "'General Sans'", "Inter", "system-ui", "sans-serif"],
        body: ["'General Sans'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'SF Mono'", "monospace"],
      },
      fontSize: {
        // Financial number sizes
        "stat-xl": ["3rem", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "700" }],
        "stat-lg": ["2rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "600" }],
        "stat-md": ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "stat-sm": ["0.875rem", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "500" }],
      },
      borderRadius: {
        "xl": "12px",
        "2xl": "16px",
        "3xl": "20px",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        "glow": "0 0 30px rgba(0, 240, 160, 0.15), 0 0 60px rgba(0, 240, 160, 0.05)",
        "glow-sm": "0 0 15px rgba(0, 240, 160, 0.1)",
        "glow-lg": "0 0 50px rgba(0, 240, 160, 0.2), 0 0 100px rgba(0, 240, 160, 0.08)",
        "card": "0 4px 24px rgba(0, 0, 0, 0.3)",
        "card-hover": "0 8px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(0, 240, 160, 0.06)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "tick-up": "tickUp 0.6s ease-out",
        "tick-down": "tickDown 0.6s ease-out",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "live-dot": "liveDot 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        tickUp: {
          "0%": { color: "inherit" },
          "50%": { color: "#00F0A0" },
          "100%": { color: "inherit" },
        },
        tickDown: {
          "0%": { color: "inherit" },
          "50%": { color: "#FF4060" },
          "100%": { color: "inherit" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 15px rgba(0, 240, 160, 0.1)" },
          "50%": { boxShadow: "0 0 30px rgba(0, 240, 160, 0.25)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        liveDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.8)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
