import { test, expect } from "@playwright/test";
import { runInNewContext } from "node:vm";
import { VALIDATION_RUNTIME } from "../../src/lib/backend/validation";
import { textFormats } from "../../src/lib/backend/text-validation";
import { formValueRuntime } from "../../src/lib/codegen/form-values";

test("fixed text formats and URL parsing enforce the browser/server contract", async ({
  page,
}) => {
  for (const format of textFormats)
    for (const value of [
      "",
      "123",
      "É東京",
      "É東京123",
      "John Smith",
      "product-123",
      "product--123",
      "😀",
      "A\nB",
    ]) {
      const browser = await page.evaluate(
        ({ pattern, value }) => {
          const input = document.createElement("input");
          input.type = "text";
          if (pattern) input.pattern = pattern;
          input.value = value;
          return { value: input.value, valid: input.checkValidity() };
        },
        { pattern: format.pattern, value },
      );
      const server = runInNewContext(
        `${VALIDATION_RUNTIME}\nvalidationRuleValid(rule,value)`,
        {
          rule: { type: "text", text: { pattern: format.pattern } },
          value: browser.value,
          URL,
        },
      );
      expect(server, JSON.stringify({ format, value })).toBe(browser.valid);
    }
  for (const value of [
    "",
    "https://example.test",
    "http://localhost:3000",
    "mailto:hello@example.test",
    "ftp://example.test",
    "javascript:alert(1)",
    "https://例え.テスト",
    "/relative",
    "example.test",
    "https://",
    "http://a b",
    "http://a%20b",
    "https://exa%23mple.test",
    "https://[::1]:3000/path",
    "https://example.test/hello%20world",
    "https://exam%70le.test",
    "https:example.test",
    " https://example.test\n",
  ]) {
    const browser = await page.evaluate((value) => {
      const input = document.createElement("input");
      input.type = "url";
      input.value = value;
      return { value: input.value, valid: input.checkValidity() };
    }, value);
    const server = runInNewContext(
      `${VALIDATION_RUNTIME}\nvalidationRuleValid(rule,value)`,
      { rule: { type: "url" }, value: browser.value, URL },
    );
    if (value === "http://a b") {
      expect(browser.valid).toBe(true);
      expect(server).toBe(false);
    } else if (["http://a%20b", "https://exa%23mple.test"].includes(value))
      expect(server, value).toBe(false);
    else expect(server, value).toBe(browser.valid);
    const client = await page.evaluate(
      ({ runtime, value }) => {
        const input = document.createElement("input");
        input.type = "url";
        input.value = value;
        try {
          new Function(
            "input",
            "form",
            runtime + "\nreturn formControlValue(input, form);",
          )(input, { elements: [] });
          return true;
        } catch {
          return false;
        }
      },
      { runtime: formValueRuntime, value: browser.value },
    );
    expect(client, value).toBe(server);
  }
});
