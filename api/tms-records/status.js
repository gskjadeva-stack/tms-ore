// GET /api/tms-records/status — row counts + last snapshot time.
const { getPrisma } = require('../_db');
const { requireUser, sendError } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireUser(req);
    const prisma = getPrisma();
    const [employees, tasks, assignments, shiftDefinitions, shiftRecords, taskEntries, pauseEvents, breakRecords] =
      await Promise.all([
        prisma.tmsEmployee.count(),
        prisma.tmsTask.count(),
        prisma.tmsAssignment.count(),
        prisma.tmsShiftDefinition.count(),
        prisma.tmsShiftRecord.count(),
        prisma.tmsTaskEntry.count(),
        prisma.tmsPauseEvent.count(),
        prisma.tmsBreakRecord.count(),
      ]);
    const snap = await prisma.tmsSnapshot.findFirst({ orderBy: { id: 'desc' } });
    res.json({
      ok: true,
      counts: {
        TmsEmployee: employees,
        TmsTask: tasks,
        TmsAssignment: assignments,
        TmsShiftDefinition: shiftDefinitions,
        TmsShiftRecord: shiftRecords,
        TmsTaskEntry: taskEntries,
        TmsPauseEvent: pauseEvents,
        TmsBreakRecord: breakRecords,
      },
      lastSavedAt: (snap && snap.savedAt) || null,
    });
  } catch (e) { sendError(res, e); }
};
