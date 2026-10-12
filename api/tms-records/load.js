// GET /api/tms-records/load — full snapshot mapped to browser camelCase.
// Mirrors server/index.js load mapping incl. byEntry pause grouping.
const { getPrisma } = require('../_db');
const { requireUser, sendError } = require('../_auth');

const iso = (v) => (v ? new Date(v).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireUser(req);
    const prisma = getPrisma();
    const [employees, tasks, assignments, shiftDefinitions, shiftRecords, taskEntries, pauseEvents, breakRecords] =
      await Promise.all([
        prisma.tmsEmployee.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsTask.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsAssignment.findMany({ orderBy: { id: 'asc' } }),
        prisma.tmsShiftDefinition.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsShiftRecord.findMany({ orderBy: { date: 'asc' } }),
        prisma.tmsTaskEntry.findMany({ orderBy: { date: 'asc' } }),
        prisma.tmsPauseEvent.findMany({ orderBy: { id: 'asc' } }),
        prisma.tmsBreakRecord.findMany({ orderBy: { date: 'asc' } }),
      ]);
    const byEntry = {};
    pauseEvents.forEach((p) => {
      const k = p.taskEntryId;
      (byEntry[k] = byEntry[k] || []).push({
        id: p.id,
        timePaused: iso(p.timePaused),
        timeResumed: iso(p.timeResumed),
        intervalMs: p.intervalMs === null ? null : Number(p.intervalMs),
      });
    });
    res.json({
      ok: true,
      employees: employees.map((e) => ({ id: e.id, name: e.name, notes: e.notes || '', remarks: e.remarks || '' })),
      tasks: tasks.map((t) => ({ id: t.id, name: t.name })),
      assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, taskId: a.taskId })),
      shiftDefinitions: shiftDefinitions.map((d) => ({ id: d.id, name: d.name, start: d.startHhmm, end: d.endHhmm })),
      shiftRecords: shiftRecords.map((r) => ({
        id: r.id, employeeId: r.employeeId, date: r.date, shiftTime: r.shiftTime,
        timeInYard: iso(r.timeInYard), timeOutYard: iso(r.timeOutYard),
        attendanceStatus: r.attendanceStatus, reason: r.reason, notes: r.notes, remarks: r.remarks,
      })),
      taskTimeEntries: taskEntries.map((e) => ({
        key: `${e.employeeId}:${e.taskId}`, id: e.id, employeeId: e.employeeId, taskId: e.taskId,
        date: e.date,
        timeStarted: iso(e.timeStarted),
        runningSince: null, accumulatedActiveMs: Number(e.totalDurationMs) || 0,
        pausedAt: null, pauseEvents: byEntry[e.id] || [],
        timeFinished: iso(e.timeFinished),
        totalDurationMs: Number(e.totalDurationMs) || 0,
        totalPausedMs: Number(e.totalPausedMs) || 0,
        status: e.status || 'stopped', triggeringLevel: e.triggeringLevel,
      })),
      breakRecords: breakRecords.map((b) => ({
        id: b.id, employeeId: b.employeeId, date: b.date,
        timeStarted: iso(b.timeStarted), timeFinished: iso(b.timeFinished),
        durationMs: num(b.durationMs), status: b.status,
      })),
    });
  } catch (e) { sendError(res, e); }
};
