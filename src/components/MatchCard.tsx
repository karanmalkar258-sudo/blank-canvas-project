import React from "react";
import { Match } from "@/data/mockData";
import { BetSelection } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface MatchCardProps {
  match: Match;
  flashMap: Record<string, "up" | "down">;
  selectedOdds: BetSelection[];
  onSelectOdd: (sel: BetSelection) => void;
}

const MatchCard: React.FC<MatchCardProps> = ({ match, flashMap, selectedOdds, onSelectOdd }) => {
  const navigate = useNavigate();
  const isLive = match.status === "live";
  const isCompleted = match.status === "completed";

  // Only show first market (Match Winner) in the card
  const primaryMarket = match.markets[0];

  const isOddSelected = (oddId: string) =>
    selectedOdds.some((s) => s.matchId === match.id && s.selectionLabel === primaryMarket?.odds.find((o) => o.id === oddId)?.label);

  const handleOddClick = (oddId: string, label: string, value: number) => {
    onSelectOdd({
      matchId: match.id,
      matchTitle: `${match.team1Short} vs ${match.team2Short}`,
      marketName: primaryMarket.name,
      selectionLabel: label,
      odds: value,
    });
  };

  return (
    <div className="match-row group">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Match info */}
        <div className="flex-1 min-w-0">
          {/* League + Status */}
          <div className="flex items-center gap-2 mb-2">
            {isLive && <span className="badge-live">Live</span>}
            {match.status === "upcoming" && <span className="badge-upcoming">Upcoming</span>}
            {isCompleted && <span className="badge-upcoming">Completed</span>}
            <span className="font-mono text-[0.6rem] text-muted-foreground tracking-wider uppercase">
              {match.league}
            </span>
          </div>

          {/* Teams + Score */}
          <div className="flex items-center gap-3 mb-1">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-condensed font-700 text-[1rem] text-foreground leading-tight">
                  {match.team1}
                </span>
                {match.score1 && (
                  <span className={cn("font-condensed font-bold text-lg leading-none", isLive && "text-yellow")}>
                    {match.score1}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="font-condensed font-700 text-[1rem] text-foreground leading-tight">
                  {match.team2}
                </span>
                {match.score2 && match.score2 !== "—" && (
                  <span className={cn("font-condensed font-bold text-lg leading-none", isLive && "text-foreground/70")}>
                    {match.score2}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Time / Over detail */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="font-mono text-[0.62rem] text-muted-foreground tracking-wide">
              {match.detail || match.time}
            </span>
            {match.markets.length > 1 && (
              <button
                onClick={() => navigate(`/match/${match.id}`)}
                className="flex items-center gap-0.5 font-mono text-[0.6rem] text-blue hover:text-blue/80 tracking-wide transition-colors"
              >
                +{match.markets.length - 1} markets
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Odds */}
        {primaryMarket && !isCompleted && (
          <div className="flex gap-1.5 flex-shrink-0">
            {primaryMarket.odds.map((odd) => {
              const flash = flashMap[odd.id];
              const isSelected = isOddSelected(odd.id);
              return (
                <button
                  key={odd.id}
                  onClick={() => handleOddClick(odd.id, odd.label, odd.value)}
                  className={cn("odds-btn", isSelected && "selected")}
                >
                  <span className="odds-label">{odd.label}</span>
                  <span
                    className={cn(
                      "odds-value",
                      !isSelected && flash === "up" && "flash-up",
                      !isSelected && flash === "down" && "flash-down"
                    )}
                  >
                    {odd.value.toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Completed: show result */}
        {isCompleted && (
          <div className="text-right flex-shrink-0">
            <span className="font-mono text-[0.65rem] text-muted-foreground uppercase tracking-wider">
              SETTLED
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchCard;
