// Design-pass contrast audit. Converts the OKLCH brand tokens to sRGB and
// checks WCAG contrast for the pairings the theme actually renders. Run:
//   node scripts/check-contrast.mjs
// Not wired into CI — a design-time guard so the deep-green + gold palette
// stays AA-legible if the tokens are ever re-tuned.

// --- OKLCH -> linear sRGB -> luminance (WCAG) ------------------------------
function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function relLuminance(L, C, h) {
  const lin = oklchToLinearSrgb(L, C, h).map((v) => Math.max(0, Math.min(1, v)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(fg, bg) {
  const l1 = relLuminance(...fg);
  const l2 = relLuminance(...bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Tokens as [L, C, h], mirroring :root in globals.css.
const T = {
  background: [0.985, 0.006, 145],
  foreground: [0.22, 0.018, 165],
  card: [1, 0, 0],
  cardForeground: [0.22, 0.018, 165],
  primary: [0.37, 0.072, 162],
  primaryForeground: [0.97, 0.02, 110],
  secondary: [0.955, 0.012, 150],
  secondaryForeground: [0.3, 0.04, 165],
  muted: [0.96, 0.009, 150],
  mutedForeground: [0.47, 0.02, 160],
  accent: [0.94, 0.016, 152],
  accentForeground: [0.3, 0.045, 165],
  gold: [0.79, 0.125, 89],
  goldForeground: [0.29, 0.05, 155],
  goldMuted: [0.95, 0.045, 90],
  affInput: [0.955, 0.03, 245],
  affInputFg: [0.3, 0.1, 250],
  affLocked: [0.955, 0.008, 150],
  affLockedFg: [0.34, 0.018, 160],
  affLinked: [0.95, 0.045, 150],
  affLinkedFg: [0.36, 0.09, 150],
  sidebar: [0.975, 0.009, 148],
  sidebarFg: [0.3, 0.02, 162],
  sidebarAccent: [0.93, 0.028, 155],
  sidebarAccentFg: [0.3, 0.06, 162],
  emeraldPositive: [0.5, 0.13, 155], // emerald-700-ish, StatTile positive
};

// [name, fg, bg, minimum] — 4.5 for body text, 3.0 for large/UI accents.
const PAIRS = [
  ["foreground on background", T.foreground, T.background, 4.5],
  ["foreground on card", T.cardForeground, T.card, 4.5],
  ["muted-foreground on card", T.mutedForeground, T.card, 4.5],
  ["muted-foreground on background", T.mutedForeground, T.background, 4.5],
  ["muted-foreground on muted", T.mutedForeground, T.muted, 4.5],
  ["primary-foreground on primary (button)", T.primaryForeground, T.primary, 4.5],
  ["secondary-foreground on secondary", T.secondaryForeground, T.secondary, 4.5],
  ["accent-foreground on accent (menu hover)", T.accentForeground, T.accent, 4.5],
  ["gold-foreground on gold (gold fill)", T.goldForeground, T.gold, 4.5],
  ["gold-foreground on gold-muted", T.goldForeground, T.goldMuted, 4.5],
  ["primary text on gold-muted", T.primary, T.goldMuted, 4.5],
  ["gold text on primary (gold on green)", T.gold, T.primary, 3.0],
  // NOTE: gold text on a LIGHT surface is intentionally NOT a supported pairing
  // (~1.9:1). On light, gold is decorative only — hairlines, rules, the wordmark
  // mark — never text. Gold-as-text lives on the emerald primary (above).
  ["blue input text on blue fill", T.affInputFg, T.affInput, 4.5],
  ["locked text on locked fill", T.affLockedFg, T.affLocked, 4.5],
  ["linked text on linked fill", T.affLinkedFg, T.affLinked, 4.5],
  ["sidebar-fg on sidebar", T.sidebarFg, T.sidebar, 4.5],
  ["sidebar active text on active bg", T.sidebarAccentFg, T.sidebarAccent, 4.5],
  ["emerald positive on card", T.emeraldPositive, T.card, 4.5],
  ["primary on background (link text)", T.primary, T.background, 4.5],
];

let fails = 0;
console.log("WCAG contrast audit — deep green + gold\n");
for (const [name, fg, bg, min] of PAIRS) {
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) fails++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${ratio.toFixed(2)}:1  (min ${min})  ${name}`
  );
}
console.log(`\n${fails === 0 ? "All pairs pass." : `${fails} pair(s) below target.`}`);
process.exit(fails === 0 ? 0 : 1);
