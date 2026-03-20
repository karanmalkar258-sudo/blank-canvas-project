import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ChevronDown, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { BetSelection } from "@/data/mockData";
import { useBetLimits } from "@/hooks/useBetLimits";

interface OddsChangedBanner {
  selectionLabel: string;
  marketName: string;
  oldOdds: number;
  newOdds: number;
}

interface BetSlipProps {
  selections: BetSelection[];
  stake: string;
  setStake: (v: string) => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  potentialWin: string;
  onRemoveSelection: (matchId: string, marketName: string) => void;
  onClearAll: () => void;
  onPlaceBet: () => void;
  isConfirming: boolean;
  confirmPhase: string;
  confirmText: string;
  balance?: number;
  oddsChangedSel?: OddsChangedBanner | null;
  onAcceptOdds?: () => void;
  suspendedMarkets?: Array<{ matchId: string; marketName: string }>;
}

// ── Terminal confirmation overlay ──────────────────────────
const ConfirmationOverlay: React.FC<{ text: string; phase: string }> = ({ text, phase }) => {
  const [displayed, setDisplayed] = React.useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        if (indexRef.current >= text.length) { clearInterval(interval); return prev; }
        const next = prev + text[indexRef.current];
        indexRef.current++;
        return next;
      });
    }, 38);
    return () => clearInterval(interval);
  }, [text]);

  const isAccepted = phase === "accepted";
  const isError = phase === "error";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-6">
      <div className={cn(
        "font-mono text-sm tracking-widest",
        isAccepted ? "text-success text-base font-semibold" :
        isError    ? "text-loss text-sm font-semibold"      :
                     "text-blue/80"
      )}>
        {displayed}
        {!isAccepted && !isError && <span className="cursor-blink" />}
      </div>
      {isAccepted && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center"
        >
          <span className="text-success text-lg">✓</span>
        </motion.div>
      )}
      {isError && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-10 h-10 rounded-full bg-loss/20 flex items-center justify-center"
        >
          <span className="text-loss text-lg">✕</span>
        </motion.div>
      )}
    </div>
  );
};

const QUICK_STAKES = [100, 500, 1000, 5000];

