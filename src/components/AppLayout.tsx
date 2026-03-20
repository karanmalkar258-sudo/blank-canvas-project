import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import LeftSidebar from "@/components/LeftSidebar";
import BetSlip from "@/components/BetSlip";
import NotificationBell from "@/components/NotificationBell";
import { useBetSlip } from "@/hooks/useBetSlip";
import { useNotifications } from "@/hooks/useNotifications";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { useWallet } from "@/hooks/useWallet";
import { useMarketSuspensions } from "@/hooks/useMarketSuspensions";
import { useAuth } from "@/context/AuthContext";
import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { useLoginAnomalyDetection } from "@/hooks/useLoginAnomalyDetection";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { Sport } from "@/data/mockData";
import { Menu, User, Wallet, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface LayoutContext {
  matches: ReturnType<typeof useLiveOdds>["matches"];
  flashMap: ReturnType<typeof useLiveOdds>["flashMap"];
  betSlip: ReturnType<typeof useBetSlip>;
  activeSport: Sport | "All";
  setActiveSport: (s: Sport | "All") => void;
  wallet: ReturnType<typeof useWallet>;
  suspensions: ReturnType<typeof useMarketSuspensions>;
}

const AppLayout: React.FC = () => {
  const { matches, flashMap } = useLiveOdds();
  const betSlip = useBetSlip();
  const notifs = useNotifications();
  const wallet = useWallet();
  const suspensions = useMarketSuspensions();
  const { signOut } = useAuth();
  const [activeSport, setActiveSport] = useState<Sport | "All">("All");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  // Background tracking hooks (no UI, fire-and-forget)
  useAffiliateTracking();
  useLoginAnomalyDetection();
  useBehaviorTracking();

  const matchCounts = matches.reduce(
    (acc, m) => { acc[m.sport] = (acc[m.sport] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const ctx: LayoutContext = {
    matches,
    flashMap,
    betSlip,
    activeSport,
    setActiveSport,
    wallet,
    suspensions,
  };

  const formattedBalance = wallet.loading
    ? "..."
    : `₹${wallet.balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  // Build a flat list of suspended markets for BetSlip
  const suspendedMarketsList = suspensions.suspensions.map((s) => ({
    matchId: s.match_id,
    marketName: s.market_name,
  }));

  // Odds-change adapter for BetSlip
  const oddsChangedForSlip = betSlip.oddsChangedSel
    ? {
        selectionLabel: betSlip.oddsChangedSel.selectionLabel,
        marketName:     betSlip.oddsChangedSel.marketName,
        oldOdds:        (betSlip.oddsChangedSel as { lockedOdds?: number }).lockedOdds ?? betSlip.oddsChangedSel.odds,
        newOdds:        betSlip.oddsChangedSel.odds,
      }
    : null;

  const BetSlipPanel = (
    <BetSlip
      selections={betSlip.selections}
      stake={betSlip.stake}
      setStake={betSlip.setStake}
      isOpen={betSlip.isOpen}
      setIsOpen={betSlip.setIsOpen}
      potentialWin={betSlip.potentialWin}
      onRemoveSelection={betSlip.removeSelection}
      onClearAll={betSlip.clearAll}
      onPlaceBet={betSlip.placeBet}
      isConfirming={betSlip.isConfirming}
      confirmPhase={betSlip.confirmPhase}
      confirmText={betSlip.confirmText}
      balance={wallet.balance}
      oddsChangedSel={oddsChangedForSlip}
      onAcceptOdds={betSlip.acceptOddsChange}
      suspendedMarkets={suspendedMarketsList}
    />
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar (mobile) */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface lg:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-condensed font-black text-lg text-yellow tracking-widest">LIVE BET</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate("/wallet")} className="p-2 text-muted-foreground hover:text-foreground">
            <Wallet className="w-4.5 h-4.5" />
          </button>
          <NotificationBell
            notifications={notifs.notifications}
            unreadCount={notifs.unreadCount}
            onMarkAllRead={notifs.markAllRead}
            onMarkRead={notifs.markRead}
          />
          <button onClick={() => navigate("/profile")} className="p-2 text-muted-foreground hover:text-foreground">
            <User className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <div className={`fixed inset-y-0 left-0 z-40 lg:static lg:z-auto transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
          <LeftSidebar
            activeSport={activeSport}
            onSelectSport={(s) => { setActiveSport(s); setSidebarOpen(false); }}
            matchCounts={matchCounts}
          />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {/* Desktop top bar */}
          <div className="hidden lg:flex items-center justify-between px-6 py-3 border-b border-border bg-surface-card sticky top-0 z-10">
            <span className="font-mono text-[0.65rem] text-muted-foreground tracking-widest uppercase">
              {activeSport === "All" ? "All Sports" : activeSport} · {activeSport === "All" ? matches.length : (matchCounts[activeSport] ?? 0)} matches
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/wallet")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border rounded hover:border-blue transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-yellow" />
                <span className="font-condensed font-bold text-sm text-foreground">{formattedBalance}</span>
              </button>
              <NotificationBell
                notifications={notifs.notifications}
                unreadCount={notifs.unreadCount}
                onMarkAllRead={notifs.markAllRead}
                onMarkRead={notifs.markRead}
              />
              <button
                onClick={() => navigate("/profile")}
                className="w-8 h-8 bg-surface-raised border border-border rounded flex items-center justify-center hover:border-blue transition-colors"
              >
                <User className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={signOut}
                className="w-8 h-8 bg-surface-raised border border-border rounded flex items-center justify-center hover:border-loss transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <Outlet context={ctx} />
        </main>

        {/* Bet Slip — right panel (desktop) */}
        <div className="hidden lg:flex w-72 flex-shrink-0">{BetSlipPanel}</div>

        {/* Bet Slip — mobile */}
        <div className="lg:hidden">{BetSlipPanel}</div>
      </div>
    </div>
  );
};

export default AppLayout;
