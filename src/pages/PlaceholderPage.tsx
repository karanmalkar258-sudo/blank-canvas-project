import { Construction } from "lucide-react";
import { useLocation } from "react-router-dom";

export default function PlaceholderPage() {
  const location = useLocation();
  const name = location.pathname.slice(1).replace(/-/g, " ");

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
      <Construction className="h-12 w-12 text-muted-foreground" />
      <h1 className="font-condensed font-bold text-xl tracking-wider uppercase text-foreground">
        {name}
      </h1>
      <p className="font-mono text-xs text-muted-foreground tracking-wider">
        This feature is coming soon
      </p>
    </div>
  );
}
