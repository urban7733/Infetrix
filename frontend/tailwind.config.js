/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: "hsl(var(--success))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        frosted: "0 0 0 1px rgba(255,255,255,0.08), 0 30px 60px rgba(0,0,0,0.55)",
        innerline: "inset 0 1px 0 rgba(255,255,255,0.16)",
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.2)",
        card: "0 4px 24px -4px rgb(0 0 0 / 0.45)",
        elevated: "0 24px 48px -12px rgb(0 0 0 / 0.55)",
        glow: "0 0 40px -10px hsl(var(--primary) / 0.45)",
      },
      fontFamily: {
        sans: ["Avenir Next", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      backgroundImage: {
        "grid-fine":
          "linear-gradient(to right, hsl(var(--grid) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--grid) / 0.5) 1px, transparent 1px)",
        "glow-conic":
          "conic-gradient(from 200deg at 50% 0%, hsl(var(--glow-1) / 0.15) 0deg, hsl(var(--glow-2) / 0.08) 140deg, hsl(var(--glow-3) / 0.12) 280deg, hsl(var(--glow-1) / 0.15) 360deg)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
        drift: "drift 22s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        drift: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "40%": { transform: "translate(1.5%, -1%) scale(1.03)" },
          "70%": { transform: "translate(-1%, 1.5%) scale(0.97)" },
        },
      },
    },
  },
  plugins: [],
};