const BetSlip: React.FC<BetSlipProps> = ({
  selections,
  stake,
  setStake,
  isOpen,
  setIsOpen,
  potentialWin,
  onRemoveSelection,
  onClearAll,
  onPlaceBet,
  isConfirming,
  confirmPhase,
  confirmText,
  balance = 0,
  oddsChangedSel,
  onAcceptOdds,
  suspendedMarkets = [],
}) => {
  const limits = useBetLimits();

  const profit = stake
    ? (parseFloat(potentialWin) - parseFloat(stake)).toFixed(2)
    : "0.00";

  const stakeNum = parseFloat(stake) || 0;
  const stakeError =
    stakeNum > 0 && stakeNum < limits.min_stake
      ? `Min ₹${limits.min_stake}`
      : stakeNum > limits.max_stake
      ? `Max ₹${limits.max_stake.toLocaleString("en-IN")}`
      : parseFloat(potentialWin) > limits.max_win
      ? `Max win ₹${limits.max_win.toLocaleString("en-IN")}`
      : null;

  const firstSel = selections[0];
  const isFirstSelSuspended = firstSel
    ? suspendedMarkets.some(
        (s) => s.matchId === firstSel.matchId && s.marketName === firstSel.marketName
      )
    : false;

  const canPlaceBet =
    !!stake &&
    stakeNum >= limits.min_stake &&
    stakeNum <= limits.max_stake &&
    parseFloat(potentialWin) <= limits.max_win &&
    !isFirstSelSuspended &&
    !oddsChangedSel;

  return (
    <>
      {/* Mobile floating button */}
      {selections.length > 0 && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 lg:hidden cta-place-bet w-auto px-5 py-3 flex items-center gap-2 shadow-xl glow-blue"
        >
          <span className="font-condensed font-black text-sm tracking-widest">
            BET SLIP ({selections.length})
          </span>
        </button>
      )}

      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Slip Panel */}
      <div
        className={cn(
          "flex flex-col bg-surface border-l border-border h-full overflow-hidden",
          "fixed bottom-0 right-0 left-0 z-50 lg:static lg:z-auto",
          "lg:flex",
          !isOpen && "hidden lg:flex",
          "lg:h-full"
        )}
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-condensed font-black text-sm tracking-widest text-foreground uppercase">
              Bet Slip
            </span>
            {selections.length > 0 && (
              <span className="font-mono text-[0.6rem] bg-blue text-white px-1.5 py-0.5 rounded">
                {selections.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selections.length > 0 && !isConfirming && (
              <button onClick={onClearAll} className="text-muted-foreground hover:text-loss transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors lg:hidden"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Odds Changed Banner */}
        <AnimatePresence>
          {oddsChangedSel && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-3 mt-3 rounded border border-warning/40 bg-warning/10 p-3"
            >
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-mono text-[0.65rem] text-warning tracking-wider uppercase font-semibold">
                    Odds Changed
                  </p>
                  <p className="font-mono text-[0.6rem] text-muted-foreground mt-0.5">
                    {oddsChangedSel.selectionLabel} · {oddsChangedSel.marketName}
                  </p>
                  <p className="font-mono text-[0.65rem] mt-1">
                    <span className="text-muted-foreground line-through">{oddsChangedSel.oldOdds?.toFixed(2)}</span>
                    <span className="text-warning font-semibold ml-2">{oddsChangedSel.newOdds?.toFixed(2)}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={onAcceptOdds}
                className="w-full py-1.5 border border-warning/50 bg-warning/20 text-warning font-mono text-[0.65rem] tracking-wider uppercase rounded hover:bg-warning/30 transition-colors"
              >
                Accept New Odds
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 px-4">
              <span className="text-2xl opacity-30">📋</span>
              <p className="font-mono text-[0.65rem] text-muted-foreground text-center tracking-wider uppercase">
                Click any odds to add selections
              </p>
            </div>
          ) : isConfirming ? (
            <ConfirmationOverlay text={confirmText} phase={confirmPhase} />
          ) : (
            <div className="divide-y divide-border">
              {selections.map((sel) => {
                const isSuspended = suspendedMarkets.some(
                  (s) => s.matchId === sel.matchId && s.marketName === sel.marketName
                );
                return (
                  <motion.div
                    key={`${sel.matchId}-${sel.marketName}`}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={cn("p-4", isSuspended && "opacity-60")}
                  >
                    {isSuspended && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-loss/10 border border-loss/30 rounded">
                        <Lock className="w-3 h-3 text-loss" />
                        <span className="font-mono text-[0.58rem] text-loss tracking-wider uppercase">
                          Market Suspended
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-mono text-[0.6rem] text-muted-foreground tracking-wider uppercase truncate">
                          {sel.matchTitle} · {sel.marketName}
                        </p>
                        <p className="font-condensed font-700 text-base text-foreground mt-0.5">
                          {sel.selectionLabel}
                        </p>
                      </div>
                      <div className="flex items-start gap-2 flex-shrink-0">
                        <span className="font-condensed font-black text-xl text-yellow leading-none">
                          {sel.odds.toFixed(2)}
                        </span>
                        <button
                          onClick={() => onRemoveSelection(sel.matchId, sel.marketName)}
                          className="text-muted-foreground hover:text-loss transition-colors mt-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stake + Summary */}
        {selections.length > 0 && !isConfirming && (
          <div className="border-t border-border p-4 flex-shrink-0 space-y-4">
            {/* Quick stakes */}
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_STAKES.filter((q) => q <= limits.max_stake).map((q) => (
                <button
                  key={q}
                  onClick={() => setStake(String(q))}
                  className="font-condensed font-600 text-xs py-1.5 border border-border bg-surface-card hover:border-blue hover:text-blue transition-all rounded text-muted-foreground"
                >
                  ₹{q >= 1000 ? `${q / 1000}K` : q}
                </button>
              ))}
            </div>

            {/* Stake input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="section-label">Stake (₹)</label>
                <span className="font-mono text-[0.55rem] text-muted-foreground">
                  ₹{limits.min_stake}–₹{limits.max_stake.toLocaleString("en-IN")}
                </span>
              </div>
              <input
                type="number"
                placeholder="0.00"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className={cn("stake-input", stakeError && "border-loss/60 focus:border-loss")}
                min={limits.min_stake}
                max={limits.max_stake}
              />
              {stakeError && (
                <p className="font-mono text-[0.6rem] text-loss mt-1 tracking-wider">{stakeError}</p>
              )}
            </div>

            {/* Summary rows */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  Potential Win
                </span>
                <span className="font-condensed font-bold text-base text-success">
                  ₹{parseFloat(potentialWin).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  Profit
                </span>
                <span className="font-condensed font-semibold text-sm text-success/80">
                  +₹{parseFloat(profit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  Wallet Balance
                </span>
                <span className="font-condensed font-semibold text-sm text-foreground">
                  ₹{balance.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Place Bet */}
            <button
              className={cn("cta-place-bet", canPlaceBet && "glow-blue")}
              onClick={onPlaceBet}
              disabled={!canPlaceBet}
            >
              {isFirstSelSuspended ? "Market Suspended" : "Place Bet"}
            </button>

            <p className="font-mono text-[0.55rem] text-muted-foreground/50 text-center tracking-wider">
              By placing your bet you agree to our Terms & Conditions
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default BetSlip;
