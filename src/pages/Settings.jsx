import { useEffect, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { useTmsState, actions } from "@/lib/tmsStore";
import { formatShiftTime, parseShiftTime } from "@/lib/tmsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogDeleteToggle } from "@/components/tms/LogDeleteToggle";

function Row({ children, onDelete }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
        <Trash2 className="w-4 h-4 text-rose-600" />
      </Button>
    </div>
  );
}

function ShiftTimeInput({ value, onChange, className = "" }) {
  const [text, setText] = useState(() => formatShiftTime(value));

  useEffect(() => {
    setText(formatShiftTime(value));
  }, [value]);

  const commit = () => {
    const normalized = parseShiftTime(text);
    if (normalized) {
      onChange(normalized);
      setText(formatShiftTime(normalized));
    } else {
      setText(formatShiftTime(value));
    }
  };

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      placeholder="e.g. 6:00 AM"
      className={className}
    />
  );
}

export default function Settings() {
  const s = useTmsState();

  // employee form
  const [empName, setEmpName] = useState("");
  // task form
  const [taskName, setTaskName] = useState("");
  // shift def form
  const [shfName, setShfName] = useState("");
  const [shfStart, setShfStart] = useState("");
  const [shfEnd, setShfEnd] = useState("");

  const [breakLabel, setBreakLabel] = useState(s.breakConfig.label);
  const [breakMin, setBreakMin] = useState(s.breakConfig.defaultDurationMin);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The six configurable categories for this study.
        </p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="employees">Employee Roster</TabsTrigger>
          <TabsTrigger value="tasks">Task List &amp; Assignments</TabsTrigger>
          <TabsTrigger value="shifts">Shift Time</TabsTrigger>
          <TabsTrigger value="break">Break Time</TabsTrigger>
          <TabsTrigger value="llm">LLM Configuration</TabsTrigger>
          <TabsTrigger value="export">Export Preferences</TabsTrigger>
        </TabsList>

        {/* Employees */}
        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <CardTitle>Employee Roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Employee name"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && empName.trim()) {
                      actions.addEmployee(empName.trim());
                      setEmpName("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (empName.trim()) {
                      actions.addEmployee(empName.trim());
                      setEmpName("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {s.employees.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No employees yet.</p>
                )}
                {s.employees.map((e) => (
                  <Row key={e.id} onDelete={() => actions.deleteEmployee(e.id)}>
                    <Input
                      value={e.name}
                      onChange={(ev) => actions.updateEmployee(e.id, ev.target.value)}
                      className="flex-1"
                    />
                  </Row>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks & assignments */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Task List &amp; Assignments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Task name"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && taskName.trim()) {
                      actions.addTask(taskName.trim());
                      setTaskName("");
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (taskName.trim()) {
                      actions.addTask(taskName.trim());
                      setTaskName("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" /> Add task
                </Button>
              </div>
              <div className="space-y-2">
                {s.tasks.map((t) => (
                  <Row key={t.id} onDelete={() => actions.deleteTask(t.id)}>
                    <Input
                      value={t.name}
                      onChange={(ev) => actions.updateTask(t.id, ev.target.value)}
                      className="flex-1"
                    />
                  </Row>
                ))}
                {s.tasks.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No tasks yet.</p>
                )}
              </div>

              <div className="pt-2 border-t">
                <Label className="text-sm font-medium">Assign tasks per employee</Label>
                {s.employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic mt-2">
                    Add employees first.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {s.employees.map((e) => (
                      <div key={e.id} className="rounded-md border p-3">
                        <div className="font-medium text-sm mb-2">{e.name}</div>
                        <div className="flex flex-wrap gap-3">
                          {s.tasks.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">No tasks defined.</span>
                          )}
                          {s.tasks.map((t) => {
                            const assigned = s.assignments.some(
                              (a) => a.employeeId === e.id && a.taskId === t.id
                            );
                            return (
                              <label
                                key={t.id}
                                className="flex items-center gap-1.5 text-sm cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={assigned}
                                  onChange={() =>
                                    assigned
                                      ? actions.unassignTask(e.id, t.id)
                                      : actions.assignTask(e.id, t.id)
                                  }
                                  className="h-4 w-4"
                                  disabled={false}
                                />
                                {assigned && <Check className="w-3 h-3 text-emerald-600" />}
                                {t.name}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shift time definitions */}
        <TabsContent value="shifts">
          <Card>
            <CardHeader>
              <CardTitle>Shift Time Definitions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={shfName}
                    onChange={(e) => setShfName(e.target.value)}
                    placeholder="e.g. Morning"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  <ShiftTimeInput
                    value={shfStart}
                    onChange={setShfStart}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End</Label>
                  <ShiftTimeInput
                    value={shfEnd}
                    onChange={setShfEnd}
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (shfName.trim() && shfStart && shfEnd) {
                      actions.addShiftDefinition(shfName.trim(), shfStart, shfEnd);
                      setShfName("");
                      setShfStart("");
                      setShfEnd("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {s.shiftDefinitions.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No shift definitions yet.</p>
                )}
                {s.shiftDefinitions.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <Input
                      value={d.name}
                      onChange={(e) => actions.updateShiftDefinition(d.id, { name: e.target.value })}
                      className="w-40"
                    />
                    <ShiftTimeInput
                      value={d.start}
                      onChange={(value) => actions.updateShiftDefinition(d.id, { start: value })}
                      className="w-32"
                    />
                    <span className="text-muted-foreground">–</span>
                    <ShiftTimeInput
                      value={d.end}
                      onChange={(value) => actions.updateShiftDefinition(d.id, { end: value })}
                      className="w-32"
                    />
                    <Button size="icon" variant="ghost" onClick={() => actions.deleteShiftDefinition(d.id)}>
                      <Trash2 className="w-4 h-4 text-rose-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Break time config */}
        <TabsContent value="break">
          <Card>
            <CardHeader>
              <CardTitle>Break Time Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <p className="text-sm text-muted-foreground">
                Breaks are captured with their own Start/Stop timer on the Time Capture screen.
                These values label and document the break configuration.
              </p>
              <div>
                <Label className="text-xs text-muted-foreground">Break label</Label>
                <Input
                  value={breakLabel}
                  onChange={(e) => setBreakLabel(e.target.value)}
                  onBlur={() => actions.setBreakConfig({ label: breakLabel })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Default expected duration (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Number(e.target.value))}
                  onBlur={() => actions.setBreakConfig({ defaultDurationMin: Number(breakMin) || 0 })}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LLM config */}
        <TabsContent value="llm">
          <Card>
            <CardHeader>
              <CardTitle>LLM Configuration</CardTitle>
              <p className="text-xs text-muted-foreground">
                OpenAI-compatible custom provider. The API key is stored only in this browser's
                localStorage and sent to the analysis function at call time.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 max-w-xl">
              <div>
                <Label className="text-xs text-muted-foreground">API Key</Label>
                <Input
                  type="password"
                  value={s.settings.llm.apiKey}
                  onChange={(e) => actions.setLlmConfig({ apiKey: e.target.value })}
                  className="mt-1 font-mono"
                  placeholder="sk-..."
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Provider (label)</Label>
                <Input
                  value={s.settings.llm.provider}
                  onChange={(e) => actions.setLlmConfig({ provider: e.target.value })}
                  className="mt-1"
                  placeholder="e.g. OpenAI / Local / Groq"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Input
                  value={s.settings.llm.model}
                  onChange={(e) => actions.setLlmConfig({ model: e.target.value })}
                  className="mt-1 font-mono"
                  placeholder="e.g. gpt-4o-mini"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Base URL</Label>
                <Input
                  value={s.settings.llm.baseUrl}
                  onChange={(e) => actions.setLlmConfig({ baseUrl: e.target.value })}
                  className="mt-1 font-mono"
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export prefs */}
        <TabsContent value="export">
          <Card>
            <CardHeader>
              <CardTitle>Export Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <Label className="text-xs text-muted-foreground">Default report format</Label>
              <select
                value={s.settings.exportPrefs.defaultFormat}
                onChange={(e) => actions.setExportPrefs({ defaultFormat: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="csv">CSV only</option>
                <option value="pdf">PDF only</option>
                <option value="both">CSV + PDF</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Used as the default for the one-click report export on the Reports screen. CSV and
                PDF are always available individually too.
              </p>
              <div className="pt-2 border-t">
                <LogDeleteToggle
                  checked={!!s.settings.uiPrefs?.showLogDeleteButtons}
                  onEnable={(v) => actions.setUiPrefs({ showLogDeleteButtons: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}