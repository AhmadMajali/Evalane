import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";

// ── Fonts injected once ───────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: "#060C18",
  bg2: "#0C1426",
  bg3: "#111C35",
  yellow: "#F5C842",
  yellow2: "#D4A017",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#7C6EFF",
  green: "#10B981",
  white: "#FFFFFF",
  off: "#C8D4E8",
  muted: "#617490",
  border: "rgba(245,200,66,0.12)",
  border2: "rgba(255,255,255,0.06)",
};

// ── Fade-in hook ──────────────────────────────────────────────────────────────
function useFade(delay = 0) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, {
    opacity: vis ? 1 : 0,
    transform: vis ? "translateY(0)" : "translateY(24px)",
    transition: `opacity .7s ease ${delay}s, transform .7s ease ${delay}s`,
  }];
}

// ── Global styles (injected once) ─────────────────────────────────────────────
const globalCSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: ${T.bg}; color: ${T.white}; font-family: 'DM Sans', sans-serif;
         overflow-x: hidden; line-height: 1.6; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.yellow2}; border-radius: 2px; }
  @keyframes scan {
    0%   { background-position: 0 0; }
    100% { background-position: 0 100px; }
  }
`;
if (!document.getElementById("evalane-global")) {
  const s = document.createElement("style");
  s.id = "evalane-global";
  s.textContent = globalCSS;
  document.head.appendChild(s);
}

// ── GridBg ────────────────────────────────────────────────────────────────────
function GridBg() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: .05 }}>
        <defs>
          <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M 56 0 L 0 0 0 56" fill="none" stroke={T.yellow} strokeWidth=".7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <div style={{ position: "absolute", top: "-15%", left: "-10%", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, rgba(245,200,66,0.07) 0%, transparent 65%)` }} />
      <div style={{ position: "absolute", bottom: "5%", right: "-10%", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, rgba(245,158,11,0.05) 0%, transparent 65%)` }} />
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(245,200,66,0.012) 2px, rgba(245,200,66,0.012) 4px)`, animation: "scan 8s linear infinite" }} />
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsub();
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, height: 62,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 5%", transition: "all .3s",
      background: scrolled ? "rgba(6,12,24,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? `1px solid ${T.border}` : "1px solid transparent",
    }}>
      <a href="#hero" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: `linear-gradient(135deg,${T.yellow},${T.yellow2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#060C18" strokeWidth="2.5" strokeLinecap="round" width="15" height="15">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <path d="M5.64 5.64l2.83 2.83M15.54 15.54l2.83 2.83M18.36 5.64l-2.83 2.83M8.46 15.54l-2.83 2.83" />
          </svg>
        </div>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: ".08em", color: T.white }}>
          EVAL<span style={{ color: T.yellow }}>ANE</span>
        </span>
      </a>

      <div style={{ display: "flex", gap: 8 }}>
        {[["Home", "/"], ["Simulation", user ? "/simulation" : "/login"]].map(([label, path]) => (
          <button key={label} onClick={() => navigate(path)} style={{ color: T.muted, fontSize: 14, fontWeight: 500, background: "none", border: "none", padding: "6px 14px", borderRadius: 7, transition: "all .2s", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            onMouseEnter={e => { e.currentTarget.style.color = T.white; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = "transparent"; }}>
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          if (user) {
            signOut(auth);
            navigate("/");
          } else {
            navigate("/login");
          }
        }}
        style={{
          padding: "7px 20px",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: "transparent",
          color: T.white,
          fontWeight: 600,
          cursor: "pointer"
        }}
      >
        {user ? "Logout" : "Login"}
      </button>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const [user, setUser] = useState(null);

useEffect(() => {
  const unsub = onAuthStateChanged(auth, (currentUser) => {
    setUser(currentUser);
  });

  return () => unsub();
}, []);
  const navigate = useNavigate();
  const [ref, style] = useFade(0);
  return (
    <section id="hero" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 5% 60px", position: "relative", textAlign: "center" }}>
      <div ref={ref} style={{ ...style, maxWidth: 1100, width: "100%" }}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(36px, 5.5vw, 76px)", lineHeight: 1, letterSpacing: ".02em", color: T.white, marginBottom: 24 }}>
          INTELLIGENT SIGNALS,<br />
          <em style={{ color: T.yellow, fontStyle: "normal" }}>SMARTER </em>
          <span style={{ color: T.yellow }}>CITIES.</span>
        </h1>
        <p style={{ color: T.off, fontSize: 17, lineHeight: 1.75, margin: "0 auto 40px", maxWidth: 560 }}>
          Predict congestion, optimize signals, and improve traffic efficiency in real time.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate(user ? "/simulation" : "/login")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 26px", borderRadius: 9, background: T.yellow, color: "#060C18", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", border: "none", transition: "all .2s" }}

            onMouseEnter={e => { e.currentTarget.style.background = "#FFD700"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(245,200,66,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.yellow; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            View Simulation
          </button>
          <a href="#about" style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 26px", borderRadius: 9, background: "transparent", border: `1px solid ${T.border2}`, color: T.white, fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, cursor: "pointer", transition: "all .2s", textDecoration: "none" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,200,66,0.4)"; e.currentTarget.style.color = T.yellow; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.white; e.currentTarget.style.transform = "translateY(0)"; }}>
            Explore Features
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </a>
        </div>
      </div>
    </section>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
function SectionLabel({ text }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 20, border: `1px solid ${T.border}`, background: "rgba(245,200,66,0.04)", marginBottom: 18 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.yellow, display: "inline-block" }} />
      <span style={{ color: T.yellow, fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>{text}</span>
    </div>
  );
}

// ── About ─────────────────────────────────────────────────────────────────────
function About() {
  const [r1, s1] = useFade(0);
  const [r2, s2] = useFade(0.15);

  const cards = [
    { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", title: "Fixed Signals Cause Gridlock", desc: "Traditional lights follow rigid schedules, creating unnecessary congestion on busy lanes while empty lanes get equal time.", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { bg: "rgba(245,200,66,0.08)", border: "rgba(245,200,66,0.18)", title: "Simulation for Safe Testing", desc: "Test any traffic scenario — from normal flow to high-stress accidents — in a virtual four-lane intersection, risk-free.", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5C842" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg> },
    { bg: "rgba(124,110,255,0.1)", border: "rgba(124,110,255,0.2)", title: "AI-Powered Traffic Decisions", desc: "Three intelligent models analyze lane data to predict congestion, decide signal priority, and calculate ideal green durations.", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C6EFF" strokeWidth="2" strokeLinecap="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" /></svg> },
  ];

  return (
    <section id="about" style={{ padding: "96px 5%" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
        <div ref={r1} style={s1}>
          <SectionLabel text="The Problem" />
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 50, lineHeight: 1.05, letterSpacing: ".02em", color: T.white, marginBottom: 14 }}>
            TRAFFIC THAT<br /><em style={{ color: T.yellow, fontStyle: "normal" }}>THINKS AHEAD.</em>
          </h2>
          <p style={{ color: T.off, fontSize: 16, lineHeight: 1.7, maxWidth: 520 }}>
            Evalane uses AI-powered simulation to predict congestion and support smarter traffic decisions.
          </p>
        </div>
        <div ref={r2} style={{ ...s2, display: "flex", flexDirection: "column", gap: 14 }}>
          {cards.map(({ title, desc, icon, bg, border }) => (
            <div key={title}
              style={{ display: "flex", gap: 14, padding: 20, background: T.bg2, border: `1px solid ${T.border2}`, borderRadius: 12, transition: "all .25s", cursor: "default" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,200,66,0.25)"; e.currentTarget.style.background = T.bg3; e.currentTarget.style.transform = "translateX(4px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.background = T.bg2; e.currentTarget.style.transform = "translateX(0)"; }}>
              <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 9, background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
              <div>
                <div style={{ color: T.white, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                <div style={{ color: T.muted, fontSize: 13, lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Benefits ──────────────────────────────────────────────────────────────────
function BenefitCard({ title, desc, icon, bg, border, delay }) {
  const [ref, style] = useFade(delay);
  return (
    <div ref={ref} style={{ ...style, padding: "24px 18px", borderRadius: 12, background: T.bg2, border: `1px solid ${T.border2}`, textAlign: "center", transition: "all .3s", cursor: "default" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,200,66,0.3)"; e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.background = T.bg3; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.background = T.bg2; }}>
      <div style={{ color: T.white, fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 12 }}>{title}</div>
      <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function Benefits() {
  const [ref, style] = useFade(0);
  const items = [
    { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.18)", title: "Reduce Congestion", desc: "Predictive AI clears bottlenecks before they build up", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg> },
    { bg: "rgba(245,200,66,0.08)", border: "rgba(245,200,66,0.18)", title: "Smarter Green Timing", desc: "Each lane gets exactly the green time it needs", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5C842" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
    { bg: "rgba(124,110,255,0.1)", border: "rgba(124,110,255,0.18)", title: "Faster Traffic Flow", desc: "Optimized sequences keep cars moving continuously", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C6EFF" strokeWidth="2" strokeLinecap="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg> },
    { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.18)", title: "Better Decisions", desc: "Data-driven insights replace guesswork entirely", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44" /></svg> },
    { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.18)", title: "Smart Monitoring", desc: "Live dashboards give full visibility at all times", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> },
  ];
  return (
    <section id="benefits" style={{ padding: "96px 5%", textAlign: "center" }}>
      <div ref={ref} style={style}>
        <div style={{ display: "flex", justifyContent: "center" }}><SectionLabel text="Why Evalane" /></div>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 50, lineHeight: 1.05, letterSpacing: ".02em", color: T.white, marginBottom: 14 }}>
          BUILT FOR <em style={{ color: T.yellow, fontStyle: "normal" }}>RESULTS.</em>
        </h2>
        <p style={{ color: T.off, fontSize: 16, lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
          Measurable improvements to how traffic managers make decisions.
        </p>
      </div>
      <div style={{ maxWidth: 1100, margin: "56px auto 0", display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14 }}>
        {items.map(({ title, desc, icon, bg, border }, i) => (
          <BenefitCard key={title} title={title} desc={desc} icon={icon} bg={bg} border={border} delay={i * 0.04} />
        ))}
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${T.border2}`, padding: "52px 5% 32px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg,${T.yellow},${T.yellow2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#060C18" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </div>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: ".08em", color: T.white }}>
              EVAL<em style={{ color: T.yellow, fontStyle: "normal" }}>ANE</em>
            </span>
          </div>
          <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.65, maxWidth: 240 }}>
            AI-powered traffic signal optimization. Smarter decisions, faster cities, fewer jams.
          </p>
        </div>
        <div style={{ paddingTop: 24, borderTop: `1px solid ${T.border2}` }}>
          <span style={{ color: T.muted, fontSize: 12 }}>© 2026 Evalane</span>
        </div>
      </div>
    </footer>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ background: T.bg, minHeight: "100vh", position: "relative" }}>
      <GridBg />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Navbar />
        <Hero />
        <About />
        <Benefits />
        <Footer />
      </div>
    </div>
  );
}