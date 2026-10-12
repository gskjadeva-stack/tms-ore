// Time & Motion Study — localStorage-backed store with useSyncExternalStore.
// No server entities. All data lives in the browser under a single key.
import { useSyncExternalStore } from "react";
import { uid, nowIso, diffMs } from "./tmsUtils.js";

const STORAGE_KEY = "tms_state_v1";

function defaultState() {
  return {
    employees: [], // { id, name } — notes/remarks live on per-date shiftRecords (not on the employee)
    tasks: [], // { id, name }
    assignments: [], // { id, employeeId, taskId }
    shiftDefinitions: [], // { id, name, start:"HH:MM", end:"HH:MM" }
    breakConfig: { label: "Break", defaultDurationMin: 30 },
    shiftRecords: [], // { id, employeeId, date, shiftTime, timeInYard, timeOutYard, attendanceStatus, reason, notes, remarks }
    currentEntries: {}, // key `${employeeId}:${taskId}` -> live entry
    taskTimeEntries: [], // finalized entries (history)
    breakRecords: [], // { id, employeeId, date, timeStarted, timeFinished, durationMs, status }
    currentBreaks: {}, // key employeeId -> live break
    settings: {
      llm: { apiKey: "", provider: "", model: "", baseUrl: "" },
      exportPrefs: { defaultFormat: "both" }, // 'csv' | 'pdf' | 'both'
      uiPrefs: { showLogDeleteButtons: false }, // per-log delete buttons on Time Capture rows
    },
  };
}

