import { NavLink, Outlet } from "react-router-dom";
import { Timer, ClipboardList, BarChart3, FileText, Settings as SettingsIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Time Capture", icon: Timer, end: true },
  { to: "/records", label: "Records", icon: ClipboardList },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports & Export", icon: FileText },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <Clock className="w-6 h-6 text-sidebar-primary" />
          <div>
            <div className="font-heading font-semibold leading-tight">Time &amp; Motion</div>
            <div className="text-xs text-muted-foreground">Study System</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 text-xs text-muted-foreground border-t border-sidebar-border">
          Data stored locally in this browser.
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}