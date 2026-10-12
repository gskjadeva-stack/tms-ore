import { Play, Calendar } from "lucide-react";
import { useTmsState, actions, tasksForEmployee } from "@/lib/tmsStore";
import { Button } from "@/components/ui/button";

export default function StartAllBar({ date, setDate, selectedEmployees, setSelectedEmployees }) {
  const s = useTmsState();

  // employees that have at least one assigned task
  const eligible = s.employees.filter((e) => tasksForEmployee(e.id).length > 0);

  const toggle = (id) =>
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const selectAll = () => setSelectedEmployees(eligible.map((e) => e.id));
  const clearAll = () => setSelectedEmployees([]);

  const handleStartAll = () => {
    const emps = s.employees.filter((e) => selectedEmployees.includes(e.id));
    if (emps.length === 0) return;
    actions.startAll(emps, date);
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-heading font-semibold text-lg">
            <Play className="w-5 h-5 text-emerald-600" /> Master Start All
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select a group of employees, then Start All starts one idle/stopped task
            timer per employee in one click. Running/paused timers are skipped; per-employee and per-row
            controls stay active.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <label className="text-xs text-muted-foreground">Study date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {selectedEmployees.length} of {eligible.length} eligible employee(s) selected
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={selectAll} disabled={eligible.length === 0}>
            Select all
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll} disabled={!selectedEmployees.length}>
            Clear
          </Button>
          <Button
            size="sm"
            onClick={handleStartAll}
            disabled={selectedEmployees.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Play className="w-4 h-4" /> Start All
          </Button>
        </div>
      </div>

      {eligible.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">
          No employees have tasks assigned yet. Configure them in Settings.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {eligible.map((e) => {
            const active = selectedEmployees.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                className={
                  "px-3 py-1.5 rounded-full border text-sm transition-colors " +
                  (active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background border-border hover:bg-muted")
                }
              >
                {e.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}