#!/usr/bin/env node
// Regenerates the live region of README.md from GitHub data, rendered as
// fixed-width ASCII/Unicode to match the man-page aesthetic.
//
// Sections: LANGUAGES (bars) · MOMENTUM (sparkline) · CONTRIBUTIONS (heatmap)
//           · LATEST (recent repos) · GENERATIVE (daily deterministic art)
//
// Data: GitHub GraphQL. Uses GITHUB_TOKEN (public data). Set a PAT as
// GH_TOKEN to include private contributions/repos. No dependencies (Node 18+).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const LOGIN = process.env.GH_LOGIN || "urbanisierung";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const README = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "README.md");

const PAD = "    "; // man-page body indentation
const START = "LIVE — auto-updated daily"; // stable anchor; region runs to footer
const HEAT = ["·", "░", "▒", "▓", "█"];
const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = { 1: "Mon", 3: "Wed", 5: "Fri" };

// ─── data ────────────────────────────────────────────────────────────────
async function fetchData() {
  if (!TOKEN) throw new Error("No GH_TOKEN / GITHUB_TOKEN available.");
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { contributionCount date weekday } }
          }
        }
        repositories(first: 100, isFork: false, ownerAffiliations: OWNER,
                     orderBy: { field: PUSHED_AT, direction: DESC }) {
          nodes {
            name pushedAt stargazerCount isPrivate
            primaryLanguage { name }
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name } }
            }
          }
        }
      }
    }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "urbanisierung-readme",
    },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  const user = json.data?.user;
  if (!user) throw new Error("No user in response.");
  return {
    calendar: user.contributionsCollection.contributionCalendar,
    repos: (user.repositories.nodes || []).filter((r) => !r.isPrivate),
  };
}

// ─── LANGUAGES ─────────────────────────────────────────────────────────────
function renderLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    for (const e of repo.languages?.edges || []) {
      totals.set(e.node.name, (totals.get(e.node.name) || 0) + e.size);
    }
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  const grand = sorted.reduce((s, [, v]) => s + v, 0);
  const top = sorted.slice(0, 5);
  const otherSum = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const rows = top.map(([name, size]) => [name, size]);
  if (otherSum > 0) rows.push(["Other", otherSum]);

  const BAR = 22;
  const lines = ["LANGUAGES"];
  for (const [name, size] of rows) {
    const pct = (size / grand) * 100;
    const fill = Math.round((size / grand) * BAR);
    const bar = "█".repeat(fill) + "░".repeat(BAR - fill);
    lines.push(`${PAD}${name.padEnd(12)}${bar}  ${String(Math.round(pct)).padStart(3)}%`);
  }
  return lines.join("\n");
}

// ─── MOMENTUM (weekly commit sparkline) ─────────────────────────────────────
function renderMomentum(calendar) {
  const weekly = calendar.weeks.map((w) =>
    w.contributionDays.reduce((s, d) => s + d.contributionCount, 0)
  );
  const last = weekly.slice(-26);
  if (!last.length) return null;
  const min = Math.min(...last), max = Math.max(...last);
  const span = max - min || 1;
  const spark = last
    .map((v) => SPARK[Math.round(((v - min) / span) * (SPARK.length - 1))])
    .join("");
  return `MOMENTUM\n${PAD}${spark}   commits · last 26 weeks (${min}–${max}/wk)`;
}

// ─── CONTRIBUTIONS (heatmap) ────────────────────────────────────────────────
function renderHeatmap(calendar) {
  const weeks = calendar.weeks;
  const nz = weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => d.contributionCount)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const q = (p) => nz[Math.floor((nz.length - 1) * p)] || 0;
  const t = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (c <= 0 ? 0 : c <= t[0] ? 1 : c <= t[1] ? 2 : c <= t[2] ? 3 : 4);

  const cols = weeks.length;
  const grid = Array.from({ length: 7 }, () => Array(cols).fill(" "));
  weeks.forEach((w, x) => {
    for (const d of w.contributionDays) grid[d.weekday][x] = HEAT[level(d.contributionCount)];
  });

  const header = Array(cols).fill(" ");
  let last = -1;
  weeks.forEach((w, x) => {
    const date = w.contributionDays[0]?.date;
    if (!date) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m !== last && x + 3 <= cols) {
      for (let i = 0; i < 3; i++) header[x + i] = MONTHS[m][i];
      last = m;
    }
  });

  const lines = ["CONTRIBUTIONS"];
  lines.push(`${PAD}${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year`);
  lines.push("");
  lines.push(`${PAD}     ${header.join("")}`);
  for (let r = 0; r < 7; r++) {
    lines.push(`${PAD}${(DAY_LABELS[r] || "").padEnd(3)}  ${grid[r].join("")}`);
  }
  lines.push("");
  lines.push(`${PAD}Less ${HEAT.join("")} More`);
  return lines.join("\n");
}

// ─── LATEST (recent repos) ──────────────────────────────────────────────────
function renderLatest(repos) {
  const recent = repos.slice(0, 6);
  if (!recent.length) return null;
  const lines = ["LATEST"];
  for (const r of recent) {
    const date = (r.pushedAt || "").slice(0, 10);
    const name = r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name;
    const lang = (r.primaryLanguage?.name || "—");
    lines.push(`${PAD}${date}  ${name.padEnd(22)} ${lang.padEnd(12)} ★${r.stargazerCount}`);
  }
  return lines.join("\n");
}

// ─── GENERATIVE (deterministic daily ASCII plasma) ──────────────────────────
function renderGenerative(dateStr) {
  // Seed a PRNG from the date so the piece is stable per day, fresh each day.
  let h = 2166136261;
  for (const ch of dateStr) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  const rng = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const RAMP = [" ", "·", ":", "+", "*", "#", "▓", "█"];
  const W = 53, H = 6;
  const fx = 0.18 + rng() * 0.30, fy = 0.28 + rng() * 0.45, fd = 0.10 + rng() * 0.22;
  const px = rng() * Math.PI * 2, py = rng() * Math.PI * 2, pd = rng() * Math.PI * 2;

  const lines = [`GENERATIVE — seed ${dateStr}`];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const v =
        Math.sin(x * fx + px) +
        Math.sin(y * fy + py) +
        Math.sin((x + y) * fd + pd);
      const n = (v + 3) / 6; // → 0..1
      row += RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(n * RAMP.length)))];
    }
    lines.push(`${PAD}${row.replace(/\s+$/, "")}`);
  }
  return lines.join("\n");
}

// ─── assemble + inject ──────────────────────────────────────────────────────
export function buildLiveBlock(data, dateStr) {
  const parts = [
    renderLanguages(data.repos),
    renderMomentum(data.calendar),
    renderHeatmap(data.calendar),
    renderLatest(data.repos),
    renderGenerative(dateStr),
  ].filter(Boolean);
  return "\n" + parts.join("\n\n") + "\n";
}

export function inject(readme, block) {
  const re = new RegExp(`(${START}\\n)[\\s\\S]*?(\\nADAM {2,}[^\\n]*ADAM\\(1\\))`);
  if (!re.test(readme)) throw new Error(`Could not find "${START}" … footer anchors.`);
  return readme.replace(re, `$1${block}$2`);
}

async function main() {
  const data = await fetchData();
  const dateStr = (process.env.GEN_DATE || new Date().toISOString().slice(0, 10));
  const before = readFileSync(README, "utf8");
  const after = inject(before, buildLiveBlock(data, dateStr));
  if (before === after) return console.log("Profile unchanged.");
  writeFileSync(README, after);
  console.log("Profile updated.");
}

// Run only when executed directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
