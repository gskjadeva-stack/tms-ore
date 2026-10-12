import assert from "node:assert/strict";
import test from "node:test";
import * as tmsUtils from "../src/lib/tmsUtils.js";

const localIso = (year, month, day, hour, minute, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second).toISOString();

test("formatLocalTime uses regular 12-hour time without seconds", () => {
  assert.equal(
    tmsUtils.formatLocalTime(localIso(2026, 9, 25, 14, 26, 5)),
    "2:26 PM"
  );
});

test("formatLocalTime uses 12 AM at midnight", () => {
  assert.equal(
    tmsUtils.formatLocalTime(localIso(2026, 9, 25, 0, 5, 0)),
    "12:05 AM"
  );
});

test("formatLocalTime uses 12 PM at noon", () => {
  assert.equal(
    tmsUtils.formatLocalTime(localIso(2026, 9, 25, 12, 5, 0)),
    "12:05 PM"
  );
});

test("formatLocal uses regular 12-hour time for timestamps", () => {
  assert.equal(
    tmsUtils.formatLocal(localIso(2026, 9, 25, 14, 26, 5)),
    "2026-09-25 2:26 PM"
  );
});

test("formatShiftTime converts HH:MM to regular 12-hour time", () => {
  assert.equal(tmsUtils.formatShiftTime("06:00"), "6:00 AM");
  assert.equal(tmsUtils.formatShiftTime("15:00"), "3:00 PM");
  assert.equal(tmsUtils.formatShiftTime("00:30"), "12:30 AM");
  assert.equal(tmsUtils.formatShiftTime("12:30"), "12:30 PM");
});

test("parseShiftTime converts regular 12-hour time to HH:MM", () => {
  assert.equal(tmsUtils.parseShiftTime("6:00 AM"), "06:00");
  assert.equal(tmsUtils.parseShiftTime("3:00 PM"), "15:00");
  assert.equal(tmsUtils.parseShiftTime("12:30 AM"), "00:30");
  assert.equal(tmsUtils.parseShiftTime("12:30 PM"), "12:30");
  assert.equal(tmsUtils.parseShiftTime("13:00 PM"), "");
});

test("manualTimeRangeIso converts a valid local start and finish to UTC ISO strings", () => {
  assert.deepEqual(tmsUtils.manualTimeRangeIso("2026-09-25", "2:26 PM", "3:45 PM"), {
    startIso: localIso(2026, 9, 25, 14, 26),
    finishIso: localIso(2026, 9, 25, 15, 45),
  });
});

test("manualTimeIso converts a valid local yard timestamp to UTC ISO", () => {
  assert.equal(
    tmsUtils.manualTimeIso("2026-09-25", "4:15 PM"),
    localIso(2026, 9, 25, 16, 15)
  );
});

test("manualTimeRangeIso rejects a finish time at or before start time", () => {
  assert.equal(tmsUtils.manualTimeRangeIso("2026-09-25", "2:26 PM", "2:26 PM"), null);
  assert.equal(tmsUtils.manualTimeRangeIso("2026-09-25", "3:00 PM", "2:26 PM"), null);
});
