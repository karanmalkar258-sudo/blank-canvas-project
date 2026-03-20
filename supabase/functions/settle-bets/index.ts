import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Verify JWT — only authenticated users can call
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin role (server-side, not client-side)
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      matchId: string;
      matchTitle: string;
      winnerLabel: string;
    };

    if (!body.matchId || !body.winnerLabel) {
      return new Response(JSON.stringify({ error: "matchId and winnerLabel are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all OPEN bets for this match — idempotent: settled bets are skipped
    const { data: openBets, error: fetchErr } = await supabase
      .from("bets")
      .select("*")
      .eq("match_id", body.matchId)
      .eq("status", "open");

    if (fetchErr) throw fetchErr;

    if (!openBets || openBets.length === 0) {
      return new Response(
        JSON.stringify({ settled: 0, payouts: 0, message: "No open bets found for this match" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let settledCount = 0;
    let payoutCount  = 0;
    const now = new Date().toISOString();

    for (const bet of openBets) {
      const isWin =
        bet.selection_label.toLowerCase().trim() === body.winnerLabel.toLowerCase().trim();
      const newStatus  = isWin ? "won" : "lost";
      const profitLoss = isWin
        ? Number(bet.potential_win) - Number(bet.stake)
        : -Number(bet.stake);

      // Mark bet settled — WHERE status='open' prevents double-settlement
      const { error: betUpdateErr } = await supabase
        .from("bets")
        .update({ status: newStatus, profit_loss: profitLoss, settled_at: now })
        .eq("id", bet.id)
        .eq("status", "open");   // idempotency guard

      if (betUpdateErr) {
        console.error("bet update error:", betUpdateErr.message);
        continue;
      }

      // Persist notification for the user
      const notifTitle = isWin
        ? `🏆 Bet Won — ₹${Number(bet.potential_win).toLocaleString("en-IN")}`
        : `📉 Bet Lost — ${bet.selection_label}`;
      const notifBody = `${bet.selection_label} · ${bet.market_name} · ${body.matchTitle}`;

      await supabase.from("notifications").insert({
        user_id:      bet.user_id,
        type:         isWin ? "bet_won" : "bet_lost",
        title:        notifTitle,
        body:         notifBody,
        reference_id: bet.id,
      });

      if (isWin) {
        // Fetch current wallet balance
        const { data: wallet } = await supabase
          .from("wallet_balances")
          .select("balance")
          .eq("user_id", bet.user_id)
          .single();

        if (wallet) {
          const newBalance = Number(wallet.balance) + Number(bet.potential_win);

          await supabase
            .from("wallet_balances")
            .update({ balance: newBalance })
            .eq("user_id", bet.user_id);

          await supabase.from("transactions").insert({
            user_id:      bet.user_id,
            type:         "bet_win",
            amount:       Number(bet.potential_win),
            balance_after: newBalance,
            description:  `Win: ${bet.selection_label} · ${bet.market_name}`,
            reference_id: bet.id,
          });

          payoutCount++;
        }
      }

      settledCount++;
    }

    return new Response(
      JSON.stringify({
        settled: settledCount,
        payouts: payoutCount,
        matchId: body.matchId,
        winner:  body.winnerLabel,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("settle-bets error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
