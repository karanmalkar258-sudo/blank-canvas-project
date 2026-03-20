import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, RefreshCw, FileText, User, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface KycUser {
  user_id: string;
  display_name: string | null;
  username: string | null;
  kyc_level: number;
  kyc_status: string;
  pan_number: string | null;
  aadhaar_number: string | null;
  date_of_birth: string | null;
  kyc_submitted_at: string | null;
  kyc_reject_reason: string | null;
}

interface KycDoc {
  id: string;
  user_id: string;
  doc_type: string;
  file_url: string;
  file_name: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

const AdminKycReview: React.FC = () => {
  const [users, setUsers] = useState<KycUser[]>([]);
  const [docs, setDocs] = useState<KycDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "rejected">("pending");
  const [selectedUser, setSelectedUser] = useState<KycUser | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [profilesRes, docsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, display_name, username, kyc_level, kyc_status, pan_number, aadhaar_number, date_of_birth, kyc_submitted_at, kyc_reject_reason")
        .order("kyc_submitted_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("kyc_documents" as any)
        .select("id, user_id, doc_type, file_url, file_name, status, reject_reason, created_at")
        .order("created_at", { ascending: false }),
    ]);
    if (profilesRes.data) {
      setUsers(profilesRes.data.map((p: any) => ({
        ...p,
        kyc_level: p.kyc_level ?? 0,
      })));
    }
    if (docsRes.data) setDocs(docsRes.data as any as KycDoc[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 5000);
  };

  const filteredUsers = filter === "all"
    ? users.filter(u => u.kyc_status !== "unverified")
    : users.filter(u => u.kyc_status === filter);

  const userDocs = selectedUser
    ? docs.filter(d => d.user_id === selectedUser.user_id)
    : [];

  const handleApprove = async (u: KycUser) => {
    setProcessing(true);
    const newLevel = u.kyc_level === 1 ? 1 : 2;
    const { error } = await supabase
      .from("profiles")
      .update({
        kyc_status: "verified",
        kyc_level: newLevel,
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reject_reason: null,
      } as any)
      .eq("user_id", u.user_id);

    // Also approve all pending docs for this user
    await supabase
      .from("kyc_documents" as any)
      .update({ status: "approved" })
      .eq("user_id", u.user_id)
      .eq("status", "pending");

    if (error) flash("Failed to approve", false);
    else flash(`${u.display_name || u.username || "User"} approved at Level ${newLevel}`, true);
    setProcessing(false);
    setSelectedUser(null);
    fetchData();
  };

  const handleReject = async (u: KycUser) => {
    if (!rejectReason.trim()) { flash("Please provide a rejection reason", false); return; }
    setProcessing(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        kyc_status: "rejected",
        kyc_reviewed_at: new Date().toISOString(),
        kyc_reject_reason: rejectReason.trim(),
      } as any)
      .eq("user_id", u.user_id);

    // Reject all pending docs
    await supabase
      .from("kyc_documents" as any)
      .update({ status: "rejected", reject_reason: rejectReason.trim() })
      .eq("user_id", u.user_id)
      .eq("status", "pending");

    if (error) flash("Failed to reject", false);
    else flash(`${u.display_name || u.username || "User"} rejected`, true);
    setProcessing(false);
    setSelectedUser(null);
    setRejectReason("");
    fetchData();
  };

  const handleSetLevel = async (u: KycUser, level: number) => {
    setProcessing(true);
    const { error } = await supabase
      .from("profiles")
      .update({ kyc_level: level } as any)
      .eq("user_id", u.user_id);
    if (error) flash("Failed to update level", false);
    else flash(`Level set to ${level}`, true);
    setProcessing(false);
    fetchData();
  };

