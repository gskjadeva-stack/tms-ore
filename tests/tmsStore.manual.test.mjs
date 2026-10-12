import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const baseState = {
  employees: [{ id: "emp-1", name: "Juan Dela Cruz" }],
  tasks: [{ id: "task-1", name: "TEST" }],
  assignments: [{ id: "asg-1", employeeId: "emp-1", taskId: "task-1" }],
  shiftDefinitions: [],
  breakConfig: { label: "Break", defaultDurationMin: 30 },
  shiftRecords: [],
  currentEntries: {},
  taskTimeEntries: [],
  breakRecords: [],
  currentBreaks: {},
  settings: { llm: {}, exportPrefs: { defaultFormat: "both" } },
};

async function loadStore(query, state = {}) {
  globalThis.localStorage = new MemoryStorage();
  localStorage.setItem(
    "tms_state_v1",
    JSON.stringify({
      ...baseState,
      ...state,
      settings: { ...baseState.settings, ...(state.settings || {}) },
    })
  );
  return import(`../src/lib/tmsStore.js?manual-${query}`);
}

test("manual task entry appends a completed log and updates the current row", async () => {
  const { actions, getState } = await loadStore("task");
  const startIso = "2026-09-25T06:26:00.000Z";
  const finishIso = "2026-09-25T07:45:00.000Z";

  assert.equal(actions.addManualTaskEntry("emp-1", "task-1", "2026-09-25", startIso, finishIso), true);

  const state = getState();
  assert.equal(state.taskTimeEntries.length, 1);
  assert.equal(state.taskTimeEntries[0].status, "stopped");
  assert.equal(state.taskTimeEntries[0].timeStarted, startIso);
  assert.equal(state.taskTimeEntries[0].timeFinished, finishIso);
  assert.equal(state.taskTimeEntries[0].totalDurationMs, 79 * 60 * 1000);
  assert.equal(state.currentEntries["emp-1:task-1"].status, "stopped");
});

test("manual task entry does not replace a running task", async () => {
  const running = {
    key: "emp-1:task-1",
    employeeId: "emp-1",
    taskId: "task-1",
    date: "2026-09-25",
    timeStarted: "2026-09-25T06:00:00.000Z",
    runningSince: "2026-09-25T06:00:00.000Z",
    accumulatedActiveMs: 0,
    pausedAt: null,
    pauseEvents: [],
    timeFinished: null,
    totalDurationMs: 0,
    status: "running",
    triggeringLevel: "L2",
  };
  const { actions, getState } = await loadStore("task-active", {
    currentEntries: { "emp-1:task-1": running },
  });

  assert.equal(actions.addManualTaskEntry(
    "emp-1",
    "task-1",
    "2026-09-25",
    "2026-09-25T06:26:00.000Z",
    "2026-09-25T07:45:00.000Z"
  ), false);
  assert.deepEqual(getState().currentEntries["emp-1:task-1"], running);
  assert.equal(getState().taskTimeEntries.length, 0);
});

test("manual break entry appends a completed break without creating a live break", async () => {
  const { actions, getState } = await loadStore("break");
  const startIso = "2026-09-25T06:26:00.000Z";
  const finishIso = "2026-09-25T06:46:00.000Z";

  assert.equal(actions.addManualBreak("emp-1", "2026-09-25", startIso, finishIso), true);

  const state = getState();
  assert.equal(state.breakRecords.length, 1);
  assert.equal(state.breakRecords[0].durationMs, 20 * 60 * 1000);
  assert.equal(state.breakRecords[0].timeStarted, startIso);
  assert.equal(state.breakRecords[0].timeFinished, finishIso);
  assert.equal(state.currentBreaks["emp-1"], undefined);
});

test("manual break entry does not replace a running break", async () => {
  const running = {
    employeeId: "emp-1",
    date: "2026-09-25",
    timeStarted: "2026-09-25T06:00:00.000Z",
    status: "running",
  };
  const { actions, getState } = await loadStore("break-active", {
    currentBreaks: { "emp-1": running },
  });

  assert.equal(actions.addManualBreak(
    "emp-1",
    "2026-09-25",
    "2026-09-25T06:26:00.000Z",
    "2026-09-25T06:46:00.000Z"
  ), false);
  assert.deepEqual(getState().currentBreaks["emp-1"], running);
  assert.equal(getState().breakRecords.length, 0);
});

test("manual yard edit updates only the selected field", async () => {
  const { actions, getState } = await loadStore("yard", {
    shiftRecords: [
      {
        id: "rec-1",
        employeeId: "emp-1",
        date: "2026-09-25",
        timeInYard: "2026-09-25T00:00:00.000Z",
        timeOutYard: "2026-09-25T09:00:00.000Z",
      },
    ],
  });
  const edited = "2026-09-25T08:15:00.000Z";

  assert.equal(actions.setManualYardTime("emp-1", "2026-09-25", "timeInYard", edited), true);

  const record = getState().shiftRecords[0];
  assert.equal(record.timeInYard, edited);
  assert.equal(record.timeOutYard, "2026-09-25T09:00:00.000Z");
});
