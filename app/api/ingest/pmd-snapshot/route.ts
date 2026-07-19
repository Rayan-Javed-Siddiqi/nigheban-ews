// app/api/ingest/pmd-snapshot/route.ts
//
// Step 3.1 — PMD: snapshot -> normalized parsing
//
// Flow:
//   1. Fetch the bulletin listing page (https://ffd.pmd.gov.pk/bulletin/bulletin)
//      with a browser User-Agent (confirmed working via PowerShell test — 200 OK,
//      plain server-rendered HTML, no headless browser required).
//   2. Parse the listing with cheerio to find today's bulletin link.
//      - Primary: match a link whose surrounding text contains today's date.
//      - Fallback: highest bulletin ID number, with a warning logged, in case
//        the listing page doesn't print per-entry dates the way we assumed.
//   3. Download the bulletin PDF (unblocked, per earlier testing).
//   4. Keep the raw PDF as a snapshot (audit/fallback), and parse text out of it
//      into a normalized `pmd_forecasts` row.
//   5. Any failure at any stage -> ingest_status = 'error' with a real message
//      and a non-200 response, per the Step 1.2 pattern. Success never
//      overwrites last_success_at on failure.
//
// NOTE: adjust the Supabase client import to match whatever helper the rest
// of your ingestion routes use (e.g. `lib/supabase/server.ts`) instead of the
// inline client below, if one already exists — this is written standalone so
// it's drop-in even if you haven't unified that yet.

import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
// pdf-parse is CommonJS; default import works with Next's bundler.
import pdfParse from "pdf-parse";

const LISTING_URL = "https://ffd.pmd.gov.pk/bulletin/bulletin";
const SOURCE_NAME = "pmd_ffd_bulletin";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function supabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function writeIngestStatus(
  supabase: ReturnType<typeof supabaseAdmin>,
  status: "ok" | "error",
  message?: string
) {
  const base: Record<string, unknown> = {
    source: SOURCE_NAME,
    status,
    checked_at: new Date().toISOString(),
  };
  if (status === "ok") {
    base.last_success_at = new Date().toISOString();
    base.error_message = null;
  } else {
    base.error_message = message ?? "Unknown error";
    // last_success_at intentionally omitted — do not overwrite on failure
  }

  const { error } = await supabase
    .from("ingest_status")
    .upsert(base, { onConflict: "source" });

  if (error) {
    // Don't let a logging failure mask the real error — just surface both.
    console.error("Failed to write ingest_status:", error.message);
  }
}

function todayCandidates(): string[] {
  // Build a few plausible date-string formats PMD might use, so the matcher
  // isn't brittle to one specific format (e.g. "19-07-2026", "19 July 2026",
  // "Jul 19, 2026").
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthShort = monthNames[now.getMonth()].slice(0, 3);

  return [
    `${dd}-${mm}-${yyyy}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd} ${monthNames[now.getMonth()]} ${yyyy}`,
    `${dd} ${monthShort} ${yyyy}`,
    `${monthShort} ${dd}, ${yyyy}`,
  ];
}

interface BulletinLink {
  id: number;
  href: string;
  matchedByDate: boolean;
}

function findTodaysBulletin(html: string): BulletinLink {
  const $ = cheerio.load(html);
  const candidates = todayCandidates();

  const links: { id: number; href: string; rowText: string }[] = [];

  $('a[href*="/bulletin/"][href*="/download"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const idMatch = href.match(/\/bulletin\/(\d+)\/download/);
    if (!idMatch) return;

    // Pull nearby text (the link's own text plus its containing row/list item)
    // to check for a printed date next to the entry.
    const rowText = $(el).closest("tr, li, div").text().trim() || $(el).text().trim();

    links.push({ id: Number(idMatch[1]), href, rowText });
  });

  if (links.length === 0) {
    throw new Error("No bulletin download links found on listing page — page structure may have changed.");
  }

  const dateMatch = links.find((l) =>
    candidates.some((c) => l.rowText.includes(c))
  );

  if (dateMatch) {
    return { id: dateMatch.id, href: dateMatch.href, matchedByDate: true };
  }

  // Fallback: highest ID. Log loudly — this is the fragile path.
  const highest = links.reduce((a, b) => (b.id > a.id ? b : a));
  console.warn(
    `[pmd-snapshot] Could not match today's date on listing page — ` +
    `falling back to highest bulletin ID (#${highest.id}). ` +
    `Verify this is actually correct; PMD may have skipped a number or posted twice today.`
  );
  return { id: highest.id, href: highest.href, matchedByDate: false };
}

