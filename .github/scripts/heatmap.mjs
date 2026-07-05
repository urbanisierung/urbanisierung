#!/usr/bin/env node
// Renders a GitHub contributions heatmap as fixed-width Unicode blocks and
// injects it into the CONTRIBUTIONS section of README.md.
//
// Data source: the GitHub GraphQL contributionsCollection API — the exact
// same data behind the profile contribution graph. Uses GITHUB_TOKEN
// (public contributions). Set a PAT with `read:user` as GH_TOKEN to also
// include private contributions.
//
// No dependencies — relies on Node 18+ global fetch.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const LOGIN = process.env.GH_LOGIN || "urbanisierung";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const README = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "README.md"
);

// Empty → most intense. `·` keeps the empty grid legible in monospace.
const BLOCKS = ["·", "░", "▒", "▓", "█"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = { 1: "Mon", 3: "Wed", 5: "Fri" };

async function fetchCalendar() {
  if (!TOKEN) throw new Error("No GH_TOKEN / GITHUB_TOKEN available.");
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays { contributionCount date weekday }
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
      "User-Agent": "urbanisierung-readme-heatmap",
    },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error("No contribution calendar in response.");
  return cal;
}

// Quartiles of non-zero days → intensity levels 1..4 (0 stays empty).
function levelFn(days) {
  const nonzero = days
    .map((d) => d.contributionCount)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const q = (p) => nonzero[Math.floor((nonzero.length - 1) * p)] || 0;
  const t = [q(0.25), q(0.5), q(0.75)];
  return (c) => {
    if (c <= 0) return 0;
    if (c <= t[0]) return 1;
    if (c <= t[1]) return 2;
    if (c <= t[2]) return 3;
    return 4;
  };
}

function render(cal) {
  const weeks = cal.weeks;
  const allDays = weeks.flatMap((w) => w.contributionDays);
  const level = levelFn(allDays);
  const cols = weeks.length;

  // 7 rows (weekday 0=Sun … 6=Sat), one column per week.
  const grid = Array.from({ length: 7 }, () => Array(cols).fill(" "));
  weeks.forEach((week, x) => {
    for (const day of week.contributionDays) {
      grid[day.weekday][x] = BLOCKS[level(day.contributionCount)];
    }
  });

  // Month header: place a 3-letter label at the column where a month starts.
  const header = Array(cols).fill(" ");
  let last = -1;
  weeks.forEach((week, x) => {
    const date = week.contributionDays[0]?.date;
    if (!date) return;
    const m = parseInt(date.slice(5, 7), 10) - 1;
    if (m !== last && x + 3 <= cols) {
      const label = MONTHS[m];
      for (let i = 0; i < 3; i++) header[x + i] = label[i];
      last = m;
    }
  });

  const pad = "    "; // man-page indentation
  const lead = "     "; // 3-char day label + 2 spaces
  const lines = [];
  lines.push(
    `${pad}${cal.totalContributions.toLocaleString("en-US")} contributions in the last year · updated daily`
  );
  lines.push("");
  lines.push(`${pad}${lead}${header.join("")}`);
  for (let r = 0; r < 7; r++) {
    const label = (DAY_LABELS[r] || "").padEnd(3, " ");
    lines.push(`${pad}${label}  ${grid[r].join("")}`);
  }
  lines.push("");
  lines.push(`${pad}Less ${BLOCKS.join("")} More`);
  return lines.join("\n");
}

function inject(readme, block) {
  // Replace everything between the CONTRIBUTIONS header and the man-page footer.
  const re = /(CONTRIBUTIONS\n)[\s\S]*?(\nADAM {2,}[^\n]*ADAM\(1\))/;
  if (!re.test(readme)) {
    throw new Error("Could not find CONTRIBUTIONS…footer anchors in README.md");
  }
  return readme.replace(re, `$1${block}\n$2`);
}

async function main() {
  const cal = await fetchCalendar();
  const block = render(cal);
  const before = readFileSync(README, "utf8");
  const after = inject(before, block);
  if (before === after) {
    console.log("Heatmap unchanged.");
    return;
  }
  writeFileSync(README, after);
  console.log("Heatmap updated.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
