import { useAuth } from "@/hooks/useAuth";
import { Wallet, Trophy, ShieldCheck, TrendingUp } from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-condensed font-bold text-2xl text-foreground">{value}</div>
      <div className="font-mono text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Welcome */}
      <div>
        <h1 className="font-condensed font-bold text-2xl tracking-wide">
          Welcome back, <span className="text-[hsl(var(--yellow))]">{name}</span>
        </h1>
        <p className="font-mono text-xs text-muted-foreground mt-1 tracking-wider uppercase">
          Account overview
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label="Wallet"
          value="₹0.00"
          sub="Deposit to start betting"
        />
        <StatCard
          icon={Trophy}
          label="Active Bets"
          value="0"
          sub="No open bets"
        />
        <StatCard
          icon={ShieldCheck}
          label="KYC Status"
          value="Level 0"
          sub="Complete KYC to withdraw"
        />
        <StatCard
          icon={TrendingUp}
          label="Win Rate"
          value="—"
          sub="Place bets to track"
        />
      </div>

      {/* Quick actions placeholder */}
      <div className="rounded border border-border bg-card p-6">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {["Deposit Funds", "Place a Bet", "Complete KYC", "View History"].map(
            (action) => (
              <button
                key={action}
                className="px-3 py-2.5 rounded border border-border bg-secondary text-sm text-secondary-foreground hover:bg-accent transition-colors font-medium"
              >
                {action}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
