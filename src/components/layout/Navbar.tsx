import { PanelLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface NavbarProps {
  onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="h-14 border-b border-border bg-[hsl(var(--surface))] flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        <span className="font-mono text-xs tracking-widest uppercase text-muted-foreground hidden sm:block">
          LiveBet
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground hidden sm:block">
          {user?.email}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="text-muted-foreground hover:text-foreground gap-1.5"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Logout</span>
        </Button>
      </div>
    </header>
  );
}