function resolveUrl(href: string): string {
  return href.startsWith("http") ? href : new URL(href, LISTING_URL).toString();
}

// --- PDF field extraction -------------------------------------------------
// PMD's bulletin PDF layout is not yet confirmed against multiple samples.
// These patterns are a best-effort starting point — validate against several
// real bulletins (same caution as the Step 3.2 IRSA parser) and tighten them
// once you can see 3-5 real PDFs side by side.

interface ParsedBulletin {
  warningLevel: string | null;
  forecastText: string;
  rivers: { name: string; level: string | null; flow: string | null }[];
}

function parseBulletinText(text: string): ParsedBulletin {
  const warningMatch = text.match(
    /\b(Low|Medium|High|Very High|Exceptionally High)\s+Flood\b/i
  );

  // Rough table-row heuristic: "<River name> ... <number> cusecs"
  const riverRowRegex =
    /([A-Z][a-zA-Z\s]{2,30}?)\s+(?:at\s+[A-Za-z\s]+)?[:\-]?\s*([\d,]+)\s*(?:cusecs|ft)?/g;

  const rivers: ParsedBulletin["rivers"] = [];
  let m: RegExpExecArray | null;
  while ((m = riverRowRegex.exec(text)) !== null) {
    rivers.push({ name: m[1].trim(), level: null, flow: m[2].replace(/,/g, "") });
  }

  return {
    warningLevel: warningMatch ? warningMatch[0] : null,
    forecastText: text.slice(0, 4000), // cap stored narrative length
    rivers,
  };
}

// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = supabaseAdmin();

  try {
    // 1. Fetch listing page
    const listingRes = await fetch(LISTING_URL, {
      headers: { "User-Agent": BROWSER_UA },
      cache: "no-store",
    });
    if (!listingRes.ok) {
      throw new Error(`Listing page fetch failed: HTTP ${listingRes.status}`);
    }
    const listingHtml = await listingRes.text();

    // 2. Find today's bulletin link
    const bulletin = findTodaysBulletin(listingHtml);
    const pdfUrl = resolveUrl(bulletin.href);

    // 3. Download the PDF
    const pdfRes = await fetch(pdfUrl, {
      headers: { "User-Agent": BROWSER_UA },
      cache: "no-store",
    });
    if (!pdfRes.ok) {
      throw new Error(`Bulletin PDF fetch failed (id ${bulletin.id}): HTTP ${pdfRes.status}`);
    }
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // 4. Keep raw snapshot for audit/fallback
    const snapshotPath = `pmd/bulletin_${bulletin.id}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("raw-snapshots")
      .upload(snapshotPath, pdfBuffer, { contentType: "application/pdf" });
    if (uploadError) {
      // Don't fail the whole ingest over storage — log and continue, but note it.
      console.error("[pmd-snapshot] Snapshot upload failed:", uploadError.message);
    }

    // 5. Parse PDF text and extract fields
    const { text } = await pdfParse(pdfBuffer);
    const parsed = parseBulletinText(text);

    if (!parsed.forecastText.trim()) {
      throw new Error(`PDF parse produced empty text for bulletin id ${bulletin.id} — likely a scanned/image PDF or layout change.`);
    }

    // 6. Insert into normalized table
    const { error: insertError } = await supabase.from("pmd_forecasts").insert({
      bulletin_id: bulletin.id,
      matched_by_date: bulletin.matchedByDate,
      warning_level: parsed.warningLevel,
      forecast_text: parsed.forecastText,
      rivers: parsed.rivers, // jsonb column
      snapshot_path: uploadError ? null : snapshotPath,
      source_url: pdfUrl,
      fetched_at: new Date().toISOString(),
    });
    if (insertError) {
      throw new Error(`pmd_forecasts insert failed: ${insertError.message}`);
    }

    await writeIngestStatus(supabase, "ok");

    return NextResponse.json({
      ok: true,
      bulletinId: bulletin.id,
      matchedByDate: bulletin.matchedByDate,
      warningLevel: parsed.warningLevel,
      riversFound: parsed.rivers.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pmd-snapshot] Ingest failed:", message);
    await writeIngestStatus(supabase, "error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
