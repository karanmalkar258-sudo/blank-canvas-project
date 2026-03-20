import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

const CRICAPI_KEY = Deno.env.get("CRICAPI_KEY");
const CRICAPI_BASE = "https://api.cricapi.com/v1";

// In-memory cache: { data, fetchedAt }
let cache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds — respect free-tier rate limits

async function fetchWithRetry(url: string, retries = 3, delayMs = 1500): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000); // 15s timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      console.warn(`CricAPI attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("All retries exhausted");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!CRICAPI_KEY) {
      return new Response(
        JSON.stringify({ error: "CRICAPI_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint") ?? "currentMatches";
    const matchId = url.searchParams.get("matchId");

    // For currentMatches, use cache to reduce API hits
    const useCache = endpoint === "currentMatches";
    if (useCache && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    let apiUrl: string;
    if (endpoint === "match" && matchId) {
      apiUrl = `${CRICAPI_BASE}/match?apikey=${CRICAPI_KEY}&id=${matchId}`;
    } else if (endpoint === "scorecard" && matchId) {
      apiUrl = `${CRICAPI_BASE}/match_scorecard?apikey=${CRICAPI_KEY}&id=${matchId}`;
    } else {
      apiUrl = `${CRICAPI_BASE}/currentMatches?apikey=${CRICAPI_KEY}&offset=0`;
    }

    const res = await fetchWithRetry(apiUrl);

    if (!res.ok) {
      // Return cached data on upstream error if available
      if (useCache && cache) {
        console.warn(`CricAPI returned ${res.status}, serving stale cache`);
        return new Response(JSON.stringify(cache.data), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "STALE" },
        });
      }
      throw new Error(`CricAPI returned HTTP ${res.status}`);
    }

    const data = await res.json();

    if (useCache) {
      cache = { data, fetchedAt: Date.now() };
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("cricapi-proxy error:", message);

    // Serve stale cache on any error
    if (cache) {
      console.warn("Serving stale cache after error");
      return new Response(JSON.stringify(cache.data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "STALE" },
      });
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