function dedupeShiftRecords(records) {
  // Merge duplicate shift records sharing (employeeId + date).
  // Keeps the first row's id, fills empty fields from later duplicates.
  // Returns { records, removed }.
  const byKey = new Map();
  let removed = 0;
  for (const r of records) {
    const key = `${r.employeeId}::${r.date}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...r });
      continue;
    }
    removed += 1;
    const keep = byKey.get(key);
    for (const [k, v] of Object.entries(r)) {
      if (k === "id") continue;
      if ((keep[k] === undefined || keep[k] === null || keep[k] === "") && v !== undefined && v !== null && v !== "") {
        keep[k] = v;
      }
    }
  }
  return { records: [...byKey.values()], removed };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = defaultState();
      const merged = dedupeShiftRecords(parsed.shiftRecords || []);
      if (merged.removed > 0) {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...parsed, shiftRecords: merged.records })
          );
        } catch (e) {
          /* ignore persist failure */
        }
      }
      return {
        ...base,
        ...parsed,
        shiftRecords: merged.records,
        settings: {
          ...base.settings,
          ...(parsed.settings || {}),
          uiPrefs: { ...base.settings.uiPrefs, ...((parsed.settings || {}).uiPrefs || {}) },
        },
      };
    }
  } catch (e) {
    /* ignore */
  }
  return defaultState();
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
}

function setState(updater) {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}

export function useTmsState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
export function getState() {
  return state;
}

// ---- helpers ----
export const entryKey = (employeeId, taskId) => `${employeeId}:${taskId}`;
export const tasksForEmployee = (employeeId) =>
  state.assignments
    .filter((a) => a.employeeId === employeeId)
    .map((a) => state.tasks.find((t) => t.id === a.taskId))
    .filter(Boolean);

export const shiftRecordFor = (employeeId, date) =>
  state.shiftRecords.find((r) => r.employeeId === employeeId && r.date === date);

// ---- actions ----
export const actions = {
  // Employees
  addEmployee(name) {
    setState((s) => ({ ...s, employees: [...s.employees, { id: uid("emp"), name }] }));
  },
  updateEmployee(id, fields) {
    const patch = typeof fields === "string" ? { name: fields } : fields;
    setState((s) => ({
      ...s,
      employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },
  deleteEmployee(id) {
    setState((s) => {
      const cur = { ...s.currentEntries };
      Object.keys(cur).forEach((k) => {
        if (k.startsWith(id + ":")) delete cur[k];
      });
      const cb = { ...s.currentBreaks };
      delete cb[id];
      return {
        ...s,
        employees: s.employees.filter((e) => e.id !== id),
        assignments: s.assignments.filter((a) => a.employeeId !== id),
        currentEntries: cur,
        currentBreaks: cb,
        shiftRecords: s.shiftRecords.filter((r) => r.employeeId !== id),
        breakRecords: s.breakRecords.filter((b) => b.employeeId !== id),
      };
    });
  },

  // Tasks
  addTask(name) {
    setState((s) => ({ ...s, tasks: [...s.tasks, { id: uid("task"), name }] }));
  },
  updateTask(id, name) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  },
  deleteTask(id) {
    setState((s) => {
      const cur = { ...s.currentEntries };
      Object.keys(cur).forEach((k) => {
        if (k.endsWith(":" + id)) delete cur[k];
      });
      return {
        ...s,
        tasks: s.tasks.filter((t) => t.id !== id),
        assignments: s.assignments.filter((a) => a.taskId !== id),
        currentEntries: cur,
      };
    });
  },

  // Assignments
  assignTask(employeeId, taskId) {
    setState((s) => {
      if (s.assignments.some((a) => a.employeeId === employeeId && a.taskId === taskId))
        return s;
      return {
        ...s,
        assignments: [...s.assignments, { id: uid("asg"), employeeId, taskId }],
      };
    });
  },
  unassignTask(employeeId, taskId) {
    setState((s) => ({
      ...s,
      assignments: s.assignments.filter(
        (a) => !(a.employeeId === employeeId && a.taskId === taskId)
      ),
    }));
  },

  // Shift definitions
  addShiftDefinition(name, start, end) {
    setState((s) => ({
      ...s,
      shiftDefinitions: [...s.shiftDefinitions, { id: uid("shf"), name, start, end }],
    }));
  },
  updateShiftDefinition(id, fields) {
    setState((s) => ({
      ...s,
      shiftDefinitions: s.shiftDefinitions.map((d) => (d.id === id ? { ...d, ...fields } : d)),
    }));
  },
  deleteShiftDefinition(id) {
    setState((s) => ({
      ...s,
      shiftDefinitions: s.shiftDefinitions.filter((d) => d.id !== id),
    }));
  },

  setBreakConfig(fields) {
    setState((s) => ({ ...s, breakConfig: { ...s.breakConfig, ...fields } }));
  },

  // Settings
  setLlmConfig(fields) {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, llm: { ...s.settings.llm, ...fields } },
    }));
  },
  setExportPrefs(fields) {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, exportPrefs: { ...s.settings.exportPrefs, ...fields } },
    }));
  },
  setUiPrefs(fields) {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, uiPrefs: { ...(s.settings.uiPrefs || {}), ...fields } },
    }));
  },

  // Shift records (one per employee + date) — upsert always matches on
  // (employeeId + date), never on a stale row id, so duplicates can't form.
  upsertShiftRecord(fields) {
    setState((s) => {
      const existing = s.shiftRecords.find(
        (r) => r.employeeId === fields.employeeId && r.date === fields.date
      );
      if (existing) {
        return {
          ...s,
          shiftRecords: s.shiftRecords.map((r) =>
            r.id === existing.id ? { ...r, ...fields } : r
          ),
        };
      }
      return { ...s, shiftRecords: [...s.shiftRecords, { id: uid("rec"), ...fields }] };
    });
  },
  updateShiftRecord(id, fields) {
    setState((s) => ({
      ...s,
      shiftRecords: s.shiftRecords.map((r) => (r.id === id ? { ...r, ...fields } : r)),
    }));
  },

  // Yard times
  stampTimeIn(employeeId, date) {
    actions.upsertShiftRecord({ employeeId, date, timeInYard: nowIso() });
  },
  stampTimeOut(employeeId, date) {
    const rec = shiftRecordFor(employeeId, date);
    if (rec) actions.updateShiftRecord(rec.id, { timeOutYard: nowIso() });
    else actions.upsertShiftRecord({ employeeId, date, timeOutYard: nowIso() });
  },
  setManualYardTime(employeeId, date, field, iso) {
    if (field !== "timeInYard" && field !== "timeOutYard") return false;
    if (!iso || isNaN(new Date(iso).getTime())) return false;
    setState((s) => {
      const existing = s.shiftRecords.find(
        (r) => r.employeeId === employeeId && r.date === date
      );
      if (existing) {
        return {
          ...s,
          shiftRecords: s.shiftRecords.map((r) =>
            r.id === existing.id ? { ...r, [field]: iso } : r
          ),
        };
      }
      return {
        ...s,
        shiftRecords: [...s.shiftRecords, { id: uid("rec"), employeeId, date, [field]: iso }],
      };
    });
    return true;
  },

  // Break timer (button-triggered, per employee). Starting a break
  // auto-stops the employee's running/paused task timer (elapsed time is
  // logged to history, same as pressing Stop) — a break means no task runs.
  startBreak(employeeId, date) {
    setState((s) => {
      if (s.currentBreaks[employeeId]) return s;
      const stopNow = nowIso();
      const next = { ...s.currentEntries };
      let hist = s.taskTimeEntries;
      let added = null;
      // Auto-stop this employee's active task timers first
      Object.keys(next).forEach((k) => {
        if (!k.startsWith(employeeId + ":")) return;
        const t = next[k];
        if (t && (t.status === "running" || t.status === "paused")) {
          let acc = t.accumulatedActiveMs || 0;
          let events = t.pauseEvents || [];
          if (t.status === "running" && t.runningSince) {
            acc += diffMs(t.runningSince, stopNow);
          } else if (t.status === "paused") {
            events = events.map((pe) =>
              pe.timeResumed
                ? pe
                : { ...pe, timeResumed: stopNow, intervalMs: diffMs(pe.timePaused, stopNow) }
            );
          }
          const totalPausedMs = events.reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
          const stopped = {
            ...t,
            status: "stopped",
            timeFinished: stopNow,
            runningSince: null,
            pausedAt: null,
            accumulatedActiveMs: acc,
            pauseEvents: events,
            totalDurationMs: acc,
            totalPausedMs,
          };
          next[k] = stopped;
          added = added ? [...added, { ...stopped, id: uid("tte") }] : [{ ...stopped, id: uid("tte") }];
        }
      });
      if (added) hist = [...hist, ...added];
      return {
        ...s,
        currentEntries: next,
        taskTimeEntries: hist,
        currentBreaks: {
          ...s.currentBreaks,
          [employeeId]: { employeeId, date, timeStarted: stopNow, status: "running" },
        },
      };
    });
  },
  stopBreak(employeeId) {
    setState((s) => {
      const b = s.currentBreaks[employeeId];
      if (!b) return s;
      const fin = nowIso();
      const rec = {
        id: uid("brk"),
        employeeId: b.employeeId,
        date: b.date,
        timeStarted: b.timeStarted,
        timeFinished: fin,
        durationMs: diffMs(b.timeStarted, fin),
        status: "stopped",
      };
      const rest = { ...s.currentBreaks };
      delete rest[employeeId];
      return { ...s, currentBreaks: rest, breakRecords: [...s.breakRecords, rec] };
    });
  },
  addManualBreak(employeeId, date, startIso, finishIso) {
    const durationMs = diffMs(startIso, finishIso);
    if (durationMs <= 0 || state.currentBreaks[employeeId]) return false;
    const rec = {
      id: uid("brk"),
      employeeId,
      date,
      timeStarted: startIso,
      timeFinished: finishIso,
      durationMs,
      status: "stopped",
    };
    setState((s) => ({ ...s, breakRecords: [...s.breakRecords, rec] }));
    return true;
  },

  // Task timers: ONE active task per employee. Starting a task auto-stops any
  // other running/paused task of the SAME employee (elapsed time is logged to
  // history, same as pressing Stop). Breaks are separate.
  startTask(employeeId, taskId, date, triggeringLevel = "L2") {
    setState((s) => {
      const key = entryKey(employeeId, taskId);
      const cur = s.currentEntries[key];
      if (cur && (cur.status === "running" || cur.status === "paused")) return s;
      const next = { ...s.currentEntries };
      const hist = [...s.taskTimeEntries];
      // Auto-stop sibling timers of the same employee first
      Object.keys(next).forEach((k) => {
        if (k === key || !k.startsWith(employeeId + ":")) return;
        const sib = next[k];
        if (sib && (sib.status === "running" || sib.status === "paused")) {
          const stopNow = nowIso();
          let acc = sib.accumulatedActiveMs || 0;
          let events = sib.pauseEvents || [];
          if (sib.status === "running" && sib.runningSince) {
            acc += diffMs(sib.runningSince, stopNow);
          } else if (sib.status === "paused") {
            events = events.map((pe) =>
              pe.timeResumed
                ? pe
                : { ...pe, timeResumed: stopNow, intervalMs: diffMs(pe.timePaused, stopNow) }
            );
          }
          const totalPausedMs = events.reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
          const stopped = {
            ...sib,
            status: "stopped",
            timeFinished: stopNow,
            runningSince: null,
            pausedAt: null,
            accumulatedActiveMs: acc,
            pauseEvents: events,
            totalDurationMs: acc,
            totalPausedMs,
          };
          next[k] = stopped;
          hist.push({ ...stopped, id: uid("tte") });
        }
      });
      const startNow = nowIso();
      const entry = {
        key,
        employeeId,
        taskId,
        date,
        timeStarted: startNow,
        runningSince: startNow,
        accumulatedActiveMs: 0,
        pausedAt: null,
        pauseEvents: [],
        timeFinished: null,
        totalDurationMs: 0,
        status: "running",
        triggeringLevel,
      };
      next[key] = entry;
      return { ...s, currentEntries: next, taskTimeEntries: hist };
    });
  },
  pauseTask(key) {
    setState((s) => {
      const e = s.currentEntries[key];
      if (!e || e.status !== "running") return s;
      const now = nowIso();
      const acc = e.accumulatedActiveMs + diffMs(e.runningSince, now);
      const pauseEvent = { id: uid("ps"), timePaused: now, timeResumed: null, intervalMs: null };
      return {
        ...s,
        currentEntries: {
          ...s.currentEntries,
          [key]: {
            ...e,
            status: "paused",
            pausedAt: now,
            runningSince: null,
            accumulatedActiveMs: acc,
            pauseEvents: [...e.pauseEvents, pauseEvent],
          },
        },
      };
    });
  },
  resumeTask(key) {
    setState((s) => {
      const e = s.currentEntries[key];
      if (!e || e.status !== "paused") return s;
      // One active task per employee: resuming must also auto-stop a sibling
      // that is running (e.g. started while this one was paused).
      const employeeId = key.split(":")[0];
      const next = { ...s.currentEntries };
      let hist = s.taskTimeEntries;
      let added = null;
      Object.keys(next).forEach((k) => {
        if (k === key || !k.startsWith(employeeId + ":")) return;
        const sib = next[k];
        if (sib && sib.status === "running") {
          const stopNow = nowIso();
          const acc = (sib.accumulatedActiveMs || 0) +
            (sib.runningSince ? diffMs(sib.runningSince, stopNow) : 0);
          const events = sib.pauseEvents || [];
          const totalPausedMs = events.reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
          const stopped = {
            ...sib,
            status: "stopped",
            timeFinished: stopNow,
            runningSince: null,
            pausedAt: null,
            accumulatedActiveMs: acc,
            pauseEvents: events,
            totalDurationMs: acc,
            totalPausedMs,
          };
          next[k] = stopped;
          added = { ...stopped, id: uid("tte") };
        }
      });
      if (added) hist = [...hist, added];
      const now = nowIso();
      const events = e.pauseEvents.map((pe) =>
        pe.timeResumed ? pe : { ...pe, timeResumed: now, intervalMs: diffMs(pe.timePaused, now) }
      );
      next[key] = { ...e, status: "running", runningSince: now, pausedAt: null, pauseEvents: events };
      return { ...s, currentEntries: next, taskTimeEntries: hist };
    });
  },
  stopTask(key) {
    setState((s) => {
      const e = s.currentEntries[key];
      if (!e || e.status === "idle" || e.status === "stopped") return s;
      const now = nowIso();
      let acc = e.accumulatedActiveMs;
      let events = e.pauseEvents;
      if (e.status === "running") {
        acc += diffMs(e.runningSince, now);
      } else if (e.status === "paused") {
        events = e.pauseEvents.map((pe) =>
          pe.timeResumed ? pe : { ...pe, timeResumed: now, intervalMs: diffMs(pe.timePaused, now) }
        );
      }
      const totalPausedMs = events.reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
      const finished = {
        ...e,
        status: "stopped",
        timeFinished: now,
        accumulatedActiveMs: acc,
        pauseEvents: events,
        totalDurationMs: acc,
        totalPausedMs,
      };
      const historyEntry = { ...finished, id: uid("tte") };
      return {
        ...s,
        currentEntries: { ...s.currentEntries, [key]: finished },
        taskTimeEntries: [...s.taskTimeEntries, historyEntry],
      };
    });
  },
  // Row dropdown auto-switch: stop prev task (log elapsed) + start next task.
  // Atomic single setState so no interval is lost on rapid switches.
  // Rows stay independent: only the two keys for this slot are touched.
  switchTask(employeeId, prevTaskId, nextTaskId, date, triggeringLevel = "L2") {
    if (!employeeId || !prevTaskId || !nextTaskId || prevTaskId === nextTaskId)
      return false;
    let changed = false;
    setState((s) => {
      const prevKey = entryKey(employeeId, prevTaskId);
      const nextKey = entryKey(employeeId, nextTaskId);
      const prev = s.currentEntries[prevKey];
      const next = s.currentEntries[nextKey];
      const now = nowIso();
      const cur = { ...s.currentEntries };
      let logs = s.taskTimeEntries;
      // 1) Stop + log the previous task when it is active.
      if (prev && (prev.status === "running" || prev.status === "paused")) {
        let acc = prev.accumulatedActiveMs || 0;
        let events = prev.pauseEvents || [];
        if (prev.status === "running" && prev.runningSince) {
          acc += diffMs(prev.runningSince, now);
        } else if (prev.status === "paused") {
          events = events.map((pe) =>
            pe.timeResumed
              ? pe
              : { ...pe, timeResumed: now, intervalMs: diffMs(pe.timePaused, now) }
          );
        }
        const totalPausedMs = events.reduce((sum, pe) => sum + (pe.intervalMs || 0), 0);
        const finished = {
          ...prev,
          status: "stopped",
          timeFinished: now,
          accumulatedActiveMs: acc,
          pauseEvents: events,
          totalDurationMs: acc,
          totalPausedMs,
        };
        cur[prevKey] = finished;
        logs = [...logs, { ...finished, id: uid("tte") }];
        changed = true;
      }
      // 2) Start the newly selected task when it is idle.
      // If it is already running/paused (e.g. mirrored in another row),
      // leave it untouched — prev was still logged above.
      if (!next || next.status === "idle" || next.status === "stopped") {
        cur[nextKey] = {
          key: nextKey,
          employeeId,
          taskId: nextTaskId,
          date,
          timeStarted: now,
          runningSince: now,
          accumulatedActiveMs: 0,
          pausedAt: null,
          pauseEvents: [],
          timeFinished: null,
          totalDurationMs: 0,
          status: "running",
          triggeringLevel,
        };
        changed = true;
      }
      if (!changed) return s;
      return { ...s, currentEntries: cur, taskTimeEntries: logs };
    });
    return changed;
  },
  addManualTaskEntry(employeeId, taskId, date, startIso, finishIso) {
    const key = entryKey(employeeId, taskId);
    const totalDurationMs = diffMs(startIso, finishIso);
    const active = state.currentEntries[key];
    if (
      totalDurationMs <= 0 ||
      (active && (active.status === "running" || active.status === "paused"))
    ) return false;
    const finished = {
      key,
      employeeId,
      taskId,
      date,
      timeStarted: startIso,
      runningSince: null,
      accumulatedActiveMs: totalDurationMs,
      pausedAt: null,
      pauseEvents: [],
      timeFinished: finishIso,
      totalDurationMs,
      totalPausedMs: 0,
      status: "stopped",
      triggeringLevel: "Manual",
    };
    const historyEntry = { ...finished, id: uid("tte") };
    setState((s) => ({
      ...s,
      currentEntries: { ...s.currentEntries, [key]: finished },
      taskTimeEntries: [...s.taskTimeEntries, historyEntry],
    }));
    return true;
  },

  // Master: Start All for a selected group. One active task per employee:
  // starts only the FIRST idle/stopped task per employee (running/paused
  // timers are skipped; per-employee and per-row controls stay active).
  startAll(employees, date) {
    setState((s) => {
      const next = { ...s.currentEntries };
      employees.forEach((emp) => {
        const tIds = s.assignments
          .filter((a) => a.employeeId === emp.id)
          .map((a) => a.taskId);
        // Skip employees that already have an active timer
        const hasActive = tIds.some((taskId) => {
          const cur = next[entryKey(emp.id, taskId)];
          return cur && (cur.status === "running" || cur.status === "paused");
        });
        if (hasActive) return;
        const firstIdle = tIds.find((taskId) => {
          const cur = next[entryKey(emp.id, taskId)];
          return !cur || cur.status === "idle" || cur.status === "stopped";
        });
        if (!firstIdle) return;
        const key = entryKey(emp.id, firstIdle);
        next[key] = {
          key,
          employeeId: emp.id,
          taskId: firstIdle,
          date,
          timeStarted: nowIso(),
          runningSince: nowIso(),
          accumulatedActiveMs: 0,
          pausedAt: null,
          pauseEvents: [],
          timeFinished: null,
          totalDurationMs: 0,
          status: "running",
          triggeringLevel: "L0",
        };
      });
      return { ...s, currentEntries: next };
    });
  },

  // Employee-level (L1) controls
  employeeStartAll(employeeId, date) {
    const tIds = state.assignments
      .filter((a) => a.employeeId === employeeId)
      .map((a) => a.taskId);
    tIds.forEach((taskId) => {
      const key = entryKey(employeeId, taskId);
      const cur = state.currentEntries[key];
      if (!cur || cur.status === "idle" || cur.status === "stopped") {
        actions.startTask(employeeId, taskId, date, "L1");
      }
    });
  },
  employeeStopAll(employeeId) {
    const tIds = state.assignments
      .filter((a) => a.employeeId === employeeId)
      .map((a) => a.taskId);
    tIds.forEach((taskId) => {
      const key = entryKey(employeeId, taskId);
      const cur = state.currentEntries[key];
      if (cur && (cur.status === "running" || cur.status === "paused")) {
        actions.stopTask(key);
      }
    });
  },
  // L1 Pause / Resume act only on the selected row (per Open Question 13)
  employeePauseSelected(key) {
    actions.pauseTask(key);
  },
  employeeResumeSelected(key) {
    actions.resumeTask(key);
  },
  // Delete a single finalized history entry by id (e.g. accidental 2s log).
  // Gated by the Settings toggle (uiPrefs.showLogDeleteButtons) — the UI
  // hides the button, and this action refuses when the toggle is off.
  // Returns true when a row was removed.
  deleteTaskEntry(entryId) {
    let removed = false;
    setState((s) => {
      if (!s.settings?.uiPrefs?.showLogDeleteButtons) return s;
      const kept = s.taskTimeEntries.filter((e) => e.id !== entryId);
      removed = kept.length !== s.taskTimeEntries.length;
      if (!removed) return s;
      return { ...s, taskTimeEntries: kept };
    });
    return removed;
  },
  // Delete a single shift record by id.
  // Same gate as deleteTaskEntry: Settings toggle must be ON.
  // Returns true when a row was removed.
  deleteShiftRecord(recordId) {
    let removed = false;
    setState((s) => {
      if (!s.settings?.uiPrefs?.showLogDeleteButtons) return s;
      const kept = s.shiftRecords.filter((r) => r.id !== recordId);
      removed = kept.length !== s.shiftRecords.length;
      if (!removed) return s;
      return { ...s, shiftRecords: kept };
    });
    return removed;
  },
  // Delete a single finalized break record by id.
  // Same gate as deleteTaskEntry: Settings toggle must be ON.
  // Returns true when a row was removed.
  deleteBreakRecord(breakId) {
    let removed = false;
    setState((s) => {
      if (!s.settings?.uiPrefs?.showLogDeleteButtons) return s;
      const kept = s.breakRecords.filter((b) => b.id !== breakId);
      removed = kept.length !== s.breakRecords.length;
      if (!removed) return s;
      return { ...s, breakRecords: kept };
    });
    return removed;
  },
  // Replace the whole working state with records loaded from the database.
  // Live running/paused timers are NOT restored (DB stores only stopped
  // data) — current live entries/breaks are cleared.
  replaceFromDatabase(data) {
    setState((s) => ({
      ...s,
      employees: data.employees || [],
      tasks: data.tasks || [],
      assignments: data.assignments || [],
      shiftDefinitions: data.shiftDefinitions || [],
      shiftRecords: data.shiftRecords || [],
      currentEntries: {},
      taskTimeEntries: data.taskTimeEntries || [],
      breakRecords: data.breakRecords || [],
      currentBreaks: {},
    }));
  },
  // Danger: clear captured records only (shift/task/break history + live
  // timers). Keeps masters (employees/tasks/assignments/shifts) + settings.
  resetRecords() {
    setState((s) => ({
      ...s,
      shiftRecords: [],
      currentEntries: {},
      taskTimeEntries: [],
      breakRecords: [],
      currentBreaks: {},
    }));
  },
};