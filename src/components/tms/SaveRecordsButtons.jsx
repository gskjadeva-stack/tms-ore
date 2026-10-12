const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { useState } from "react";
import { Database, Download, Loader2, Save } from "lucide-react";
import { useTmsState, actions, getState } from "@/lib/tmsStore";
import { formatLocal } from "@/lib/tmsUtils";
import { Button } from "@/components/ui/button";

// Save working time records to the database + load them back.
// Authenticated endpoints (Bearer token); save = transactional snapshot
// replace of masters + stopped records. Live running/paused timers are
// NOT saved and NOT restored (they keep ticking in this browser only).
async function api(path, opts = {}) {
  const token = localStorage.getItem("base44_access_token");
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function SaveRecordsButtons() {
  const s = useTmsState();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setStatus("");
    setSaving(true);
    try {
      const st = getState();
      const stoppedEntries = st.taskTimeEntries.filter((e) => e.status === "stopped");
      const r = await api("/tms-records/save", {
        method: "POST",
        body: {
          employees: st.employees,
          tasks: st.tasks,
          assignments: st.assignments,
          shiftDefinitions: st.shiftDefinitions,
          shiftRecords: st.shiftRecords,
          taskTimeEntries: stoppedEntries,
          breakRecords: st.breakRecords,
        },
      });
      setStatus(
        `Saved ${r.saved.entries} time entries, ${r.saved.employees} employees, ${r.saved.tasks} tasks to the database.`
      );
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async () => {
    setError("");
    setStatus("");
    if (
      !window.confirm(
        "Load records from the database? This REPLACES all browser records (employees, tasks, entries) with the last saved snapshot. Unsaved browser changes are lost."
      )
    )
      return;
    setLoading(true);
    try {
      const data = await api("/tms-records/load");
      actions.replaceFromDatabase(data);
      setStatus(
        `Loaded ${data.taskTimeEntries.length} time entries, ${data.employees.length} employees from the database.`
      );
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? "Saving..." : "Save to database"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleLoad} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {loading ? "Loading..." : "Load from database"}
        </Button>
      </div>
      {status && (
        <p className="text-xs text-emerald-700 flex items-center gap-1">
          <Database className="w-3 h-3" /> {status}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {s.taskTimeEntries.some((e) => e.status === "running" || e.status === "paused") && (
        <p className="text-xs text-muted-foreground">
          Note: running/paused timers are not saved — stop them first ({formatLocal(new Date().toISOString())}).
        </p>
      )}
    </div>
  );
}
