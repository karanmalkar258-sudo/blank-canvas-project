import React from "react";
import { Shield, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KycLevel, KycStatus } from "@/hooks/useKyc";

interface Props {
  level: KycLevel;
  status: KycStatus;
  className?: string;
}

const LEVEL_LABELS: Record<KycLevel, string> = {
  0: "Level 0 — Unverified",
  1: "Level 1 — Basic ID",
  2: "Level 2 — Fully Verified",
};

const STATUS_CONFIG: Record<KycStatus, { label: string; color: string; icon: React.ReactNode }> = {
  unverified: { label: "UNVERIFIED", color: "text-muted-foreground", icon: <Shield className="w-3 h-3" /> },
  pending:    { label: "PENDING",    color: "text-yellow",           icon: <Clock className="w-3 h-3" /> },
  verified:   { label: "VERIFIED",   color: "text-success",          icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected:   { label: "REJECTED",   color: "text-loss",             icon: <XCircle className="w-3 h-3" /> },
};

const KycLevelBadge: React.FC<Props> = ({ level, status, className }) => {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Level indicator dots */}
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((l) => (
          <div
            key={l}
            className={cn(
              "w-2 h-2 rounded-full transition-colors",
              l <= level
                ? status === "verified" ? "bg-success" : status === "pending" ? "bg-yellow" : l <= level ? "bg-blue" : "bg-border"
                : "bg-border"
            )}
          />
        ))}
      </div>

      <span className={cn("inline-flex items-center gap-1 font-mono text-[0.55rem] tracking-wider uppercase", cfg.color)}>
        {cfg.icon}
        {LEVEL_LABELS[level]} · {cfg.label}
      </span>
    </div>
  );
};

export default KycLevelBadge;
