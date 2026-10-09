import { test, expect } from "@playwright/test";
import { runInNewContext } from "node:vm";
import { VALIDATION_RUNTIME } from "../../src/lib/backend/validation";
import type { ValidationRule } from "../../src/types/backend";

test("generated temporal validation agrees with native Chromium constraints", async ({
  page,
}) => {
  const sets: [ValidationRule, string[]][] = [
    [
      { type: "date", temporal: { step: "any" }, message: "" },
      [
        "0001-01-01",
        "0099-12-31",
        "2000-02-29",
        "1900-02-29",
        "2026-02-29",
        "2026-04-31",
        "10000-01-01",
        "2026-10-15\n",
      ],
    ],
    [
      {
        type: "date",
        temporal: { min: "2026-10-15", max: "2026-10-21", step: "2" },
        message: "",
      },
      [
        "2026-10-13",
        "2026-10-15",
        "2026-10-16",
        "2026-10-17",
        "2026-10-21",
        "2026-10-23",
        "",
      ],
    ],
    [
      {
        type: "date",
        temporal: { base: "1970-01-02", step: "2" },
        message: "",
      },
      ["1970-01-01", "1970-01-02", "1970-01-03", "1970-01-04"],
    ],
    [
      {
        type: "time",
        temporal: { min: "22:00", max: "02:00", step: "1800" },
        message: "",
      },
      [
        "22:00",
        "22:15",
        "22:30",
        "23:59",
        "00:00",
        "01:30",
        "02:00",
        "02:30",
        "12:00",
      ],
    ],
    [
      { type: "time", temporal: { base: "12:00:30" }, message: "" },
      ["12:00", "12:00:30", "12:01:30", "12:01:31"],
    ],
    [
      { type: "time", temporal: { step: "any" }, message: "" },
      ["00:00", "23:59:59.999", "24:00", "12:30:60", "12:30:45.1234", "12:30Z"],
    ],
    [
      { type: "time", temporal: { step: "0.1" }, message: "" },
      ["12:30:45.1", "12:30:45.12", "12:30:45.123"],
    ],
    [
      {
        type: "datetime-local",
        temporal: {
          min: "2026-10-15T09:15",
          max: "2026-10-15T17:15",
          step: "1800",
        },
        message: "",
      },
      [
        "2026-10-15T09:15",
        "2026-10-15T09:30",
        "2026-10-15T09:45",
        "2026-10-15T17:45",
        "2026-10-15T09:45Z",
        "",
      ],
    ],
    [
      { type: "datetime-local", temporal: { step: "any" }, message: "" },
      [
        "2026-03-08T02:30",
        "2026-10-15 12:30:45.012",
        "2028-02-29T12:00",
        "2026-02-29T12:00",
      ],
    ],
  ];
  for (const [rule, values] of sets)
    for (const value of values) {
      const native = await page.evaluate(
        ({ rule, value }) => {
          const input = document.createElement("input");
          input.type = rule.type;
          const limits = rule.temporal || {};
          for (const key of ["min", "max", "step"] as const)
            if (limits[key]) input.setAttribute(key, limits[key]);
          if (limits.base) input.setAttribute("value", limits.base);
          input.value = value;
          return (value === "" || input.value !== "") && input.checkValidity();
        },
        { rule, value },
      );
      const server = runInNewContext(
        `${VALIDATION_RUNTIME}\nvalidationRuleValid(rule,value)`,
        { rule, value },
      );
      expect(server, JSON.stringify({ rule, value })).toBe(native);
    }
});
