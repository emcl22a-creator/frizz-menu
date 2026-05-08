// ════════════════════════════════════════════════════════════════
// FRIZZ — Edge Function: iCal feed generator
// À déployer sur Supabase Edge Functions
// URL finale : https://iryhmfiuvpxbssjquxyo.supabase.co/functions/v1/ical?salon={salon_id}
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function formatIcalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcal(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const lines: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (i === 0) {
      lines.push(line.slice(0, 75));
      i = 75;
    } else {
      lines.push(" " + line.slice(i, i + 74));
      i += 74;
    }
  }
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const salonId = url.searchParams.get("salon");

    if (!salonId) {
      return new Response("Missing ?salon=<uuid> parameter", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(supabaseUrl, serviceKey);

    const { data: salon, error: salonErr } = await supa
      .from("frizz_ai_salons")
      .select("id, nom, ville")
      .eq("id", salonId)
      .single();

    if (salonErr || !salon) {
      return new Response("Salon not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    const { data: rdvs, error: rdvErr } = await supa
      .from("frizz_ai_rdv")
      .select(
        "id, date_heure, client_nom, client_telephone, statut, frizz_ai_barbiers(prenom), frizz_ai_prestations(nom, duree_minutes)"
      )
      .eq("salon_id", salonId)
      .order("date_heure", { ascending: true });

    if (rdvErr) throw rdvErr;

    const now = formatIcalDate(new Date());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Frizz//Salon RDV//FR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcal(`Frizz · ${salon.nom}`)}`,
      `X-WR-CALDESC:${escapeIcal(`Rendez-vous pris par Frizz pour ${salon.nom}`)}`,
      "X-WR-TIMEZONE:Europe/Paris",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
    ];

    for (const r of (rdvs || [])) {
      const start = new Date(r.date_heure);
      const duree = (r.frizz_ai_prestations as any)?.duree_minutes || 30;
      const end = new Date(start.getTime() + duree * 60 * 1000);

      const barbierPrenom = (r.frizz_ai_barbiers as any)?.prenom;
      const prestationNom = (r.frizz_ai_prestations as any)?.nom;

      const summary = barbierPrenom
        ? `${r.client_nom || "Client"} — ${prestationNom || "RDV"} (${barbierPrenom})`
        : `${r.client_nom || "Client"} — ${prestationNom || "RDV"}`;

      const descParts: string[] = [];
      if (prestationNom) descParts.push(`Prestation : ${prestationNom}`);
      if (barbierPrenom) descParts.push(`Barbier : ${barbierPrenom}`);
      if (r.client_telephone) descParts.push(`Téléphone : ${r.client_telephone}`);
      descParts.push(`Statut : ${r.statut === "a_confirmer" ? "À confirmer" : "Confirmé"}`);
      descParts.push("");
      descParts.push("Pris automatiquement par Frizz");

      const locationStr = salon.ville
        ? `${salon.nom}, ${salon.ville}`
        : salon.nom;

      const eventLines = [
        "BEGIN:VEVENT",
        `UID:rdv-${r.id}@frizz-instant.com`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatIcalDate(start)}`,
        `DTEND:${formatIcalDate(end)}`,
        `SUMMARY:${escapeIcal(summary)}`,
        `DESCRIPTION:${escapeIcal(descParts.join("\n"))}`,
        `LOCATION:${escapeIcal(locationStr)}`,
        `STATUS:${r.statut === "a_confirmer" ? "TENTATIVE" : "CONFIRMED"}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ];
      for (const line of eventLines) {
        lines.push(foldLine(line));
      }
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n") + "\r\n";

    return new Response(icsContent, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="frizz-${salonId.slice(0, 8)}.ics"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("iCal generation error:", err);
    return new Response("Error generating iCal feed", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
