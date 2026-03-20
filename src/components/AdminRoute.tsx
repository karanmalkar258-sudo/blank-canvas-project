import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAdminRole } from "@/hooks/useAdminRole";
import { ShieldAlert } from "lucide-react";

/**
 * Protects routes that require the 'admin' role.
 * Shows a spinner during role check, then either renders the route
 * or redirects to / with an access-denied message.
 */
const AdminRoute: React.FC = () => {
  const { isAdmin, loading } = useAdminRole();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-[0.65rem] text-muted-foreground tracking-widest uppercase">
            Verifying access…
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <ShieldAlert className="w-12 h-12 text-loss mx-auto" />
          <h1 className="font-condensed font-black text-2xl tracking-wider uppercase text-foreground">
            Access Denied
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            You do not have admin privileges to view this page.
          </p>
          <Navigate to="/" replace />
        </div>
      </div>
    );
  }

  return <Outlet />;
};

export default AdminRoute;
