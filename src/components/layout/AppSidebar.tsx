import {
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  Trophy,
  ArrowDownToLine,
  Monitor,
  Bell,
  UserCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Wallet", url: "/wallet", icon: Wallet },
  { title: "KYC Verification", url: "/kyc", icon: ShieldCheck },
  { title: "Bets", url: "/bets", icon: Trophy },
  { title: "Withdraw", url: "/withdraw", icon: ArrowDownToLine },
  { title: "Sessions", url: "/sessions", icon: Monitor },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Profile", url: "/profile", icon: UserCircle },
];

interface AppSidebarProps {
  collapsed: boolean;
}

export function AppSidebar({ collapsed }: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "h-full bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))] flex flex-col transition-all duration-200 overflow-hidden",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Logo area */}
      <div className="h-14 flex items-center px-3 border-b border-[hsl(var(--sidebar-border))]">
        {!collapsed && (
          <span className="font-condensed font-bold text-lg tracking-wider text-[hsl(var(--sidebar-foreground))]">
            LIVE<span className="text-[hsl(var(--yellow))]">BET</span>
          </span>
        )}
        {collapsed && (
          <span className="font-condensed font-bold text-lg text-[hsl(var(--yellow))] mx-auto">
            L
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 flex flex-col gap-0.5 px-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            className="flex items-center gap-3 px-2.5 py-2 rounded text-sm text-[hsl(var(--sidebar-foreground)/0.65)] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] transition-colors"
            activeClassName="bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))] font-medium"
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
