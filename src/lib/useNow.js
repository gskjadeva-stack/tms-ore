import { useEffect, useState } from "react";

// Returns a Date that updates every `intervalMs` (default 1000ms).
// Used to re-render live timer displays for running timers.
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}