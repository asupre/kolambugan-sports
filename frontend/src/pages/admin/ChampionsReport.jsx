import { useEffect, useMemo, useState } from "react";
import { Download, Printer, Trophy } from "lucide-react";
import { api } from "../../api";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { formatPrize } from "../../lib/peso";
import { cn } from "../../lib/utils";

// The champions archive as a report (Oct 2026, suggested by the thesis adviser):
// every recorded title, grouped Sports / Esports / Board games, printable and
// downloadable as CSV. Champion.sport is free text, so a title is grouped by
// matching its sport NAME to a League Setup sport's type; a name that no longer
// matches any sport goes under "Other".

const DIVISION_LABEL = {
  open: "Open", boys: "Boys", girls: "Girls",
  under15: "Under 15", under30: "Under 30",
};
const divisionText = (d) => DIVISION_LABEL[d] || d || "";

const CATEGORIES = [
  { key: "physical", label: "Sports" },
  { key: "esports", label: "Esports" },
  { key: "board", label: "Board games" },
  { key: "other", label: "Other" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Barangays ranked by titles; ties share a rank (1, 1, 3).
function leaderboard(titles) {
  const map = new Map();
  for (const t of titles) {
    const key = norm(t.barangay);
    const row = map.get(key) || { name: t.barangay, total: 0, physical: 0, esports: 0, board: 0, other: 0 };
    row.total += 1;
    row[t.category] += 1;
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1; });
  return rows;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(titles) {
  const header = ["Category", "Sport", "Division", "Year", "Barangay", "Team", "MVP", "Prize", "Notes"];
  const lines = titles.map((t) => [
    CATEGORY_LABEL[t.category], t.sport, divisionText(t.division), t.year, t.barangay,
    t.teamName, t.mvp, formatPrize(t.prize), t.notes,
  ].map(csvCell).join(","));
  // BOM so Excel reads "Sto. Niño" as UTF-8.
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `champions-archive-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SportTable({ sport, titles }) {
  return (
    <Card className="print-block print-plain mb-6">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle>{sport}</CardTitle>
          <span className="text-muted-foreground text-xs">
            {titles.length} title{titles.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm border rounded-lg overflow-hidden min-w-[36rem]">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-16">Year</th>
                <th className="px-3 py-2 font-medium w-24">Division</th>
                <th className="px-3 py-2 font-medium">Champion</th>
                <th className="px-3 py-2 font-medium">MVP</th>
                <th className="px-3 py-2 font-medium w-28 text-right">Prize</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {titles.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 tabular-nums font-medium">{t.year}</td>
                  <td className="px-3 py-2 text-muted-foreground">{divisionText(t.division) || "-"}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{t.barangay}</span>
                    {t.teamName && norm(t.teamName) !== norm(t.barangay) && (
                      <span className="text-muted-foreground"> · {t.teamName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{t.mvp || <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPrize(t.prize) || <span className="text-muted-foreground">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardTable({ rows, showOther }) {
  return (
    <Card className="print-block print-plain mb-6">
      <CardHeader>
        <CardTitle>Titles by barangay</CardTitle>
        <CardDescription>Every recorded title, all years.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm border rounded-lg overflow-hidden min-w-[30rem]">
            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Barangay</th>
                <th className="px-3 py-2 font-medium text-center w-16">Sports</th>
                <th className="px-3 py-2 font-medium text-center w-16">Esports</th>
                <th className="px-3 py-2 font-medium text-center w-20">Board games</th>
                {showOther && <th className="px-3 py-2 font-medium text-center w-16">Other</th>}
                <th className="px-3 py-2 font-medium text-center w-16">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {r.rank === 1 ? <Trophy className="size-3.5 text-amber-500" /> : r.rank}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{r.physical || "-"}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{r.esports || "-"}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{r.board || "-"}</td>
                  {showOther && <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{r.other || "-"}</td>}
                  <td className="px-3 py-2 text-center tabular-nums font-semibold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// One category's titles, one table per sport (A-Z), newest year first.
function CategoryBlock({ label, titles }) {
  const bySport = new Map();
  for (const t of titles) {
    if (!bySport.has(t.sport)) bySport.set(t.sport, []);
    bySport.get(t.sport).push(t);
  }
  const sports = [...bySport.keys()].sort((a, b) => a.localeCompare(b));
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold mb-3">{label}</h2>
      {sports.map((s) => (
        <SportTable key={s} sport={s}
          titles={bySport.get(s).sort((a, b) => b.year - a.year || divisionText(a.division).localeCompare(divisionText(b.division)))} />
      ))}
    </div>
  );
}

export default function ChampionsReport({ printedOn }) {
  const [titles, setTitles] = useState([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [champ, sp] = await Promise.all([api("/api/champions"), api("/api/sports?all=1")]);
        if (!alive) return;
        const categoryOf = new Map((sp.sports || []).map((s) => [norm(s.name), s.category || "physical"]));
        setTitles((champ.champions || []).map((c) => ({ ...c, category: categoryOf.get(norm(c.sport)) || "other" })));
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => leaderboard(titles), [titles]);
  const present = CATEGORIES.filter((c) => titles.some((t) => t.category === c.key));
  const shownCats = category === "all" ? present : present.filter((c) => c.key === category);
  const years = titles.map((t) => t.year);
  const span = years.length ? (Math.min(...years) === Math.max(...years) ? `${years[0]}` : `${Math.min(...years)}-${Math.max(...years)}`) : "";

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive" className="no-print">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="no-print">
        <CardContent className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-semibold mb-1">Champions archive</h2>
            <p className="text-muted-foreground text-sm">
              Every recorded champion, grouped into sports, esports and board games, with the
              barangays ranked by titles. Printing or downloading includes every category, not
              just the one on screen.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => downloadCsv(titles)} disabled={!titles.length}>
              <Download /> Download CSV
            </Button>
            <Button onClick={() => window.print()} disabled={!titles.length}>
              <Printer /> Print / Save as PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="hidden print-only mb-4">
        <h1 className="text-xl font-semibold">Inter-Barangay Sports League: Champions Archive</h1>
        <p className="text-sm text-muted-foreground">
          {span && `${span} · `}{titles.length} title{titles.length === 1 ? "" : "s"} · Municipality of Kolambugan · Printed {printedOn}
        </p>
      </div>

      {titles.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            No champions recorded yet. Add them from the Champions page.
          </CardContent>
        </Card>
      ) : (
        <>
          <LeaderboardTable rows={rows} showOther={present.some((c) => c.key === "other")} />

          <div className="flex gap-4 overflow-x-auto scrollbar-thin border-b no-print">
            {[{ key: "all", label: "All" }, ...present].map((c) => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={cn(
                  "px-1 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition",
                  category === c.key ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
                )}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="screen-only">
            {shownCats.map((c) => (
              <CategoryBlock key={c.key} label={c.label} titles={titles.filter((t) => t.category === c.key)} />
            ))}
          </div>
          <div className="hidden print-only">
            {present.map((c) => (
              <CategoryBlock key={c.key} label={c.label} titles={titles.filter((t) => t.category === c.key)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
