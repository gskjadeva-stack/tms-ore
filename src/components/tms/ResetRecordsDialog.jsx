const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useTmsState, actions } from "@/lib/tmsStore";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Reset button with re-authentication: the user must re-enter their login
// email + password. Password is verified server-side via /api/auth/login
// (same scrypt check as Login.jsx) — never compared client-side.
export function ResetRecordsDialog() {
  const s = useTmsState();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const recordCount =
    s.shiftRecords.length + s.taskTimeEntries.length + s.breakRecords.length;

  const openDialog = (next) => {
    if (next) {
      setEmail(user?.email || "");
      setPassword("");
      setError("");
      setVerifying(false);
    }
    setOpen(next);
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
      actions.resetRecords();
      openDialog(false);
    } catch (err) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="w-4 h-4 mr-2" />
          Reset records
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset captured records?</DialogTitle>
          <DialogDescription>
            This permanently deletes {recordCount} record
            {recordCount === 1 ? "" : "s"} (shift records, task time entries,
            break records, plus any running timers) from this browser. Employee
            roster, tasks, assignments, shift definitions, and settings are
            kept. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Login email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-password">Password</Label>
            <Input
              id="reset-password"
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
            <Button type="submit" variant="destructive" disabled={verifying}>
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Confirm reset"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
