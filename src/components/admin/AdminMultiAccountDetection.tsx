import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import {
  Users, RefreshCw, AlertTriangle, Shield, Ban, Flag, CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LinkedAccount {
  id: string;
  account_a: string;
  account_b: string;
  link_type: string;
  confidence_score: number;
  detected_at: string;
  action_taken: string;
  notes: string | null;
}

const LINK_COLORS: Record<string, string> = {
  same_device: "text-loss",
  same_ip: "text-yellow",
  same_payment: "text-loss",
  same_kyc: "text-loss",
};

const ACTION_COLORS: Record<string, string> = {
  none: "text-muted-foreground",
  flagged: "text-yellow",
  frozen: "text-blue",
  banned: "text-loss",
};

const AdminMultiAccountDetection: React.FC = () => {
  const { user } = useAuth();
  const [links, setLinks] = useState<LinkedAccount[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [filter, setFilter] = useState<"all" | string>("all");

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [linksRes, profilesRes] = await Promise.all([
      supabase.from("linked_accounts" as any).select("*").order("detected_at", { ascending: false }),
      supabase.from("profiles").select("user_id, display_name, username"),
    ]);
    if (linksRes.data) setLinks(linksRes.data as any);
    const map: Record<string, string> = {};
    (profilesRes.data ?? []).forEach((p: any) => {
      map[p.user_id] = p.display_name || p.username || p.user_id.slice(0, 8);
    });
    setProfiles(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runDetection = async () => {
    setRunning(true);
    const { data, error } = await supabase.rpc("detect_multi_accounts" as any);
    if (error) flash("Detection failed: " + error.message, false);
    else flash(`Detection complete. ${(data as any)?.new_links ?? 0} new links found.`, true);
    setRunning(false);
    fetchData();
  };

  const updateAction = async (id: string, action: string) => {
    if (!user) return;
    await supabase
      .from("linked_accounts" as any)
      .update({ action_taken: action, action_by: user.id, action_at: new Date().toISOString() })
      .eq("id", id);
    fetchData();
    flash(`Action updated to ${action}`, true);
  };

  const getName = (uid: string) => profiles[uid] || uid.slice(0, 8).toUpperCase();

  const filteredLinks = filter === "all" ? links : links.filter(l => l.link_type === filter);

  const stats = {
    total: links.length,
    devices: links.filter(l => l.link_type === "same_device").length,
    ips: links.filter(l => l.link_type === "same_ip").length,
    payments: links.filter(l => l.link_type === "same_payment").length,
    kyc: links.filter(l => l.link_type === "same_kyc").length,
  };

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
          { label: "Total Links", val: stats.total, color: "text-foreground" },
          { label: "Same Device", val: stats.devices, color: "text-loss" },
          { label: "Same IP", val: stats.ips, color: "text-yellow" },
          { label: "Same Payment", val: stats.payments, color: "text-loss" },
          { label: "Same KYC", val: stats.kyc, color: "text-loss" },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-border rounded p-3">
            <p className="section-label">{s.label}</p>
            <p className={cn("font-condensed font-black text-xl mt-1", s.color)}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Run detection + filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {["all", "same_device", "same_ip", "same_payment", "same_kyc"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("font-mono text-[0.65rem] uppercase tracking-wider py-1.5 px-3 rounded border transition-colors",
                filter === f ? "border-blue text-blue bg-blue/10" : "border-border text-muted-foreground hover:text-foreground"
              )}>
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
        <button onClick={runDetection} disabled={running}
          className="flex items-center gap-2 font-condensed font-bold text-sm uppercase tracking-wider py-2 px-4 bg-blue text-white rounded hover:bg-blue/90 transition-colors disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", running && "animate-spin")} />
          {running ? "Scanning..." : "Run Detection"}
        </button>
      </div>

      {/* Links list */}
      {filteredLinks.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="w-8 h-8 text-success mx-auto mb-3 opacity-50" />
          <p className="font-mono text-xs text-muted-foreground">No linked accounts detected</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-border rounded overflow-hidden">
          {filteredLinks.map(link => (
            <div key={link.id} className="px-4 py-4 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={cn("w-4 h-4", LINK_COLORS[link.link_type] || "text-muted-foreground")} />
                  <div>
                    <p className="font-condensed font-600 text-sm">
                      {getName(link.account_a)} ↔ {getName(link.account_b)}
                    </p>
                    <p className="font-mono text-[0.6rem] text-muted-foreground">
                      <span className={LINK_COLORS[link.link_type]}>{link.link_type.replace("_", " ")}</span>
                      {" · "}confidence: {Math.round(link.confidence_score * 100)}%
                      {" · "}{formatDistanceToNow(new Date(link.detected_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <span className={cn("font-mono text-[0.6rem] uppercase tracking-wider font-semibold",
                  ACTION_COLORS[link.action_taken] || "text-muted-foreground"
                )}>
                  {link.action_taken}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 ml-7">
                {["flagged", "frozen", "banned"].map(action => (
                  <button key={action} onClick={() => updateAction(link.id, action)}
                    disabled={link.action_taken === action}
                    className={cn(
                      "flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-wider py-1 px-2.5 rounded border transition-colors",
                      link.action_taken === action
                        ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                        : action === "banned"
                        ? "border-loss/30 text-loss hover:bg-loss/10"
                        : action === "frozen"
                        ? "border-blue/30 text-blue hover:bg-blue/10"
                        : "border-yellow/30 text-yellow hover:bg-yellow/10"
                    )}>
                    {action === "banned" ? <Ban className="w-3 h-3" /> :
                     action === "frozen" ? <Shield className="w-3 h-3" /> :
                     <Flag className="w-3 h-3" />}
                    {action}
                  </button>
                ))}
                {link.action_taken !== "none" && (
                  <button onClick={() => updateAction(link.id, "none")}
                    className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-wider py-1 px-2.5 rounded border border-success/30 text-success hover:bg-success/10 transition-colors">
                    <CheckCircle2 className="w-3 h-3" /> Dismiss
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMultiAccountDetection;
