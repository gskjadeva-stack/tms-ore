// Time & Motion Study — shared utilities (local clock time)
// Timestamps are stored as UTC ISO strings (nowIso); display is in the
// browser's local timezone.

export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const nowIso = () => new Date().toISOString();

const pad = (n) => String(n).padStart(2, "0");

function format12Hour(d) {
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${pad(d.getMinutes())} ${hours24 < 12 ? "AM" : "PM"}`;
}

export function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Full local timestamp: 2026-09-22 2:37 PM
// (a bare YYYY-MM-DD date string passes through unchanged)
export function formatLocal(iso) {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${format12Hour(d)}`;
}

// Time only: 2:37 PM
export function formatLocalTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return format12Hour(d);
}

export function formatShiftTime(time) {
  if (!time) return "";
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hours24 = Number(match[1]);
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${match[2]} ${hours24 < 12 ? "AM" : "PM"}`;
}

export function parseShiftTime(time) {
  if (!time) return "";
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if (!match) return "";
  const hours12 = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours12 < 1 || hours12 > 12 || minutes < 0 || minutes > 59) return "";
  const hours24 = (hours12 % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return `${pad(hours24)}:${pad(minutes)}`;
}

export function manualTimeRangeIso(date, startTime, finishTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
  const start = parseShiftTime(startTime);
  const finish = parseShiftTime(finishTime);
  if (!start || !finish) return null;
  const startDate = new Date(`${date}T${start}:00`);
  const finishDate = new Date(`${date}T${finish}:00`);
  if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) return null;
  if (finishDate <= startDate) return null;
  return { startIso: startDate.toISOString(), finishIso: finishDate.toISOString() };
}

export function manualTimeIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "";
  const parsed = parseShiftTime(time);
  if (!parsed) return "";
  const d = new Date(`${date}T${parsed}:00`);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// ms -> HH:MM:SS
export function formatDuration(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return "00:00:00";
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function diffMs(aIso, bIso) {
  if (!aIso || !bIso) return 0;
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, b - a);
}

// ---- File downloads ----
export function downloadText(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- CSV ----
export function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  return header + "\n" + body;
}

export function downloadCsv(filename, rows, columns) {
  downloadText(filename, toCsv(rows, columns), "text/csv;charset=utf-8;");
}

// ---- PDF (jspdf) ----
import { jsPDF } from "jspdf";

export function exportPdfTable({ title, subtitle, columns, rows, filename }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (subtitle) {
    const subLines = doc.splitTextToSize(subtitle, pageW - margin * 2);
    subLines.forEach((ln) => {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += 14;
    });
    y += 6;
  }

  const colW = (pageW - margin * 2) / columns.length;
  const rowH = 20;

  const drawHeader = () => {
    doc.setFillColor(235, 235, 235);
    doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    columns.forEach((c, i) => {
      const t = doc.splitTextToSize(String(c.label), colW - 6)[0] || "";
      doc.text(t, margin + i * colW + 3, y + 14);
    });
    y += rowH;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach((r) => {
    if (y > pageH - margin - rowH) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }
    columns.forEach((c, i) => {
      const val = r[c.key] == null ? "" : String(r[c.key]);
      const lines = doc.splitTextToSize(val, colW - 6);
      doc.text(lines[0] || "", margin + i * colW + 3, y + 14);
    });
    y += rowH;
  });

  doc.save(filename);
}

export function exportPdfText({ title, subtitle, body, filename }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (subtitle) {
    const subLines = doc.splitTextToSize(subtitle, pageW - margin * 2);
    subLines.forEach((ln) => {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += 14;
    });
    y += 8;
  }

  doc.setFontSize(11);
  const paragraphs = String(body || "").split(/\n{2,}/);
  paragraphs.forEach((p) => {
    const lines = doc.splitTextToSize(p, pageW - margin * 2);
    lines.forEach((ln) => {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += 15;
    });
    y += 8;
  });

  doc.save(filename);
}