import React, { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  bet_won:      "text-success",
  bet_lost:     "text-loss",
  bet_accepted: "text-blue",
  deposit:      "text-success",
  withdrawal:   "text-yellow",
  info:         "text-muted-foreground",
  system:       "text-yellow",
};

const TYPE_ICONS: Record<string, string> = {
  bet_won:      "🏆",
  bet_lost:     "📉",
  bet_accepted: "✅",
  deposit:      "💰",
  withdrawal:   "🔄",
  info:         "ℹ️",
  system:       "🔔",
};

const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-loss rounded-full flex items-center justify-center font-mono text-[0.55rem] text-white font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-surface-card border border-border shadow-2xl z-50 rounded overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-condensed font-700 text-sm tracking-wider uppercase">
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="font-mono text-[0.62rem] text-blue hover:text-blue/80 tracking-wider"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="font-mono text-[0.65rem] text-muted-foreground text-center py-8 uppercase tracking-wider">
                  No notifications
                </p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => onMarkRead(n.id)}
                    className={cn(
                      "px-4 py-3 cursor-pointer border-b border-border/50 last:border-0 transition-colors",
                      n.read ? "bg-transparent hover:bg-surface-raised" : "bg-blue/5 hover:bg-blue/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-base mt-0.5 flex-shrink-0">
                        {TYPE_ICONS[n.type] ?? "🔔"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("font-condensed font-600 text-sm", TYPE_COLORS[n.type] ?? "text-foreground")}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="w-1.5 h-1.5 bg-blue rounded-full flex-shrink-0" />
                          )}
                        </div>
                        {n.body && (
                          <p className="font-mono text-[0.62rem] text-muted-foreground mt-0.5 leading-relaxed">
                            {n.body}
                          </p>
                        )}
                        <p className="font-mono text-[0.55rem] text-muted-foreground/50 mt-1 tracking-wide">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
