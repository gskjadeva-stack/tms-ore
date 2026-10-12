import { useState } from "react";
import { Clock3, Trash2 } from "lucide-react";
import { formatDuration, formatLocalTime, manualTimeRangeIso } from "@/lib/tmsUtils";
import { useNow } from "@/lib/useNow";
import { actions, useTmsState } from "@/lib/tmsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TimerControls from "./TimerControls";

// live elapsed for a current entry
function liveElapsed(entry, now) {
  if (!entry) return 0;
  if (entry.status === "running" && entry.runningSince) {
    return entry.accumulatedActiveMs + (now.getTime() - new Date(entry.runningSince).getTime());
  }
  return entry.accumulatedActiveMs || 0;
}

function livePaused(entry, now) {
  if (!entry) return 0;
  const closed = (entry.pauseEvents || []).reduce((s, pe) => s + (pe.intervalMs || 0), 0);
  if (entry.status === "paused" && entry.pausedAt) {
    return closed + (now.getTime() - new Date(entry.pausedAt).getTime());
  }
  return closed;
}

export default function TaskRow({
  task,
  taskOptions = null, // same assigned-task list; when set, task cell is a dropdown arrow
  selectedTaskId = null,
  onTaskChange = null,
  entry,
  history, // prior finalized sessions for this task (older → newer)
  selected,
  onSelect,
  onStart,
  onPause,
  onResume,
  onStop,
  date,
  onManualSave,
  switchError = "",
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");
  const [manualError, setManualError] = useState("");
  const running = entry?.status === "running";
  const now = useNow(1000, running);

  const status = entry?.status || "idle";
  const elapsed = entry ? liveElapsed(entry, now) : 0;
  const paused = entry ? livePaused(entry, now) : 0;
  const totalDuration = entry?.status === "stopped" ? entry.totalDurationMs : elapsed;
  const showLogDelete = !!useTmsState().settings?.uiPrefs?.showLogDeleteButtons;

  const saveManual = () => {
    const range = manualTimeRangeIso(date, startTime, finishTime);
    if (!range) {
      setManualError("Enter a valid Start and Finish. Finish must be after Start.");
      return;
    }
    if (!onManualSave(range.startIso, range.finishIso)) {
      setManualError("Stop the running task before saving manual time.");
      return;
    }
    setManualOpen(false);
    setStartTime("");
    setFinishTime("");
    setManualError("");
  };

  return (
    <>
      <tr className={running ? "bg-emerald-50/40" : ""}>
        <td className="px-2 py-2 w-8 text-center">
          <input
            type="radio"
            name="l1-row-select"
            checked={!!selected}
            onChange={() => onSelect?.()}
            title="Select this row for employee-level Pause/Resume"
            className="h-3.5 w-3.5"
          />
        </td>
        <td className="px-2 py-2 font-medium text-sm">
          {taskOptions ? (
            <div>
              <Select
                value={selectedTaskId || task.id}
                onValueChange={(nextId) => onTaskChange?.(nextId)}
              >
                <SelectTrigger
                  className="h-8 w-72 max-w-full"
                  title={taskOptions.find((o) => o.id === (selectedTaskId || task.id))?.name || "Select task — switching stops the current timer, logs elapsed time, and starts the new task"}
                >
                  <SelectValue placeholder="Select task" />
                </SelectTrigger>
                <SelectContent className="max-w-80">
                  {taskOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id} title={opt.name}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {switchError && (
                <div className="mt-1 text-[11px] text-rose-600">{switchError}</div>
              )}
            </div>
          ) : (
            task.name
          )}
        </td>
        <td className="px-2 py-2 font-mono text-sm tabular-nums">
          {status === "stopped" ? formatDuration(entry.totalDurationMs) : formatDuration(totalDuration)}
        </td>
        <td className="px-2 py-2 text-xs text-muted-foreground font-mono">
          {entry?.timeStarted ? formatLocalTime(entry.timeStarted) : "—"}
        </td>
        <td className="px-2 py-2 text-xs text-muted-foreground font-mono">
          {entry?.timeFinished ? formatLocalTime(entry.timeFinished) : "—"}
        </td>
        <td className="px-2 py-2 text-xs font-mono tabular-nums text-amber-600">
          {entry ? formatDuration(paused) : "00:00:00"}
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <TimerControls
              status={status}
              onStart={onStart}
              onPause={onPause}
              onResume={onResume}
              onStop={onStop}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setManualOpen((open) => !open);
                setManualError("");
              }}
              title="Enter task Start and Finish times manually"
              className="border-violet-500 text-violet-700"
              disabled={status === "running" || status === "paused"}
            >
              <Clock3 className="w-3 h-3" /> Manual
            </Button>
          </div>
        </td>
      </tr>
      {manualOpen && (
        <tr className="bg-violet-50/50">
          <td colSpan={7} className="px-3 py-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Time</label>
                <Input
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="2:26 PM"
                  className="h-8 w-28"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Finish Time</label>
                <Input
                  value={finishTime}
                  onChange={(e) => setFinishTime(e.target.value)}
                  placeholder="3:45 PM"
                  className="h-8 w-28"
                />
              </div>
              <Button size="sm" className="h-8" onClick={saveManual}>Save</Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  setManualOpen(false);
                  setManualError("");
                }}
              >
                Cancel
              </Button>
              {manualError && <span className="text-xs text-rose-600">{manualError}</span>}
            </div>
          </td>
        </tr>
      )}
      {/* stacked historical sessions for this task (each Start→Stop cycle) */}
      {history.map((h) => (
        <tr key={h.id} className="bg-muted/20">
          <td className="px-2 py-1" />
          <td className="px-2 py-1 text-xs text-muted-foreground pl-6">
            ↳ log #{h.seq}
          </td>
          <td className="px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(h.totalDurationMs)}
          </td>
          <td className="px-2 py-1 text-xs text-muted-foreground font-mono">
            {formatLocalTime(h.timeStarted)}
          </td>
          <td className="px-2 py-1 text-xs text-muted-foreground font-mono">
            {h.timeFinished ? formatLocalTime(h.timeFinished) : "—"}
          </td>
          <td className="px-2 py-1 font-mono text-xs tabular-nums text-amber-600/80">
            {formatDuration((h.pauseEvents || []).reduce((s, pe) => s + (pe.intervalMs || 0), 0))}
          </td>
          <td className="px-2 py-1 text-right">
            {showLogDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title={`Delete log #${h.seq} (${formatDuration(h.totalDurationMs)}) — cannot be undone`}
                onClick={() => {
                  if (window.confirm(`Delete log #${h.seq} (${formatDuration(h.totalDurationMs)}, ${formatLocalTime(h.timeStarted)} → ${h.timeFinished ? formatLocalTime(h.timeFinished) : "—"})? This cannot be undone.`)) {
                    actions.deleteTaskEntry(h.id);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              </Button>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
