import { NextResponse } from "next/server"

// DEPRECATED — DO NOT USE.
//
// This route expected the browser to fetch API-Football directly and POST
// the raw response here, then upserted every fixture (groups AND knockout)
// by the raw API id with no synthetic-slot handling at all — the same
// "ghost row" bug already fixed in lib/fixtures-sync.ts, but worse here
// since it would also duplicate real team data for knockout fixtures
// instead of just null-team ghosts.
//
// Nothing in the current UI calls this endpoint (no client-side fetch to
// API-Football + POST to /api/fixtures exists anymore) — it was already
// dead code. Left as a hard stop instead of migrating it to the central
// pipeline, since lib/fixtures-sync.ts's syncResultsFromApiFootball()
// already fetches API-Football server-side and covers this route's
// original purpose (plus group/team assignment via the full import in
// app/api/admin/sync/route.ts). Delete this file once confirmed nobody
// references it.

export async function POST() {
  return NextResponse.json(
    { error: "DEPRECATED: use /api/admin/sync (full import) or /api/admin/sync/results (results refresh) instead." },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.redirect("/admin")
}
