import { useState } from "react";
import { useTmsState } from "@/lib/tmsStore";
import { todayLocalDate } from "@/lib/tmsUtils";
import StartAllBar from "@/components/tms/StartAllBar";
import EmployeePanel from "@/components/tms/EmployeePanel";

export default function TimeCapture() {
  const s = useTmsState();
  const [date, setDate] = useState(todayLocalDate());
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Time Capture</h1>
        <p className="text-sm text-muted-foreground">
          Live observation. One active task timer per employee — starting another task auto-stops the current one and logs its time.
        </p>
      </div>

      <StartAllBar
        date={date}
        setDate={setDate}
        selectedEmployees={selectedEmployees}
        setSelectedEmployees={setSelectedEmployees}
      />

      {s.employees.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No employees configured yet. Go to Settings to add employees and assign tasks.
        </div>
      ) : (
        <div className="space-y-4">
          {s.employees.map((emp) => (
            <EmployeePanel key={emp.id} employee={emp} date={date} />
          ))}
        </div>
      )}
    </div>
  );
}