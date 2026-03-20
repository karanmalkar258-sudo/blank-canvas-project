import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { SPORTS, SPORT_ICONS, Sport } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface LeftSidebarProps {
  activeSport: Sport | "All";
  onSelectSport: (sport: Sport | "All") => void;
  matchCounts: Record<string, number>;
  collapsed?: boolean;
}

const NAV_LINKS = [
  { to: "/", label: "Live Matches" },
  { to: "/my-bets", label: "My Bets" },
  { to: "/wallet", label: "Wallet" },
  { to: "/profile", label: "Profile" },
];

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeSport,
  onSelectSport,
  matchCounts,
  collapsed = false,
}) => {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border bg-surface transition-all duration-200",
        collapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border flex items-center gap-2">
        <span className="font-condensed font-black text-xl text-yellow tracking-wider">
          {collapsed ? "LB" : "LIVE\u00A0BET"}
        </span>
        {!collapsed && (
          <span className="font-mono text-[0.52rem] text-muted-foreground/60 tracking-widest mt-1">
            SPORTSBOOK
          </span>
        )}
      </div>

      {/* Page Navigation */}
      {!collapsed && (
        <div className="border-b border-border py-2">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                cn(
                  "block px-4 py-2.5 font-mono text-[0.68rem] tracking-widest uppercase transition-all",
                  isActive
                    ? "text-yellow bg-surface-raised border-l-2 border-yellow"
                    : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                "block px-4 py-2.5 font-mono text-[0.68rem] tracking-widest uppercase transition-all",
                isActive
                  ? "text-yellow bg-surface-raised border-l-2 border-yellow"
                  : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
              )
            }
          >
            Admin
          </NavLink>
        </div>
      )}

      {/* Sports Filter */}
      <div className="flex-1 overflow-y-auto py-2">
        {!collapsed && (
          <p className="section-label px-4 pt-3 pb-2">Sports</p>
        )}

        {/* All */}
        <button
          onClick={() => onSelectSport("All")}
          className={cn(
            "sport-item w-full text-left",
            activeSport === "All" && "active"
          )}
        >
          <span className="text-base">🏆</span>
          {!collapsed && (
            <>
              <span className="flex-1">All Sports</span>
              <span className="font-mono text-[0.6rem] text-muted-foreground">
                {Object.values(matchCounts).reduce((a, b) => a + b, 0)}
              </span>
            </>
          )}
        </button>

        {SPORTS.map((sport) => (
          <button
            key={sport}
            onClick={() => onSelectSport(sport)}
            className={cn(
              "sport-item w-full text-left",
              activeSport === sport && "active"
            )}
          >
            <span className="text-base">{SPORT_ICONS[sport]}</span>
            {!collapsed && (
              <>
                <span className="flex-1">{sport}</span>
                {matchCounts[sport] > 0 && (
                  <span className="font-mono text-[0.6rem] text-muted-foreground">
                    {matchCounts[sport]}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Bottom: Responsible Gambling */}
      {!collapsed && (
        <div className="border-t border-border p-4">
          <p className="font-mono text-[0.58rem] text-muted-foreground/50 leading-relaxed tracking-wide">
            18+ · Gamble Responsibly · T&Cs Apply
          </p>
        </div>
      )}
    </aside>
  );
};

export default LeftSidebar;
