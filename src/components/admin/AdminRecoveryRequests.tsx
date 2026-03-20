import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { LifeBuoy, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RecoveryRequest {
  id: string;
  user_email: string;
  user_id: string | null;
  type: string;
  status: string;
  ip_address: string | null;
  notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow",
  verified: "text-blue",
  completed: "text-success",
  rejected: "text-loss",
};

const AdminRecoveryRequests: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("account_recovery_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setRequests(data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (id: string, status: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("account_recovery_requests" as any)
      .update({
        status,
        resolved_at: ["completed", "rejected"].includes(status) ? new Date().toISOString() : null,
        resolved_by: user.id,
      })
      .eq("id", id);
    if (error) flash("Failed to update", false);
    else flash(`Request ${status}`, true);
    fetchData();
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

  const pending = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={cn("font-mono text-xs px-3 py-2.5 border rounded",
          msg.ok ? "text-success bg-success/10 border-success/30" : "text-loss bg-loss/10 border-loss/30"
        )}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Requests", val: requests.length, color: "text-foreground" },
          { label: "Pending", val: pending, color: "text-yellow" },
          { label: "Completed", val: requests.filter(r => r.status === "completed").length, color: "text-success" },
          { label: "Rejected", val: requests.filter(r => r.status === "rejected").length, color: "text-loss" },
        ].map(s => (
          <div key={s.label} className="bg-surface-card border border-border rounded p-3">
            <p className="section-label">{s.label}</p>
            <p className={cn("font-condensed font-black text-xl mt-1", s.color)}>{s.val}</p>
          </div>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12">
          <LifeBuoy className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="font-mono text-xs text-muted-foreground">No recovery requests</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-border rounded overflow-hidden">
          {requests.map(req => (
            <div key={req.id} className="px-4 py-4 border-b border-border/50 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-condensed font-600 text-sm">{req.user_email}</p>
                    <p className="font-mono text-[0.6rem] text-muted-foreground">
                      {req.type.replace("_", " ")}
                      {req.ip_address && ` · IP: ${req.ip_address}`}
                      {" · "}{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </p>
                    {req.notes && (
                      <p className="font-mono text-[0.6rem] text-muted-foreground/70 mt-1">{req.notes}</p>
                    )}
                  </div>
                </div>
                <span className={cn("font-mono text-[0.6rem] uppercase tracking-wider font-semibold",
                  STATUS_COLORS[req.status] || "text-muted-foreground"
                )}>
                  {req.status}
                </span>
              </div>

              {req.status === "pending" && (
                <div className="flex gap-2 ml-7">
                  <button onClick={() => updateStatus(req.id, "completed")}
                    className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-wider py-1 px-2.5 rounded border border-success/30 text-success hover:bg-success/10 transition-colors">
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </button>
                  <button onClick={() => updateStatus(req.id, "rejected")}
                    className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-wider py-1 px-2.5 rounded border border-loss/30 text-loss hover:bg-loss/10 transition-colors">
                    <XCircle className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminRecoveryRequests;
