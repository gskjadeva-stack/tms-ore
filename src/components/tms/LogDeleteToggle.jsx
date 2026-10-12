const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Toggle for the per-log delete buttons, gated by re-authentication:
// enabling requires the user's login email + password, verified server-side
// via /api/auth/login (same scrypt check as Login.jsx) — never compared
// client-side. Disabling needs no confirmation.
export function LogDeleteToggle({ checked, onEnable }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const openDialog = (next) => {
    if (next) {
      setEmail(user?.email || "");
      setPassword("");
      setError("");
      setVerifying(false);
    }
    setOpen(next);
  };

  const handleChange = (next) => {
    // Turning OFF needs no confirmation; turning ON asks for credentials.
    if (!next) {
      onEnable(false);
      return;
    }
    openDialog(true);
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your login email and password to confirm.");
      return;
    }
    setVerifying(true);
    try {
      // Re-authenticate against the real backend. loginViaEmailPassword
      // rewrites the stored token with a fresh one for the same user,
      // so the session stays valid after verification.
      await db.auth.loginViaEmailPassword(email.trim(), password);
      onEnable(true);
      openDialog(false);
    } catch (err) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="show-log-delete">Log time delete buttons</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Show a delete button on each captured task log and break row (Time Capture). Enabling requires your
            login password. Off by default.
          </p>
        </div>
        <Switch id="show-log-delete" checked={!!checked} onCheckedChange={handleChange} />
      </div>
      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable log delete buttons?</DialogTitle>
            <DialogDescription>
              This shows a delete button on every captured log row. Confirm with your login email
              and password — wrong credentials keep the buttons hidden.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="logdel-email">Login email</Label>
              <Input
                id="logdel-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logdel-password">Password</Label>
              <Input
                id="logdel-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => openDialog(false)}
                disabled={verifying}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={verifying}>
                {verifying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Confirm enable"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