  const getSignedUrl = async (path: string) => {
    const { data } = await supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
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
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" /> : <XCircle className="w-3.5 h-3.5 inline mr-1.5" />}
          {msg.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {(["pending", "verified", "rejected", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("font-mono text-[0.65rem] uppercase tracking-wider py-1.5 px-3 rounded border transition-colors",
              filter === f ? "border-blue text-blue bg-blue/10" : "border-border text-muted-foreground hover:text-foreground"
            )}>
            {f} {f !== "all" && `(${users.filter(u => u.kyc_status === f).length})`}
          </button>
        ))}
      </div>

      {/* User detail panel */}
      {selectedUser && (
        <div className="bg-surface-card border border-blue/30 rounded p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-blue" />
              <div>
                <p className="font-condensed font-black text-lg">{selectedUser.display_name || selectedUser.username || "Unnamed"}</p>
                <p className="font-mono text-[0.6rem] text-muted-foreground">
                  Level {selectedUser.kyc_level} · {selectedUser.kyc_status}
                  {selectedUser.kyc_submitted_at && ` · Submitted ${formatDistanceToNow(new Date(selectedUser.kyc_submitted_at), { addSuffix: true })}`}
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedUser(null)} className="font-mono text-[0.6rem] text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>

          {/* ID Details */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: "PAN", value: selectedUser.pan_number },
              { label: "Aadhaar", value: selectedUser.aadhaar_number ? `****${selectedUser.aadhaar_number.slice(-4)}` : null },
              { label: "DOB", value: selectedUser.date_of_birth },
            ].map(item => (
              <div key={item.label} className="bg-surface-raised border border-border rounded p-2.5">
                <p className="section-label mb-0.5">{item.label}</p>
                <p className="font-mono text-xs text-foreground">{item.value || "—"}</p>
              </div>
            ))}
          </div>

          {/* Documents */}
          {userDocs.length > 0 && (
            <div>
              <p className="section-label mb-2">Documents ({userDocs.length})</p>
              <div className="space-y-2">
                {userDocs.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between bg-surface-raised border border-border rounded px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-condensed font-600 text-sm">{doc.doc_type.replace(/_/g, " ")}</p>
                        <p className="font-mono text-[0.55rem] text-muted-foreground">{doc.file_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-mono text-[0.6rem] uppercase tracking-wider font-semibold",
                        doc.status === "approved" ? "text-success" : doc.status === "rejected" ? "text-loss" : "text-yellow"
                      )}>{doc.status}</span>
                      <button onClick={() => getSignedUrl(doc.file_url)}
                        className="p-1.5 text-blue hover:text-blue/80 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Set Level */}
          <div>
            <p className="section-label mb-2">Set Verification Level</p>
            <div className="flex gap-2">
              {[0, 1, 2].map(lvl => (
                <button key={lvl} onClick={() => handleSetLevel(selectedUser, lvl)} disabled={processing}
                  className={cn("font-condensed font-600 text-sm py-2 px-4 border rounded transition-all",
                    selectedUser.kyc_level === lvl
                      ? "border-blue text-blue bg-blue/10"
                      : "border-border bg-surface hover:border-blue hover:text-blue text-muted-foreground"
                  )}>
                  Level {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          {selectedUser.kyc_status === "pending" && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div>
                <label className="section-label block mb-1.5">Rejection Reason (required to reject)</label>
                <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Document unclear, PAN mismatch..."
                  className="stake-input" maxLength={200} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleApprove(selectedUser)} disabled={processing}
                  className="flex-1 py-2.5 border border-success/50 bg-success/10 text-success font-condensed font-700 text-sm uppercase tracking-wider rounded hover:bg-success/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button onClick={() => handleReject(selectedUser)} disabled={processing}
                  className="flex-1 py-2.5 border border-loss/50 bg-loss/10 text-loss font-condensed font-700 text-sm uppercase tracking-wider rounded hover:bg-loss/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users list */}
      {filteredUsers.length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground text-center py-12">No {filter} KYC submissions</p>
      ) : (
        <div className="bg-surface-card border border-border rounded overflow-hidden">
          {filteredUsers.map(u => (
            <button key={u.user_id} onClick={() => { setSelectedUser(u); setRejectReason(""); }}
              className={cn("w-full flex items-center justify-between px-4 py-3.5 border-b border-border/50 last:border-0 hover:bg-surface-raised transition-colors text-left",
                selectedUser?.user_id === u.user_id && "bg-surface-raised"
              )}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue/20 rounded flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue" />
                </div>
                <div>
                  <p className="font-condensed font-600 text-sm">{u.display_name || u.username || "Unnamed"}</p>
                  <p className="font-mono text-[0.55rem] text-muted-foreground">
                    Level {u.kyc_level} · {u.kyc_submitted_at ? formatDistanceToNow(new Date(u.kyc_submitted_at), { addSuffix: true }) : "No submission"}
                  </p>
                </div>
              </div>
              <span className={cn("font-mono text-[0.6rem] uppercase tracking-wider font-semibold",
                u.kyc_status === "verified" ? "text-success" : u.kyc_status === "rejected" ? "text-loss" : u.kyc_status === "pending" ? "text-yellow" : "text-muted-foreground"
              )}>{u.kyc_status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminKycReview;
