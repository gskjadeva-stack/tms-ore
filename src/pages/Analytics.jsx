import { useMemo } from "react";
import { useTmsState, shiftRecordFor } from "@/lib/tmsStore";
import { formatDuration } from "@/lib/tmsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const msToHours = (ms) => +(ms / 3600000).toFixed(2);
const tickFmt = (v) => `${v}h`;

// Truncate long task names for legend labels (full name stays in tooltip)
const shortName = (name, max = 28) =>
  name && name.length > max ? `${name.slice(0, max - 1)}…` : name || "";

// Pie slice palette (recharts has no default categorical colors)
const PIE_COLORS = [
  "#16a34a",
  "#0ea5e9",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
];

export default function Analytics() {
  const s = useTmsState();

  const empName = (id) => s.employees.find((e) => e.id === id)?.name || "Unknown";
  const taskName = (id) => s.tasks.find((t) => t.id === id)?.name || "Unknown";

  const entries = s.taskTimeEntries;

  // Per time — by shift (join to shift record by employee+date)
  const perShift = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const shift = shiftRecordFor(e.employeeId, e.date)?.shiftTime || "Unassigned shift";
      map[shift] = (map[shift] || 0) + (e.totalDurationMs || 0);
    });
    return Object.entries(map).map(([name, ms]) => ({ name, hours: msToHours(ms), ms }));
  }, [entries, s.shiftRecords]);

  // Per employee
  const perEmployee = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const n = empName(e.employeeId);
      map[n] = (map[n] || 0) + (e.totalDurationMs || 0);
    });
    return Object.entries(map).map(([name, ms]) => ({ name, hours: msToHours(ms), ms }));
  }, [entries, s.employees]);

  // Per task (ALL employees pooled) — average consumed time per itemized
  // task across captured records.
  const perTask = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const n = taskName(e.taskId);
      if (!map[n]) map[n] = { name: n, totalMs: 0, count: 0 };
      map[n].totalMs += e.totalDurationMs || 0;
      map[n].count += 1;
    });
    return Object.values(map).map((r) => ({
      name: r.name,
      totalHours: msToHours(r.totalMs),
      avgHours: msToHours(r.count ? r.totalMs / r.count : 0),
      avgMs: r.count ? Math.round(r.totalMs / r.count) : 0,
      avgFormatted: formatDuration(r.count ? Math.round(r.totalMs / r.count) : 0),
      totalMs: r.totalMs,
      count: r.count,
    }));
  }, [entries, s.tasks]);

  // Per task PER employee — average consumed time per itemized task across
  // captured records of each employee. One table row per (employee, task)
  // pair that has at least one captured entry.
  const perTaskPerEmployee = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      const key = `${e.employeeId}::${e.taskId}`;
      if (!map[key]) {
        map[key] = {
          employeeId: e.employeeId,
          employee: empName(e.employeeId),
          taskId: e.taskId,
          task: taskName(e.taskId),
          totalMs: 0,
          count: 0,
        };
      }
      map[key].totalMs += e.totalDurationMs || 0;
      map[key].count += 1;
    });
    return Object.values(map)
      .map((r) => ({
        ...r,
        avgMs: r.count ? Math.round(r.totalMs / r.count) : 0,
        avgFormatted: formatDuration(r.count ? Math.round(r.totalMs / r.count) : 0),
        avgHours: msToHours(r.count ? r.totalMs / r.count : 0),
        totalHours: msToHours(r.totalMs),
      }))
      .sort((a, b) =>
        a.employee.localeCompare(b.employee) || a.task.localeCompare(b.task)
      );
  }, [entries, s.employees, s.tasks]);

  // Charts grouped by employee: one PIE per employee, each showing only
  // that employee's tasks. Slices are sized by EXACT TOTAL duration
  // milliseconds (not average) so the pie reflects actual consumed time.
  // Each group also carries its total so the tooltip can show the slice %.
  const perEmployeeCharts = useMemo(() => {
    const groups = {};
    perTaskPerEmployee.forEach((r) => {
      if (!groups[r.employeeId]) {
        groups[r.employeeId] = { employeeId: r.employeeId, employee: r.employee, rows: [], groupTotalMs: 0 };
      }
      groups[r.employeeId].groupTotalMs += r.totalMs;
      groups[r.employeeId].rows.push({
        name: r.task,
        value: r.totalMs,
        avgHours: r.avgHours,
        avgMs: r.avgMs,
        avgFormatted: r.avgFormatted,
        totalMs: r.totalMs,
        totalFormatted: formatDuration(r.totalMs),
      });
    });
    // Attach each slice's share of its employee's total (percent, 1 decimal)
    Object.values(groups).forEach((g) => {
      g.rows.forEach((row) => {
        row.pct = g.groupTotalMs > 0 ? (100 * row.totalMs) / g.groupTotalMs : 0;
        row.pctFormatted = `${row.pct.toFixed(1)}%`;
      });
    });
    return Object.values(groups).sort((a, b) => a.employee.localeCompare(b.employee));
  }, [perTaskPerEmployee]);

  const hasData = entries.length > 0;

  const ChartCard = ({ title, subtitle, data, dataKey }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No data captured for this grouping.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={tickFmt} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v} hours`, "Duration"]} />
                <Legend />
                <Bar dataKey={dataKey} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated metrics from captured task timings — per shift, per task, and per employee.
        </p>
      </div>

      {!hasData ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No completed task timings yet. Capture timings on the Time Capture screen to populate
          analytics. Charts only render from captured data.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Per Time — by Shift"
              subtitle="Total task duration grouped by shift"
              data={perShift}
              dataKey="hours"
            />
            <ChartCard
              title="Per Employee"
              subtitle="Total task duration per employee"
              data={perEmployee}
              dataKey="hours"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Per Task — Average Consumed Time</CardTitle>
              <p className="text-xs text-muted-foreground">
                Average consumed time per itemized task across captured records.
              </p>
            </CardHeader>
            <CardContent>
              {perTask.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No task data captured.</p>
              ) : (
                <>
                  <div className="h-72 w-full mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perTask} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-15} dy={10} height={60} />
                        <YAxis tickFormatter={tickFmt} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v, name, props) => [props?.payload?.avgFormatted || `${v} hours`, "Average"]} />
                        <Legend />
                        <Bar dataKey="avgHours" name="Average hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Task</th>
                          <th className="px-3 py-2 text-left">Entries</th>
                          <th className="px-3 py-2 text-left">Total Duration</th>
                          <th className="px-3 py-2 text-left">Average Consumed Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {perTask.map((r) => (
                          <tr key={r.name}>
                            <td className="px-3 py-2 font-medium">{r.name}</td>
                            <td className="px-3 py-2">{r.count}</td>
                            <td className="px-3 py-2 font-mono">{formatDuration(r.totalMs)}</td>
                            <td className="px-3 py-2 font-mono font-semibold">{r.avgFormatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per Task Per Employee — Total Consumed Time</CardTitle>
              <p className="text-xs text-muted-foreground">
                Total consumed time per itemized task across captured records of each employee. The table below also shows the average per entry.
              </p>
            </CardHeader>
            <CardContent>
              {perTaskPerEmployee.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No task data captured.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                    {perEmployeeCharts.map((g) => (
                      <div key={g.employeeId} className="rounded-md border p-3">
                        <h3 className="text-sm font-semibold mb-2">{g.employee}</h3>
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <div className="h-56 w-full sm:w-1/2 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Tooltip
                                  formatter={(v, name, props) => {
                                    const p = props?.payload;
                                    const pct = p?.pctFormatted || (v != null && g.groupTotalMs > 0 ? `${((100 * v) / g.groupTotalMs).toFixed(1)}%` : "");
                                    const total = p?.totalFormatted || formatDuration(v);
                                    return [`${pct} (${total})`, p?.name || name];
                                  }}
                                />
                                <Pie
                                  data={g.rows}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={80}
                                  labelLine={false}
                                >
                                  {g.rows.map((row, i) => (
                                    <Cell key={`${g.employeeId}-${row.name}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <ul className="w-full sm:w-1/2 space-y-1.5 text-xs">
                            {g.rows.map((row, i) => (
                              <li key={`${g.employeeId}-legend-${row.name}`} className="flex items-start gap-2" title={`${row.name} — total ${row.totalFormatted} (avg ${row.avgFormatted})`}>
                                <span
                                  className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
                                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{shortName(row.name)}</span>
                                  <span className="block font-mono text-muted-foreground">{row.totalFormatted}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Employee</th>
                          <th className="px-3 py-2 text-left">Task</th>
                          <th className="px-3 py-2 text-left">Entries</th>
                          <th className="px-3 py-2 text-left">Total Duration</th>
                          <th className="px-3 py-2 text-left">Average Consumed Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {perTaskPerEmployee.map((r) => (
                          <tr key={`${r.employeeId}::${r.taskId}`}>
                            <td className="px-3 py-2 font-medium">{r.employee}</td>
                            <td className="px-3 py-2">{r.task}</td>
                            <td className="px-3 py-2">{r.count}</td>
                            <td className="px-3 py-2 font-mono">{formatDuration(r.totalMs)}</td>
                            <td className="px-3 py-2 font-mono font-semibold">{r.avgFormatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}