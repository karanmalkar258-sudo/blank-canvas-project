import React, { useState } from "react";
import { Shield, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import KycLevelBadge from "./KycLevelBadge";
import KycLevel1Form from "./KycLevel1Form";
import KycLevel2Form from "./KycLevel2Form";
import type { KycLevel, KycStatus, KycDocument } from "@/hooks/useKyc";

interface Props {
  level: KycLevel;
  status: KycStatus;
  panNumber: string | null;
  aadhaarNumber: string | null;
  dateOfBirth: string | null;
  rejectReason: string | null;
  documents: KycDocument[];
  uploading: boolean;
  onSubmitLevel1: (pan: string, aadhaar: string, dob: string) => Promise<void>;
  onSubmitLevel2: () => Promise<void>;
  onUploadDocument: (docType: any, file: File) => Promise<void>;
}

const LEVEL_BENEFITS = [
  { level: 0, items: ["Browse matches", "View odds"] },
  { level: 1, items: ["Place bets", "Deposit funds", "Withdraw up to ₹10,000/day"] },
  { level: 2, items: ["Unlimited withdrawals", "Higher bet limits", "Priority support"] },
];

const KycVerificationFlow: React.FC<Props> = ({
  level, status, panNumber, aadhaarNumber, dateOfBirth, rejectReason,
  documents, uploading,
  onSubmitLevel1, onSubmitLevel2, onUploadDocument,
}) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveLevel = status === "verified" ? level : Math.max(0, level - 1) as KycLevel;

  return (
    <div className="bg-surface-card border border-border rounded overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className={cn("w-4 h-4",
            status === "verified" ? "text-success" :
            status === "pending" ? "text-yellow" :
            status === "rejected" ? "text-loss" : "text-muted-foreground"
          )} />
          <h3 className="font-condensed font-700 text-base tracking-wider uppercase">KYC Verification</h3>
        </div>
        <div className="flex items-center gap-2">
          <KycLevelBadge level={level} status={status} />
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-5">

          {/* Level progress steps */}
          <div className="flex items-center gap-0">
            {[0, 1, 2].map((l) => (
              <React.Fragment key={l}>
                <div className={cn(
                  "flex flex-col items-center gap-1 flex-1",
                )}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                    l <= effectiveLevel
                      ? "bg-success/20 border-success text-success"
                      : l === effectiveLevel + 1 && (status === "pending" || status === "unverified" || status === "rejected")
                        ? "bg-yellow/20 border-yellow text-yellow"
                        : "bg-surface-raised border-border text-muted-foreground"
                  )}>
                    {l <= effectiveLevel ? <CheckCircle2 className="w-4 h-4" /> :
                     l === level && status === "pending" ? <Clock className="w-4 h-4" /> :
                     <Lock className="w-3 h-3" />}
                  </div>
                  <span className="font-mono text-[0.5rem] tracking-wider uppercase text-muted-foreground">
                    Level {l}
                  </span>
                </div>
                {l < 2 && (
                  <div className={cn("h-0.5 flex-1 -mt-4", l < effectiveLevel ? "bg-success" : "bg-border")} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Level benefits */}
          <div className="grid grid-cols-3 gap-2">
            {LEVEL_BENEFITS.map((lb) => (
              <div key={lb.level} className={cn(
                "bg-surface-raised border rounded p-2.5",
                lb.level <= effectiveLevel ? "border-success/30" : "border-border"
              )}>
                <p className={cn(
                  "font-mono text-[0.55rem] tracking-wider uppercase font-semibold mb-1.5",
                  lb.level <= effectiveLevel ? "text-success" : "text-muted-foreground"
                )}>
                  Level {lb.level}
                </p>
                {lb.items.map((item) => (
                  <p key={item} className="font-mono text-[0.5rem] text-muted-foreground leading-relaxed">• {item}</p>
                ))}
              </div>
            ))}
          </div>

          {/* Status messages */}
          {status === "verified" && level === 2 && (
            <div className="flex items-center gap-2 text-success bg-success/10 border border-success/20 rounded p-3">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <p className="font-mono text-[0.7rem] tracking-wider">Fully verified. All features unlocked.</p>
            </div>
          )}

          {status === "verified" && level === 1 && (
            <div className="flex items-center gap-2 text-success bg-success/10 border border-success/20 rounded p-3">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <p className="font-mono text-[0.7rem] tracking-wider">Level 1 verified. Complete Level 2 for full access.</p>
            </div>
          )}

          {status === "pending" && (
            <div className="flex items-center gap-2 text-yellow bg-yellow/10 border border-yellow/20 rounded p-3">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <p className="font-mono text-[0.7rem] tracking-wider">Under review. Usually takes 24–48 hours.</p>
            </div>
          )}

          {status === "rejected" && (
            <div className="flex items-start gap-2 text-loss bg-loss/10 border border-loss/20 rounded p-3">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="font-mono text-[0.7rem] tracking-wider">
                Rejected: {rejectReason ?? "Please resubmit with correct documents."}
              </p>
            </div>
          )}

          {/* Submitted info for Level 1 pending/verified */}
          {level >= 1 && status === "pending" && panNumber && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-raised border border-border rounded p-3">
                <p className="section-label mb-1">PAN</p>
                <p className="font-mono text-xs text-foreground">{panNumber.slice(0, 3)}••••{panNumber.slice(-2)}</p>
              </div>
              <div className="bg-surface-raised border border-border rounded p-3">
                <p className="section-label mb-1">Aadhaar</p>
                <p className="font-mono text-xs text-foreground">••••{aadhaarNumber?.slice(-4)}</p>
              </div>
            </div>
          )}

          {/* Forms based on current state */}
          {(status === "unverified" || (status === "rejected" && level <= 1)) && (
            <KycLevel1Form
              initialPan={panNumber ?? ""}
              initialAadhaar={aadhaarNumber ?? ""}
              initialDob={dateOfBirth ?? ""}
              onSubmit={onSubmitLevel1}
            />
          )}

          {((status === "verified" && level === 1) || (status === "rejected" && level === 2)) && (
            <KycLevel2Form
              documents={documents}
              uploading={uploading}
              onUpload={onUploadDocument}
              onSubmitLevel2={onSubmitLevel2}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default KycVerificationFlow;
