import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, Shield, User, RefreshCw, Ban,
  CheckCircle2, XCircle, TrendingUp, Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { AccountStatus } from "@/hooks/useAccountStatus";

interface UserRisk {
  user_id: string;
  risk_score: number;
  risk_level: string;
  account_status: string;
  max_bet_override: number | null;
  blocked_markets: string[];
  bonuses_disabled: boolean;
  withdrawal_delay_hours: number;
  flags: string[];
  last_calculated_at: string | null;
  // joined from profiles
  display_name?: string;
  username?: string;
}

const STATUS_OPTIONS: AccountStatus[] = ["active", "restricted", "suspended", "under_review", "blocked"];

const STATUS_COLORS: Record<string, string> = {
  active: "text-success",
  restricted: "text-yellow",
  suspended: "text-loss",
  under_review: "text-blue",
  blocked: "text-loss",
};

const RISK_COLORS: Record<string, string> = {
  low: "text-success",
  medium: "text-yellow",
  high: "text-loss",
  critical: "text-loss",
};

const AdminRiskDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserRisk[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; username: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserRisk | null>(null);
  const [filter, setFilter] = useState<"all" | AccountStatus>("all");
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit state
  const [editStatus, setEditStatus] = useState<AccountStatus>("active");
  const [editMaxBet, setEditMaxBet] = useState("");
  const [editBonuses, setEditBonuses] = useState(false);
  const [editWithdrawalDelay, setEditWithdrawalDelay] = useState("0");
  const [editFlags, setEditFlags] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [riskRes, profilesRes] = await Promise.all([
      supabase.from("user_risk_profiles" as any).select("*").order("risk_score", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, username"),
    ]);

    const profileMap: Record<string, { display_name: string | null; username: string | null }> = {};
    (profilesRes.data ?? []).forEach((p: any) => {
      profileMap[p.user_id] = { display_name: p.display_name, username: p.username };
    });
    setProfiles(profileMap);

    if (riskRes.data) {
      setUsers((riskRes.data as any[]).map(u => ({
        ...u,
        display_name: profileMap[u.user_id]?.display_name,
        username: profileMap[u.user_id]?.username,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  const selectUser = (u: UserRisk) => {
    setSelectedUser(u);
    setEditStatus(u.account_status as AccountStatus);
    setEditMaxBet(u.max_bet_override != null ? String(u.max_bet_override) : "");
    setEditBonuses(u.bonuses_disabled);
    setEditWithdrawalDelay(String(u.withdrawal_delay_hours));
    setEditFlags(u.flags.join(", "));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setProcessing(true);

    const flags = editFlags.split(",").map(f => f.trim()).filter(Boolean);
    const { error } = await supabase
      .from("user_risk_profiles" as any)
      .update({
        account_status: editStatus,
        max_bet_override: editMaxBet ? Number(editMaxBet) : null,
        bonuses_disabled: editBonuses,
        withdrawal_delay_hours: Number(editWithdrawalDelay) || 0,
        flags,
      })
      .eq("user_id", selectedUser.user_id);

    if (error) flash("Failed to update", false);
    else flash(`${selectedUser.display_name || "User"} updated`, true);
    setProcessing(false);
    setSelectedUser(null);
    fetchData();
  };

  const handleRecalculate = async (userId: string) => {
    setProcessing(true);
    // Calculate risk score from bet history
    const { data: bets } = await supabase
      .from("bets" as any)
      .select("status, stake, odds, profit_loss")
      .eq("user_id", userId);

    if (!bets || bets.length === 0) {
      flash("No bet history to score", false);
      setProcessing(false);
      return;
    }

    const betsArr = bets as any[];
    const totalBets = betsArr.length;
    const wins = betsArr.filter(b => b.status === "won").length;
    const winRate = wins / totalBets;
    const totalProfit = betsArr.reduce((s: number, b: any) => s + (Number(b.profit_loss) || 0), 0);
    const avgOdds = betsArr.reduce((s: number, b: any) => s + Number(b.odds), 0) / totalBets;
    const highStakeBets = betsArr.filter((b: any) => Number(b.stake) > 10000).length;

    // Score components (0-100)
    let score = 0;
    score += Math.min(winRate * 40, 40);  // Win rate up to 40 pts
    score += totalProfit > 50000 ? 20 : totalProfit > 10000 ? 10 : 0; // Profit
    score += avgOdds < 1.5 ? 10 : 0; // Low odds pattern (arbing)
    score += highStakeBets > 5 ? 15 : highStakeBets > 2 ? 8 : 0; // High stakes
    score += totalBets > 100 ? 15 : totalBets > 50 ? 8 : 0; // Volume

    score = Math.round(Math.min(score, 100));
    const level = score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";

    const { error } = await supabase
      .from("user_risk_profiles" as any)
      .update({
        risk_score: score,
        risk_level: level,
        last_calculated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) flash("Failed to recalculate", false);
    else flash(`Risk score: ${score}/100 (${level})`, true);
    setProcessing(false);
    fetchData();
  };

  const filteredUsers = filter === "all"
    ? users
    : users.filter(u => u.account_status === filter);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-surface-card border border-border rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={cn("font-mono text-xs px-3 py-2.5 border rounded",
          msg.ok ? "text-success bg-success/10 border-success/30" : "text-loss bg-loss/10 border-loss/30"
        )}>
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Users", val: users.length, color: "text-foreground" },
          { label: "Active", val: users.filter(u => u.account_status === "active").length, color: "text-success" },
          { label: "Restricted", val: users.filter(u => u.account_status === "restricted").length, color: "text-yellow" },
          { label: "High Risk", val: users.filter(u => ["high", "critical"].includes(u.risk_level)).length, color: "text-loss" },
          { label: "Blocked", val: users.filter(u => u.account_status === "blocked").length, color: "text-loss" },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-border rounded p-3">
            <p className="section-label">{s.label}</p>
            <p className={cn("font-condensed font-black text-xl mt-1", s.color)}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", ...STATUS_OPTIONS] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("font-mono text-[0.65rem] uppercase tracking-wider py-1.5 px-3 rounded border transition-colors",
              filter === f ? "border-blue text-blue bg-blue/10" : "border-border text-muted-foreground hover:text-foreground"
            )}>
            {f}
          </button>
        ))}
      </div>

      {/* Selected user detail */}
      {selectedUser && (
        <div className="bg-surface-card border border-blue/30 rounded p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue" />
              <div>
                <p className="font-condensed font-black text-lg">
                  {selectedUser.display_name || selectedUser.username || "Unnamed"}
                </p>
                <p className="font-mono text-[0.6rem] text-muted-foreground">
                  Score: {selectedUser.risk_score}/100 ·{" "}
                  <span className={RISK_COLORS[selectedUser.risk_level]}>{selectedUser.risk_level}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleRecalculate(selectedUser.user_id)} disabled={processing}
                className="flex items-center gap-1 font-mono text-[0.62rem] text-blue hover:text-blue/80 tracking-wider uppercase">
                <RefreshCw className={cn("w-3 h-3", processing && "animate-spin")} /> Recalculate
              </button>
              <button onClick={() => setSelectedUser(null)}
                className="font-mono text-[0.6rem] text-muted-foreground hover:text-foreground">Close</button>
            </div>
          </div>

          {/* Risk gauge */}
          <div className="bg-surface-raised border border-border rounded p-3">
            <p className="section-label mb-2">Risk Score</p>
            <div className="h-3 bg-surface rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-500",
                  selectedUser.risk_score >= 75 ? "bg-loss" :
                  selectedUser.risk_score >= 50 ? "bg-yellow" :
                  selectedUser.risk_score >= 25 ? "bg-blue" : "bg-success"
                )}
                style={{ width: `${selectedUser.risk_score}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="font-mono text-[0.55rem] text-success">Low</span>
              <span className="font-mono text-[0.55rem] text-yellow">Medium</span>
              <span className="font-mono text-[0.55rem] text-loss">Critical</span>
            </div>
          </div>

          {/* Flags */}
          {selectedUser.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUser.flags.map(f => (
                <span key={f} className="font-mono text-[0.6rem] bg-loss/10 text-loss border border-loss/20 px-2 py-1 rounded">
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Edit controls */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="section-label block mb-1.5">Account Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as AccountStatus)}
                className="w-full bg-surface-card border border-border text-foreground font-mono text-sm p-2 rounded outline-none focus:border-blue">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="section-label block mb-1.5">Max Bet Override (₹)</label>
              <input type="number" value={editMaxBet} onChange={e => setEditMaxBet(e.target.value)}
                placeholder="No limit" className="stake-input" />
            </div>
            <div>
              <label className="section-label block mb-1.5">Withdrawal Delay (hours)</label>
              <input type="number" value={editWithdrawalDelay} onChange={e => setEditWithdrawalDelay(e.target.value)}
                className="stake-input" min="0" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <button onClick={() => setEditBonuses(!editBonuses)}
                className={cn("w-10 h-5 rounded-full cursor-pointer transition-colors flex items-center",
                  editBonuses ? "bg-loss justify-end" : "bg-success justify-start"
                )}>
                <div className="w-4 h-4 bg-foreground rounded-full mx-0.5" />
              </button>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {editBonuses ? "Bonuses DISABLED" : "Bonuses enabled"}
              </span>
            </div>
          </div>

          <div>
            <label className="section-label block mb-1.5">Flags (comma-separated)</label>
            <input type="text" value={editFlags} onChange={e => setEditFlags(e.target.value)}
              placeholder="e.g. bonus_abuse, multi_account, arbing"
              className="stake-input" />
          </div>

          <button onClick={handleSave} disabled={processing}
            className="cta-place-bet w-full disabled:opacity-40">
            {processing ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* Users list */}
      {filteredUsers.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground text-center py-12">
          No users {filter !== "all" ? `with status "${filter}"` : "found"}
        </p>
      ) : (
        <div className="bg-surface-card border border-border rounded overflow-hidden">
          {filteredUsers.map(u => (
            <button key={u.user_id} onClick={() => selectUser(u)}
              className={cn("w-full flex items-center justify-between px-4 py-3.5 border-b border-border/50 last:border-0 hover:bg-surface-raised transition-colors text-left",
                selectedUser?.user_id === u.user_id && "bg-surface-raised"
              )}>
              <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded flex items-center justify-center flex-shrink-0",
                  u.risk_level === "critical" ? "bg-loss/20" :
                  u.risk_level === "high" ? "bg-loss/10" :
                  u.risk_level === "medium" ? "bg-yellow/10" : "bg-success/10"
                )}>
                  {u.account_status === "blocked" ? <Ban className="w-4 h-4 text-loss" /> :
                   u.risk_level === "critical" ? <AlertTriangle className="w-4 h-4 text-loss" /> :
                   <User className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-condensed font-600 text-sm">{u.display_name || u.username || "Unnamed"}</p>
                  <p className="font-mono text-[0.55rem] text-muted-foreground">
                    Score: <span className={RISK_COLORS[u.risk_level]}>{u.risk_score}</span> ·{" "}
                    {u.flags.length > 0 && <span className="text-loss">{u.flags.length} flags</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("font-mono text-[0.6rem] uppercase tracking-wider font-semibold",
                  STATUS_COLORS[u.account_status] || "text-muted-foreground"
                )}>{u.account_status}</span>
                <div className={cn("w-2 h-2 rounded-full",
                  u.risk_level === "critical" ? "bg-loss animate-pulse" :
                  u.risk_level === "high" ? "bg-loss" :
                  u.risk_level === "medium" ? "bg-yellow" : "bg-success"
                )} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminRiskDashboard;
