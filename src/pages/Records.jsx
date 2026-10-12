import { useTmsState, actions } from "@/lib/tmsStore";
import { formatLocal, formatLocalTime, formatDuration } from "@/lib/tmsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { ResetRecordsDialog } from "@/components/tms/ResetRecordsDialog";
import { SaveRecordsButtons } from "@/components/tms/SaveRecordsButtons";

const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

// Per-row delete for shift records. Each click requires the user's login
// email + password, verified server-side via /api/auth/login (same scrypt
// check as Login.jsx) — never compared client-side. The button only renders
// when the Settings "log time delete buttons" toggle is ON.
function ShiftDeleteButton({ record }) {
  const s = useTmsState();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  if (!s.settings?.uiPrefs?.showLogDeleteButtons) return null;

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
      await db.auth.loginViaEmailPassword(email.trim(), password);
      actions.deleteShiftRecord(record.id);
      openDialog(false);
    } catch (err) {
      setError(err?.message || "Invalid email or password");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        title={`Delete shift record (${record.date}) — requires login`}
        onClick={() => openDialog(true)}
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
      </Button>
      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this shift record?</DialogTitle>
            <DialogDescription>
              {record.date} — this cannot be undone. Confirm with your login email and password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`shift-del-email-${record.id}`}>Login email</Label>
              <Input
                id={`shift-del-email-${record.id}`}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`shift-del-pass-${record.id}`}>Password</Label>
              <Input
                id={`shift-del-pass-${record.id}`}
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
                  "Confirm delete"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Records() {
  const s = useTmsState();

  const empName = (id) => s.employees.find((e) => e.id === id)?.name || "—";
  const taskName = (id) => s.tasks.find((t) => t.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Records</h1>
          <p className="text-sm text-muted-foreground">
            Captured shift records, task time entries, pause events, and break records.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <SaveRecordsButtons />
          <ResetRecordsDialog />
        </div>
      </div>

      {/* Shift records */}
      <Card>
        <CardHeader>
          <CardTitle>Shift Records ({s.shiftRecords.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {s.shiftRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No shift records captured.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Shift</th>
                    <th className="px-3 py-2 text-left">Time In (Yard)</th>
                    <th className="px-3 py-2 text-left">Time Out (Yard)</th>
                    <th className="px-3 py-2 text-left">Attendance</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                    <th className="px-3 py-2 text-left">Remarks</th>
                    <th className="px-3 py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.shiftRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono">{formatLocal(r.date)}</td>
                      <td className="px-3 py-2 font-medium">{empName(r.employeeId)}</td>
                      <td className="px-3 py-2">{r.shiftTime || "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.timeInYard ? formatLocalTime(r.timeInYard) : "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.timeOutYard ? formatLocalTime(r.timeOutYard) : "—"}</td>
                      <td className="px-3 py-2">{r.attendanceStatus || "—"}</td>
                      <td className="px-3 py-2">{r.reason || "—"}</td>
                      <td className="px-3 py-2 min-w-32 max-w-64 whitespace-pre-wrap break-words" title={r.notes || ""}>{r.notes || "—"}</td>
                      <td className="px-3 py-2 min-w-32 max-w-64 whitespace-pre-wrap break-words" title={r.remarks || ""}>{r.remarks || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <ShiftDeleteButton record={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task time entries */}
      <Card>
        <CardHeader>
          <CardTitle>Task Time Entries ({s.taskTimeEntries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {s.taskTimeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No completed task timings yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Task</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    <th className="px-3 py-2 text-left">Finished</th>
                    <th className="px-3 py-2 text-left">Duration</th>
                    <th className="px-3 py-2 text-left">Paused</th>
                    <th className="px-3 py-2 text-left">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.taskTimeEntries.map((e) => {
                    const totalPaused = (e.pauseEvents || []).reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-mono">{formatLocal(e.date)}</td>
                        <td className="px-3 py-2 font-medium">{empName(e.employeeId)}</td>
                        <td className="px-3 py-2">{taskName(e.taskId)}</td>
                        <td className="px-3 py-2 font-mono">{formatLocalTime(e.timeStarted)}</td>
                        <td className="px-3 py-2 font-mono">{e.timeFinished ? formatLocalTime(e.timeFinished) : "—"}</td>
                        <td className="px-3 py-2 font-mono">{formatDuration(e.totalDurationMs || 0)}</td>
                        <td className="px-3 py-2 font-mono">{formatDuration(totalPaused)}</td>
                        <td className="px-3 py-2">{e.triggeringLevel || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Break records */}
      <Card>
        <CardHeader>
          <CardTitle>Break Records ({s.breakRecords.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {s.breakRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No break records captured.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Employee</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    <th className="px-3 py-2 text-left">Finished</th>
                    <th className="px-3 py-2 text-left">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.breakRecords.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-mono">{formatLocal(b.date)}</td>
                      <td className="px-3 py-2 font-medium">{empName(b.employeeId)}</td>
                      <td className="px-3 py-2 font-mono">{formatLocalTime(b.timeStarted)}</td>
                      <td className="px-3 py-2 font-mono">{formatLocalTime(b.timeFinished)}</td>
                      <td className="px-3 py-2 font-mono">{formatDuration(b.durationMs || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
