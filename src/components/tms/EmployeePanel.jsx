import { useEffect, useState } from "react";
import { Coffee, Clock3, LogIn, LogOut, Pencil, Trash2, Users } from "lucide-react";
import { useTmsState, actions, entryKey, tasksForEmployee, shiftRecordFor } from "@/lib/tmsStore";
import {
  formatLocalTime,
  formatShiftTime,
  formatDuration,
  manualTimeRangeIso,
  manualTimeIso,
} from "@/lib/tmsUtils";
import { useNow } from "@/lib/useNow";
import TaskRow from "./TaskRow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function EmployeePanel({ employee, date }) {
  const s = useTmsState();
  const [selectedKey, setSelectedKey] = useState(null);
  const [breakManualOpen, setBreakManualOpen] = useState(false);
  const [breakStartTime, setBreakStartTime] = useState("");
  const [breakFinishTime, setBreakFinishTime] = useState("");
  const [breakManualError, setBreakManualError] = useState("");
  const [yardEdit, setYardEdit] = useState(null);
  const [yardTime, setYardTime] = useState("");
  const [yardError, setYardError] = useState("");

  const tasks = tasksForEmployee(employee.id);
  const assignedKey = tasks.map((t) => t.id).join(",");
  // Independent row slots: one slot per assigned task; each slot remembers its
  // own dropdown selection. Switching a slot stops+logs prev and starts next.
  const [slotTaskIds, setSlotTaskIds] = useState(() => tasks.map((t) => t.id));
  const [switchErrorBySlot, setSwitchErrorBySlot] = useState({});

  // Keep slots in sync with assignments: preserve each slot's selection when
  // still assigned, fill new slots with newly assigned tasks, drop unassigned.
  useEffect(() => {
    const assignedIds = tasks.map((t) => t.id);
    // Stop orphan timers for tasks that are no longer assigned (no row shows
    // them anymore) so hidden time does not keep accruing.
    slotTaskIds.forEach((id) => {
      if (!assignedIds.includes(id)) {
        const k = entryKey(employee.id, id);
        const e = s.currentEntries[k];
        if (e && (e.status === "running" || e.status === "paused")) {
          actions.stopTask(k);
        }
      }
    });
    setSlotTaskIds((prev) => {
      if (prev.length === 0) return assignedIds;
      const kept = [...new Set(prev.filter((id) => assignedIds.includes(id)))];
      for (const id of assignedIds) {
        if (kept.length >= assignedIds.length) break;
        if (!kept.includes(id)) kept.push(id);
      }
      if (kept.length === prev.length && kept.every((v, i) => v === prev[i]))
        return prev;
      return kept.length > 0 ? kept : assignedIds;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedKey]);
  const rec = shiftRecordFor(employee.id, date) || {};
  // Notes/remarks are per-date: each (employee, date) shift record keeps its
  // own notes + remarks. Editing on one study date never touches others.
  const hasRunningBreak = !!s.currentBreaks[employee.id];
  const breakRunningSince = s.currentBreaks[employee.id]?.timeStarted;
  const anyRunning = slotTaskIds.some(
    (taskId) => s.currentEntries[entryKey(employee.id, taskId)]?.status === "running"
  );
  const now = useNow(1000, anyRunning || hasRunningBreak);

  const liveBreakMs = hasRunningBreak && breakRunningSince
    ? now.getTime() - new Date(breakRunningSince).getTime()
    : 0;

  // Historical sessions per task + running log sequence number.
  // taskTimeEntries stores every finalized Start→Stop cycle (append-only).
  // The sequence is per task across dates, in the order they were logged.
  const allLogs = s.taskTimeEntries.filter((e) => e.employeeId === employee.id);
  const historyByTask = {};
  const seqByTaskId = {};
  tasks.forEach((t) => { historyByTask[t.id] = []; seqByTaskId[t.id] = 0; });
  allLogs.forEach((e) => {
    if (!(e.taskId in historyByTask)) return;
    seqByTaskId[e.taskId] += 1;
    historyByTask[e.taskId].push({ ...e, seq: seqByTaskId[e.taskId] });
  });
  // break logs for this employee (append-only), newest last
  const breakLogs = s.breakRecords.filter((b) => b.employeeId === employee.id);
  const showLogDelete = !!s.settings?.uiPrefs?.showLogDeleteButtons;

  const sel = selectedKey
    ? s.currentEntries[selectedKey]
    : null;
  const canL1Pause = sel?.status === "running";
  const canL1Resume = sel?.status === "paused";

  // Dropdown switch per slot: stop+log prev task, start next task.
  // Rows are independent, but one entry key (employee:task) cannot be shared
  // by two rows — guard duplicates so timers never overwrite each other.
  const handleSlotTaskChange = (slotIndex, nextTaskId) => {
    const prevTaskId = slotTaskIds[slotIndex];
    if (!nextTaskId || nextTaskId === prevTaskId) return;
    if (slotTaskIds.some((id, i) => i !== slotIndex && id === nextTaskId)) {
      setSwitchErrorBySlot((prev) => ({
        ...prev,
        [slotIndex]: "Task already tracked in another row.",
      }));
      return;
    }
    setSwitchErrorBySlot((prev) => {
      if (!(slotIndex in prev)) return prev;
      const next = { ...prev };
      delete next[slotIndex];
      return next;
    });
    actions.switchTask(employee.id, prevTaskId, nextTaskId, date, "L2");
    setSlotTaskIds((prev) =>
      prev.map((id, i) => (i === slotIndex ? nextTaskId : id))
    );
    // Keep L1 row selection on this slot (it follows the new task key).
    setSelectedKey(entryKey(employee.id, nextTaskId));
  };

  const setShiftField = (fields) => {
    if (rec.id) actions.updateShiftRecord(rec.id, fields);
    else actions.upsertShiftRecord({ employeeId: employee.id, date, ...fields });
  };

  const saveManualBreak = () => {
    const range = manualTimeRangeIso(date, breakStartTime, breakFinishTime);
    if (!range) {
      setBreakManualError("Enter a valid Start and Finish. Finish must be after Start.");
      return;
    }
    if (!actions.addManualBreak(employee.id, date, range.startIso, range.finishIso)) {
      setBreakManualError("Stop the running break before saving manual time.");
      return;
    }
    setBreakManualOpen(false);
    setBreakStartTime("");
    setBreakFinishTime("");
    setBreakManualError("");
  };

  const openYardEditor = (field) => {
    setYardEdit(field);
    setYardTime(formatLocalTime(field === "timeInYard" ? rec.timeInYard : rec.timeOutYard));
    setYardError("");
  };

  const saveYardTime = () => {
    const iso = manualTimeIso(date, yardTime);
    if (!iso || !actions.setManualYardTime(employee.id, date, yardEdit, iso)) {
      setYardError("Enter a valid time, for example 2:26 PM.");
      return;
    }
    setYardEdit(null);
    setYardError("");
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-heading font-semibold">{employee.name}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </Badge>
        </div>
        {/* L1 controls */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Employee:</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.employeeStartAll(employee.id, date)}
            className="border-emerald-500 text-emerald-700 hover:bg-emerald-50"
          >
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canL1Pause}
            onClick={() => selectedKey && actions.employeePauseSelected(selectedKey)}
            className="border-amber-500 text-amber-700 hover:bg-amber-50"
            title={selectedKey ? "Pause the selected row" : "Select a row first"}
          >
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canL1Resume}
            onClick={() => selectedKey && actions.employeeResumeSelected(selectedKey)}
            className="border-sky-500 text-sky-700 hover:bg-sky-50"
            title={selectedKey ? "Resume the selected row" : "Select a row first"}
          >
            Resume
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.employeeStopAll(employee.id)}
            className="border-rose-500 text-rose-700 hover:bg-rose-50"
          >
            Stop
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* shift + yard + break row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Shift Time</Label>
            <select
              value={rec.shiftTime || ""}
              onChange={(e) => setShiftField({ shiftTime: e.target.value })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— select shift —</option>
              {s.shiftDefinitions.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({formatShiftTime(d.start)}–{formatShiftTime(d.end)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Time In at Yard</Label>
            <div className="mt-1 flex items-center gap-1">
              <span className="flex-1 h-9 rounded-md border bg-muted/30 px-2 py-1 text-xs font-mono truncate">
                {rec.timeInYard ? formatLocalTime(rec.timeInYard) : "—"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.stampTimeIn(employee.id, date)}
                title="Stamp Time In at Yard"
              >
                <LogIn className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openYardEditor("timeInYard")}
                title="Edit Time In at Yard manually"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
            {yardEdit === "timeInYard" && (
              <div className="mt-1 flex items-end gap-1">
                <Input
                  value={yardTime}
                  onChange={(e) => setYardTime(e.target.value)}
                  placeholder="2:26 PM"
                  className="h-8"
                />
                <Button size="sm" className="h-8" onClick={saveYardTime}>Save</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setYardEdit(null)}>Cancel</Button>
              </div>
            )}
            {yardEdit === "timeInYard" && yardError && (
              <div className="mt-1 text-xs text-rose-600">{yardError}</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Time Out at Yard</Label>
            <div className="mt-1 flex items-center gap-1">
              <span className="flex-1 h-9 rounded-md border bg-muted/30 px-2 py-1 text-xs font-mono truncate">
                {rec.timeOutYard ? formatLocalTime(rec.timeOutYard) : "—"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.stampTimeOut(employee.id, date)}
                title="Stamp Time Out at Yard"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openYardEditor("timeOutYard")}
                title="Edit Time Out at Yard manually"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </div>
            {yardEdit === "timeOutYard" && (
              <div className="mt-1 flex items-end gap-1">
                <Input
                  value={yardTime}
                  onChange={(e) => setYardTime(e.target.value)}
                  placeholder="5:45 PM"
                  className="h-8"
                />
                <Button size="sm" className="h-8" onClick={saveYardTime}>Save</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setYardEdit(null)}>Cancel</Button>
              </div>
            )}
            {yardEdit === "timeOutYard" && yardError && (
              <div className="mt-1 text-xs text-rose-600">{yardError}</div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Break Timer</Label>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={cn(
                  "flex-1 h-9 rounded-md border px-2 py-1 text-xs font-mono truncate",
                  hasRunningBreak ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-muted/30"
                )}
              >
                {hasRunningBreak ? formatDuration(liveBreakMs) : "—"}
              </span>
              {hasRunningBreak ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actions.stopBreak(employee.id)}
                  className="border-rose-500 text-rose-700"
                >
                  <Coffee className="w-3.5 h-3.5" /> Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => actions.startBreak(employee.id, date)}
                  className="border-amber-500 text-amber-700"
                >
                  <Coffee className="w-3.5 h-3.5" /> Start
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBreakManualOpen((open) => !open);
                  setBreakManualError("");
                }}
                title="Enter break Start and Finish times manually"
                className="border-violet-500 text-violet-700"
                disabled={hasRunningBreak}
              >
                <Clock3 className="w-3.5 h-3.5" /> Manual
              </Button>
            </div>
            {breakManualOpen && (
              <div className="mt-1 flex flex-wrap items-end gap-1">
                <div>
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <Input
                    value={breakStartTime}
                    onChange={(e) => setBreakStartTime(e.target.value)}
                    placeholder="2:26 PM"
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Finish</Label>
                  <Input
                    value={breakFinishTime}
                    onChange={(e) => setBreakFinishTime(e.target.value)}
                    placeholder="2:46 PM"
                    className="h-8"
                  />
                </div>
                <Button size="sm" className="h-8" onClick={saveManualBreak}>Save</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    setBreakManualOpen(false);
                    setBreakManualError("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
            {breakManualError && (
              <div className="mt-1 text-xs text-rose-600">{breakManualError}</div>
            )}
            {/* stacked break history (each Start→Stop cycle) */}
            {breakLogs.length > 0 && (
              <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto pr-1">
                {breakLogs.map((b, i) => (
                  <div key={b.id} className="flex items-center justify-between text-xs text-muted-foreground font-mono bg-muted/20 rounded px-2 py-0.5">
                    <span>↳ break #{i + 1}: {formatLocalTime(b.timeStarted)}–{formatLocalTime(b.timeFinished)}</span>
                    <span className="flex items-center gap-1">
                      <span className="tabular-nums">{formatDuration(b.durationMs || 0)}</span>
                      {showLogDelete && (
                        <button
                          type="button"
                          title={`Delete break #${i + 1} (${formatDuration(b.durationMs || 0)}) — cannot be undone`}
                          onClick={() => {
                            if (window.confirm(`Delete break #${i + 1} (${formatDuration(b.durationMs || 0)}, ${formatLocalTime(b.timeStarted)} → ${formatLocalTime(b.timeFinished)})? This cannot be undone.`)) {
                              actions.deleteBreakRecord(b.id);
                            }
                          }}
                          className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-rose-100"
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* attendance + reason */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Attendance Status</Label>
            <select
              value={rec.attendanceStatus || ""}
              onChange={(e) => setShiftField({ attendanceStatus: e.target.value })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— set —</option>
              <option value="On time">On time</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Reason</Label>
            <Input
              value={rec.reason || ""}
              onChange={(e) => setShiftField({ reason: e.target.value })}
              className="mt-1"
              placeholder="Reason for attendance status"
            />
          </div>
        </div>

        {/* task rows */}
        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground italic py-2">
            No tasks assigned. Assign tasks in Settings → Task list.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left w-8" title="Select row for employee Pause/Resume">L1</th>
                  <th className="px-2 py-2 text-left">Task</th>
                  <th className="px-2 py-2 text-left">Duration</th>
                  <th className="px-2 py-2 text-left">Started</th>
                  <th className="px-2 py-2 text-left">Finished</th>
                  <th className="px-2 py-2 text-left">Paused</th>
                  <th className="px-2 py-2 text-left">Row Controls (L2)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {slotTaskIds.map((taskId, slotIndex) => {
                  const t = tasks.find((x) => x.id === taskId) || s.tasks.find((x) => x.id === taskId);
                  if (!t) return null;
                  const key = entryKey(employee.id, t.id);
                  const entry = s.currentEntries[key];
                  return (
                    <TaskRow
                      key={`slot-${slotIndex}`}
                      task={t}
                      taskOptions={tasks}
                      selectedTaskId={t.id}
                      onTaskChange={(nextId) => handleSlotTaskChange(slotIndex, nextId)}
                      switchError={switchErrorBySlot[slotIndex] || ""}
                      entry={entry}
                      history={historyByTask[t.id] || []}
                      selected={selectedKey === key}
                      onSelect={() => setSelectedKey(key)}
                      onStart={() => actions.startTask(employee.id, t.id, date, "L2")}
                      onPause={() => actions.pauseTask(key)}
                      onResume={() => actions.resumeTask(key)}
                      onStop={() => actions.stopTask(key)}
                      date={date}
                      onManualSave={(startIso, finishIso) =>
                        actions.addManualTaskEntry(employee.id, t.id, date, startIso, finishIso)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* notes + remarks — per-date: each study date keeps its own */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={rec.notes || ""}
              onChange={(e) => setShiftField({ notes: e.target.value })}
              className="mt-1 min-h-[60px]"
              placeholder="Notes"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Remarks</Label>
            <Textarea
              value={rec.remarks || ""}
              onChange={(e) => setShiftField({ remarks: e.target.value })}
              className="mt-1 min-h-[60px]"
              placeholder="Remarks"
            />
          </div>
        </div>
      </div>
    </div>
  );
}