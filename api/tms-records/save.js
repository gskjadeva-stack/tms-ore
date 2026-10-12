// POST /api/tms-records/save — full snapshot replace in one transaction.
// Only finalized/stopped data is stored; live timers stay browser-only.
const { getPrisma } = require('../_db');
const { requireUser, sendError } = require('../_auth');

const T = (v) => (v ? new Date(v) : null);
const I = (v) => (v === null || v === undefined ? null : BigInt(Number(v) || 0));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await requireUser(req);
    const b = req.body || {};
    const prisma = getPrisma();

    const employees = (b.employees || []).map((e) => ({
      id: e.id, name: e.name, notes: e.notes || null, remarks: e.remarks || null,
    }));
    const tasks = (b.tasks || []).map((t) => ({ id: t.id, name: t.name }));
    const assignments = (b.assignments || []).map((a) => ({ id: a.id, employeeId: a.employeeId, taskId: a.taskId }));
    const shiftDefinitions = (b.shiftDefinitions || []).map((d) => ({
      id: d.id, name: d.name, startHhmm: d.start, endHhmm: d.end,
    }));
    const shiftRecords = (b.shiftRecords || []).map((r) => ({
      id: r.id, employeeId: r.employeeId, date: r.date, shiftTime: r.shiftTime || null,
      timeInYard: T(r.timeInYard), timeOutYard: T(r.timeOutYard),
      attendanceStatus: r.attendanceStatus || null, reason: r.reason || null,
      notes: r.notes || null, remarks: r.remarks || null,
    }));
    const entries = b.taskTimeEntries || [];
    const taskEntries = entries.map((e) => ({
      id: e.id, employeeId: e.employeeId, taskId: e.taskId, date: e.date,
      timeStarted: T(e.timeStarted), timeFinished: T(e.timeFinished),
      totalDurationMs: I(e.totalDurationMs) ?? BigInt(0),
      totalPausedMs: I(e.totalPausedMs) ?? BigInt(0),
      status: e.status || 'stopped', triggeringLevel: e.triggeringLevel || null,
    }));
    const pauses = [];
    entries.forEach((e) => (e.pauseEvents || []).forEach((pe, i) => pauses.push({
      id: pe.id || `${e.id}:pe${i}`, taskEntryId: e.id,
      timePaused: T(pe.timePaused), timeResumed: T(pe.timeResumed),
      intervalMs: pe.intervalMs === null || pe.intervalMs === undefined ? null : I(pe.intervalMs),
    })));
    const breakRecords = (b.breakRecords || []).map((x) => ({
      id: x.id, employeeId: x.employeeId, date: x.date,
      timeStarted: T(x.timeStarted), timeFinished: T(x.timeFinished),
      durationMs: x.durationMs === null || x.durationMs === undefined ? null : I(x.durationMs),
      status: x.status || null,
    }));

    await prisma.$transaction([
      prisma.tmsPauseEvent.deleteMany(),
      prisma.tmsTaskEntry.deleteMany(),
      prisma.tmsShiftRecord.deleteMany(),
      prisma.tmsBreakRecord.deleteMany(),
      prisma.tmsAssignment.deleteMany(),
      prisma.tmsShiftDefinition.deleteMany(),
      prisma.tmsTask.deleteMany(),
      prisma.tmsEmployee.deleteMany(),
      ...(employees.length ? [prisma.tmsEmployee.createMany({ data: employees })] : []),
      ...(tasks.length ? [prisma.tmsTask.createMany({ data: tasks })] : []),
      ...(assignments.length ? [prisma.tmsAssignment.createMany({ data: assignments })] : []),
      ...(shiftDefinitions.length ? [prisma.tmsShiftDefinition.createMany({ data: shiftDefinitions })] : []),
      ...(shiftRecords.length ? [prisma.tmsShiftRecord.createMany({ data: shiftRecords })] : []),
      ...(taskEntries.length ? [prisma.tmsTaskEntry.createMany({ data: taskEntries })] : []),
      ...(pauses.length ? [prisma.tmsPauseEvent.createMany({ data: pauses })] : []),
      ...(breakRecords.length ? [prisma.tmsBreakRecord.createMany({ data: breakRecords })] : []),
      prisma.tmsSnapshot.create({ data: { savedBy: user.email, entryCount: entries.length } }),
    ]);

    res.json({
      ok: true,
      saved: { employees: employees.length, tasks: tasks.length, entries: entries.length, pauses: pauses.length },
    });
  } catch (e) { sendError(res, e); }
};
