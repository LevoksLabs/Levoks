import { headerContractProblems } from "./header-contracts";
import { binding } from "./program-schema";

export type ResponseHeader = {
  name: string;
  value: string | number | boolean | null;
};

export function responseHeaderProblems(headers: ResponseHeader[]) {
  const problems = headerContractProblems(
    headers.map((header) => ({
      name: header.name,
      type: "string",
      required: false,
    })),
  );
  let bytes = 0;
  for (const { name, value } of headers) {
    if (
      /^(cache-control|expires|etag|last-modified|location|vary|refresh|strict-transport-security|x-content-type-options|x-frame-options|x-request-id|referrer-policy|clear-site-data|origin-agent-cluster|report-to|reporting-endpoints|nel|link|x-dns-prefetch-control|x-download-options|x-permitted-cross-domain-policies|x-xss-protection)$/i.test(
        name,
      ) ||
      /^(content-|cross-origin-)/i.test(name)
    )
      problems.push(
        `Header ${name} is managed by the response transport or security policy. Use an application metadata header.`,
      );
    if (typeof value === "string" && value.startsWith("$")) {
      if (!binding.safeParse(value).success)
        problems.push(`Header ${name} needs a safe $context.path binding.`);
      if (/password|secret|token/i.test(value))
        problems.push(
          `Header ${name} cannot expose a credential or secret binding.`,
        );
      continue;
    }
    const text = String(value);
    if (value === null || text.length > 4096 || /[^\x20-\x7e]/.test(text))
      problems.push(
        `Header ${name} needs a scalar ASCII value of at most 4 KB, without line breaks.`,
      );
    bytes += name.length + text.length;
  }
  if (bytes > 8192)
    problems.push(
      "Response headers must total at most 8 KB, including names and values.",
    );
  return problems;
}

/** Values are resolved and checked before identity side effects or HTTP writes. */
export const RESPONSE_HEADERS_RUNTIME = String.raw`
function responseHeaders(fields, context) {
  const headers = Object.create(null);
  let bytes = 0;
  if (fields.length > 32) throw new WorkflowError(500, 'Response header limit exceeded');
  for (const field of fields) {
    const name = field.name.toLowerCase(), value = resolve(field.value, context);
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || Object.hasOwn(headers, name)) throw new WorkflowError(500, 'Invalid response header contract');
    if (!['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) throw new WorkflowError(500, 'Response header needs a scalar value');
    const text = String(value);
    bytes += name.length + text.length;
    if (text.length > 4096 || /[^\x20-\x7e]/.test(text) || bytes > 8192) throw new WorkflowError(500, 'Invalid response header value');
    headers[name] = text;
  }
  return headers;
}
`;
