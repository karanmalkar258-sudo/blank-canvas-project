import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export default function SignupPage() {
  const { user, loading, signUpWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="font-mono text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    const { error } = await signUpWithEmail(email, password);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setSubmitting(false);
  };

  const handleGoogle = async () => {
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-[hsl(var(--success))] font-condensed font-bold text-2xl">
            Check your email
          </div>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong className="text-foreground">{email}</strong>.
            Click it to activate your account.
          </p>
          <Link to="/login" className="text-primary text-sm hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <h1 className="font-condensed font-bold text-3xl tracking-wider">
            LIVE<span className="text-[hsl(var(--yellow))]">BET</span>
          </h1>
          <p className="font-mono text-xs text-muted-foreground mt-1 tracking-widest uppercase">
            Create your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded bg-[hsl(var(--input))] border border-border text-foreground text-sm focus:outline-none focus:border-[hsl(var(--ring))] transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded bg-[hsl(var(--input))] border border-border text-foreground text-sm focus:outline-none focus:border-[hsl(var(--ring))] transition-colors"
              placeholder="Min 6 characters"
            />
          </div>
          <div>
            <label className="font-mono text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded bg-[hsl(var(--input))] border border-border text-foreground text-sm focus:outline-none focus:border-[hsl(var(--ring))] transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full gap-2">
            <UserPlus className="h-4 w-4" />
            {submitting ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-mono text-[0.6rem] text-muted-foreground uppercase tracking-widest">
            or
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Google */}
        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continue with Google
        </Button>

        {/* Link to login */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
