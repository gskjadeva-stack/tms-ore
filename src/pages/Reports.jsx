const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { useState } from "react";
import { Download, FileText, FileSpreadsheet, Sparkles, Loader2 } from "lucide-react";
import { useTmsState } from "@/lib/tmsStore";
import {
  downloadCsv,
  exportPdfTable,
  exportPdfText,
  formatDuration,
  formatLocal,
} from "@/lib/tmsUtils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Reports() {
  const s = useTmsState();
  const [llmEmployeeId, setLlmEmployeeId] = useState("");
  const [exportEmployeeId, setExportEmployeeId] = useState("");
  const [reportEmployeeId, setReportEmployeeId] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [running, setRunning] = useState(false);
  const [llmError, setLlmError] = useState("");

  const empName = (id) => s.employees.find((e) => e.id === id)?.name || "Unknown";
  const taskName = (id) => s.tasks.find((t) => t.id === id)?.name || "Unknown";

  const safeFile = (name) =>
    (name || "unknown").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "unknown";

  // ---- Raw data CSV exports ----
  const exportRawShift = () =>
    downloadCsv(
      "tms_shift_records.csv",
      s.shiftRecords.map((r) => ({
        employee: empName(r.employeeId),
        date: r.date,
        shiftTime: r.shiftTime || "",
        timeInYard: r.timeInYard ? formatLocal(r.timeInYard) : "",
        timeOutYard: r.timeOutYard ? formatLocal(r.timeOutYard) : "",
        attendanceStatus: r.attendanceStatus || "",
        reason: r.reason || "",
        notes: r.notes || "",
        remarks: r.remarks || "",
      })),
      [
        { key: "employee", label: "Employee" },
        { key: "date", label: "Date" },
        { key: "shiftTime", label: "Shift Time" },
        { key: "timeInYard", label: "Time In at Yard" },
        { key: "timeOutYard", label: "Time Out at Yard" },
        { key: "attendanceStatus", label: "Attendance" },
        { key: "reason", label: "Reason" },
        { key: "notes", label: "Notes" },
        { key: "remarks", label: "Remarks" },
      ]
    );

  const exportRawTasks = () =>
    downloadCsv(
      "tms_task_time_entries.csv",
      s.taskTimeEntries.map((e) => ({
        employee: empName(e.employeeId),
        task: taskName(e.taskId),
        date: e.date || "",
        timeStarted: e.timeStarted ? formatLocal(e.timeStarted) : "",
        timeFinished: e.timeFinished ? formatLocal(e.timeFinished) : "",
        totalDuration: formatDuration(e.totalDurationMs),
        totalPaused: formatDuration(e.totalPausedMs || 0),
        pauseEvents: (e.pauseEvents || []).length,
      })),
      [
        { key: "employee", label: "Employee" },
        { key: "task", label: "Task" },
        { key: "date", label: "Date" },
        { key: "timeStarted", label: "Time Started" },
        { key: "timeFinished", label: "Time Finished" },
        { key: "totalDuration", label: "Total Duration" },
        { key: "totalPaused", label: "Total Paused" },
        { key: "pauseEvents", label: "Pause Events" },
      ]
    );

  const exportRawPauses = () => {
    const rows = [];
    s.taskTimeEntries.forEach((e) =>
      (e.pauseEvents || []).forEach((pe) =>
        rows.push({
          employee: empName(e.employeeId),
          task: taskName(e.taskId),
          timePaused: pe.timePaused ? formatLocal(pe.timePaused) : "",
          timeResumed: pe.timeResumed ? formatLocal(pe.timeResumed) : "",
          interval: formatDuration(pe.intervalMs || 0),
        })
      )
    );
    downloadCsv("tms_pause_events.csv", rows, [
      { key: "employee", label: "Employee" },
      { key: "task", label: "Task" },
      { key: "timePaused", label: "Time Paused" },
      { key: "timeResumed", label: "Time Resumed" },
      { key: "interval", label: "Interval" },
    ]);
  };

  const exportRawBreaks = () =>
    downloadCsv(
      "tms_break_records.csv",
      s.breakRecords.map((b) => ({
        employee: empName(b.employeeId),
        date: b.date || "",
        timeStarted: b.timeStarted ? formatLocal(b.timeStarted) : "",
        timeFinished: b.timeFinished ? formatLocal(b.timeFinished) : "",
        duration: formatDuration(b.durationMs),
      })),
      [
        { key: "employee", label: "Employee" },
        { key: "date", label: "Date" },
        { key: "timeStarted", label: "Break Started" },
        { key: "timeFinished", label: "Break Finished" },
        { key: "duration", label: "Duration" },
      ]
    );

  // ---- Per-employee time data records (CSV & PDF) ----
  // One employee's captured rows: task entries, pauses, shifts, breaks.
  const employeeTaskEntries = (empId) =>
    s.taskTimeEntries.filter((e) => e.employeeId === empId);

  const employeePauseRows = (empId) => {
    const rows = [];
    employeeTaskEntries(empId).forEach((e) =>
      (e.pauseEvents || []).forEach((pe) =>
        rows.push({
          task: taskName(e.taskId),
          timePaused: pe.timePaused ? formatLocal(pe.timePaused) : "",
          timeResumed: pe.timeResumed ? formatLocal(pe.timeResumed) : "",
          interval: formatDuration(pe.intervalMs || 0),
        })
      )
    );
    return rows;
  };

  // ---- Aggregated report (with employee + date-range filters) ----
  // Empty employee = all employees; empty from/to = open-ended range.
  // Entry dates are YYYY-MM-DD strings, so plain string comparison works.
  const reportFilteredEntries = () =>
    s.taskTimeEntries.filter((e) => {
      if (reportEmployeeId && e.employeeId !== reportEmployeeId) return false;
      if (reportFrom && (e.date || "") < reportFrom) return false;
      if (reportTo && (e.date || "") > reportTo) return false;
      return true;
    });

  const buildReportRows = (entries) => {
    const byTask = {};
    entries.forEach((e) => {
      const n = taskName(e.taskId);
      if (!byTask[n]) byTask[n] = { totalMs: 0, count: 0, pausedMs: 0 };
      byTask[n].totalMs += e.totalDurationMs || 0;
      byTask[n].pausedMs += e.totalPausedMs || 0;
      byTask[n].count += 1;
    });
    return Object.entries(byTask).map(([name, v]) => ({
      task: name,
      entries: v.count,
      totalDuration: formatDuration(v.totalMs),
      avgDuration: formatDuration(v.count ? Math.round(v.totalMs / v.count) : 0),
      totalPaused: formatDuration(v.pausedMs),
    }));
  };

  const exportReportCsv = () => {
    const entries = reportFilteredEntries();
    const rows = buildReportRows(entries);
    const scope = reportEmployeeId ? safeFile(empName(reportEmployeeId)) : "all";
    downloadCsv(`tms_report_${scope}.csv`, rows, [
      { key: "task", label: "Task" },
      { key: "entries", label: "Entries" },
      { key: "totalDuration", label: "Total Duration" },
      { key: "avgDuration", label: "Average Consumed Time" },
      { key: "totalPaused", label: "Total Paused" },
    ]);
  };

  const exportReportPdf = () => {
    const entries = reportFilteredEntries();
    const rows = buildReportRows(entries);
    const scope = reportEmployeeId ? safeFile(empName(reportEmployeeId)) : "all";
    const empScope = reportEmployeeId
      ? empName(reportEmployeeId)
      : entries.length > 0
        ? [...new Set(entries.map((e) => empName(e.employeeId)))].join(", ")
        : "None";
    const dates =
      entries.length > 0
        ? `${Math.min(...entries.map((e) => e.date || "9999"))} to ${Math.max(
            ...entries.map((e) => e.date || "0000")
          )}`
        : "No records";
    exportPdfTable({
      title: "Time & Motion Study — Report",
      subtitle: `Date range: ${dates} | Employees: ${empScope} | Generated: ${formatLocal(new Date().toISOString())}`,
      columns: [
        { key: "task", label: "Task" },
        { key: "entries", label: "Entries" },
        { key: "totalDuration", label: "Total Duration" },
        { key: "avgDuration", label: "Avg Consumed Time" },
        { key: "totalPaused", label: "Total Paused" },
      ],
      rows,
      filename: `tms_report_${scope}.pdf`,
    });
  };

  const exportEmployeeCsv = () => {
    if (!exportEmployeeId) return;
    const file = safeFile(empName(exportEmployeeId));
    const taskEntries = employeeTaskEntries(exportEmployeeId);
    downloadCsv(
      `tms_${file}_task_time_entries.csv`,
      taskEntries.map((e) => ({
        task: taskName(e.taskId),
        date: e.date || "",
        timeStarted: e.timeStarted ? formatLocal(e.timeStarted) : "",
        timeFinished: e.timeFinished ? formatLocal(e.timeFinished) : "",
        totalDuration: formatDuration(e.totalDurationMs),
        totalPaused: formatDuration(e.totalPausedMs || 0),
        pauseEvents: (e.pauseEvents || []).length,
      })),
      [
        { key: "task", label: "Task" },
        { key: "date", label: "Date" },
        { key: "timeStarted", label: "Time Started" },
        { key: "timeFinished", label: "Time Finished" },
        { key: "totalDuration", label: "Total Duration" },
        { key: "totalPaused", label: "Total Paused" },
        { key: "pauseEvents", label: "Pause Events" },
      ]
    );
    downloadCsv(`tms_${file}_pause_events.csv`, employeePauseRows(exportEmployeeId), [
      { key: "task", label: "Task" },
      { key: "timePaused", label: "Time Paused" },
      { key: "timeResumed", label: "Time Resumed" },
      { key: "interval", label: "Interval" },
    ]);
  };

  const exportEmployeePdf = () => {
    if (!exportEmployeeId) return;
    const name = empName(exportEmployeeId);
    const file = safeFile(name);
    const taskEntries = employeeTaskEntries(exportEmployeeId);
    const shifts = s.shiftRecords.filter((r) => r.employeeId === exportEmployeeId);
    const breaks = s.breakRecords.filter((b) => b.employeeId === exportEmployeeId);
    const dates =
      taskEntries.length > 0
        ? `${Math.min(...taskEntries.map((e) => e.date || "9999"))} to ${Math.max(
            ...taskEntries.map((e) => e.date || "0000")
          )}`
        : "No records";
    const subtitle = `Employee: ${name} | Date range: ${dates} | Generated: ${formatLocal(
      new Date().toISOString()
    )}`;
    exportPdfTable({
      title: `Time & Motion Study — ${name} (Tasks)`,
      subtitle,
      columns: [
        { key: "task", label: "Task" },
        { key: "date", label: "Date" },
        { key: "timeStarted", label: "Started" },
        { key: "timeFinished", label: "Finished" },
        { key: "totalDuration", label: "Duration" },
      ],
      rows: taskEntries.map((e) => ({
        task: taskName(e.taskId),
        date: e.date || "",
        timeStarted: e.timeStarted ? formatLocal(e.timeStarted) : "",
        timeFinished: e.timeFinished ? formatLocal(e.timeFinished) : "",
        totalDuration: formatDuration(e.totalDurationMs),
      })),
      filename: `tms_${file}_task_time_entries.pdf`,
    });
    exportPdfTable({
      title: `Time & Motion Study — ${name} (Shifts & Breaks)`,
      subtitle,
      columns: [
        { key: "date", label: "Date" },
        { key: "kind", label: "Kind" },
        { key: "detail", label: "Detail" },
      ],
      rows: [
        ...shifts.map((r) => ({
          date: r.date,
          kind: "Shift",
          detail: `${r.shiftTime || "unassigned"} — in ${r.timeInYard ? formatLocal(r.timeInYard) : "—"}, out ${
            r.timeOutYard ? formatLocal(r.timeOutYard) : "—"
          }, ${r.attendanceStatus || "—"}${r.reason ? ` (${r.reason})` : ""}${
            r.notes ? ` Notes: ${r.notes}` : ""
          }${r.remarks ? ` Remarks: ${r.remarks}` : ""}`,
        })),
        ...breaks.map((b) => ({
          date: b.date || "",
          kind: "Break",
          detail: `${b.timeStarted ? formatLocal(b.timeStarted) : "—"} → ${formatDuration(b.durationMs)}`,
        })),
      ],
      filename: `tms_${file}_shifts_breaks.pdf`,
    });
  };

  const defaultFmt = s.settings.exportPrefs.defaultFormat;
  const doExport = (fmt) => {
    if (fmt === "csv") exportReportCsv();
    if (fmt === "pdf") exportReportPdf();
    if (fmt === "both") {
      exportReportCsv();
      exportReportPdf();
    }
  };

  // ---- LLM analysis ----
  const buildPrompt = () => {
    const emp = s.employees.find((e) => e.id === llmEmployeeId);
    const name = emp?.name || "the selected employee";
    const entries = s.taskTimeEntries.filter((e) => e.employeeId === llmEmployeeId);
    const breaks = s.breakRecords.filter((b) => b.employeeId === llmEmployeeId);
    const recs = s.shiftRecords.filter((r) => r.employeeId === llmEmployeeId);

    const byTask = {};
    entries.forEach((e) => {
      const n = taskName(e.taskId);
      if (!byTask[n]) byTask[n] = { totalMs: 0, count: 0, pausedMs: 0 };
      byTask[n].totalMs += e.totalDurationMs || 0;
      byTask[n].pausedMs += e.totalPausedMs || 0;
      byTask[n].count += 1;
    });

    const taskLines = Object.entries(byTask)
      .map(
        ([n, v]) =>
          `- ${n}: ${v.count} entries, total ${formatDuration(v.totalMs)}, average ${formatDuration(
            v.count ? Math.round(v.totalMs / v.count) : 0
          )}, paused ${formatDuration(v.pausedMs)}`
      )
      .join("\n");

    const shiftLines = recs
      .map(
        (r) =>
          `- ${r.date} shift ${r.shiftTime || "unassigned"}: in ${r.timeInYard ? formatLocal(r.timeInYard) : "—"}, out ${
            r.timeOutYard ? formatLocal(r.timeOutYard) : "—"
          }, attendance ${r.attendanceStatus || "—"}. Notes: ${r.notes || "none"}.`
      )
      .join("\n");

    const breakLines = breaks
      .map((b) => `- ${b.date || "—"}: ${formatDuration(b.durationMs)}`)
      .join("\n");

    return [
      `You are a time and motion study analyst. Analyze the following captured data for employee "${name}" and produce a clear narrative analysis with observations and actionable recommendations.`,
      "",
      `TASK TIMINGS (${entries.length} entries):`,
      taskLines || "- none",
      "",
      `SHIFT RECORDS (${recs.length}):`,
      shiftLines || "- none",
      "",
      `BREAKS (${breaks.length}):`,
      breakLines || "- none",
      "",
      "Provide: 1) Summary of work distribution, 2) Average consumed time per task, 3) Idle/pause patterns, 4) Potential inefficiencies, 5) Recommendations.",
    ].join("\n");
  };

  const runAnalysis = async () => {
    setLlmError("");
    setAnalysis("");
    if (!llmEmployeeId) {
      setLlmError("Select an employee to analyze.");
      return;
    }
    const { llm } = s.settings;
    if (!llm.apiKey || !llm.baseUrl || !llm.model) {
      setLlmError("Configure API Key, Base URL, and Model in Settings → LLM configuration first.");
      return;
    }
    setRunning(true);
    try {
      const resp = await db.functions.invoke("runLlmAnalysis", {
        apiKey: llm.apiKey,
        provider: llm.provider,
        model: llm.model,
        baseUrl: llm.baseUrl,
        prompt: buildPrompt(),
      });
      const data = resp?.data || resp;
      if (data?.error) setLlmError(data.error);
      else if (data?.analysis) setAnalysis(data.analysis);
      else setLlmError("Unexpected response from analysis service.");
    } catch (err) {
      setLlmError(err?.message || "Analysis request failed.");
    } finally {
      setRunning(false);
    }
  };

  const exportAnalysisPdf = () => {
    if (!analysis) return;
    exportPdfText({
      title: "Time & Motion Study — LLM Analysis",
      subtitle: `Employee: ${empName(llmEmployeeId)} | Generated: ${formatLocal(new Date().toISOString())}`,
      body: analysis,
      filename: "tms_llm_analysis.pdf",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Reports &amp; Export</h1>
        <p className="text-sm text-muted-foreground">
          Export raw data (CSV), reports (CSV &amp; PDF), and run an LLM analysis (PDF).
        </p>
      </div>

      {/* Raw data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" /> Raw Data Export (CSV)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportRawShift}>Shift records</Button>
            <Button variant="outline" size="sm" onClick={exportRawTasks}>Task time entries</Button>
            <Button variant="outline" size="sm" onClick={exportRawPauses}>Pause events</Button>
            <Button variant="outline" size="sm" onClick={exportRawBreaks}>Break records</Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-employee time data records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" /> Per-Employee Time Records (CSV &amp; PDF)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            One employee&apos;s captured time data: task entries, pauses, shifts, and breaks.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Select employee</Label>
            <select
              value={exportEmployeeId}
              onChange={(e) => setExportEmployeeId(e.target.value)}
              className="mt-1 w-full md:w-72 h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— choose employee —</option>
              {s.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportEmployeeCsv} disabled={!exportEmployeeId}>
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportEmployeePdf} disabled={!exportEmployeeId}>
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Report Export (CSV &amp; PDF)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Aggregated report: average consumed time per itemized task, totals, and paused time.
            Default format from Settings: <span className="font-medium">{defaultFmt}</span>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <Label className="text-xs text-muted-foreground">Employee (all if blank)</Label>
              <select
                value={reportEmployeeId}
                onChange={(e) => setReportEmployeeId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">All employees</option>
                {s.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">From date</Label>
              <input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To date</Label>
              <input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => doExport(defaultFmt)}>
              <Download className="w-4 h-4" /> Export ({defaultFmt})
            </Button>
            <Button variant="outline" size="sm" onClick={exportReportCsv}>Export CSV</Button>
            <Button variant="outline" size="sm" onClick={exportReportPdf}>Export PDF</Button>
          </div>
        </CardContent>
      </Card>

      {/* LLM analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> LLM Analysis (PDF)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sends the selected employee's captured data to your configured OpenAI-compatible
            provider. Configure it in Settings → LLM configuration.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Select employee</Label>
            <select
              value={llmEmployeeId}
              onChange={(e) => setLlmEmployeeId(e.target.value)}
              className="mt-1 w-full md:w-72 h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">— choose employee —</option>
              {s.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAnalysis} disabled={running || !llmEmployeeId}>
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running ? "Analyzing…" : "Run analysis"}
            </Button>
            <Button variant="outline" onClick={exportAnalysisPdf} disabled={!analysis}>
              <Download className="w-4 h-4" /> Export analysis to PDF
            </Button>
          </div>
          {llmError && (
            <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-700 text-sm px-3 py-2">
              {llmError}
            </div>
          )}
          {analysis && (
            <div>
              <Label className="text-xs text-muted-foreground">Analysis result</Label>
              <Textarea readOnly value={analysis} className="mt-1 min-h-[220px] font-mono text-xs" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}