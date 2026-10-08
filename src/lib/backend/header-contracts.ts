import type { SchemaField } from "@/types/backend";

/** Application metadata cannot replace browser, transport or identity headers. */
export function headerContractProblems(fields: SchemaField[]) {
  const problems: string[] = [];
  const seen = new Set<string>();
  const reserved = new Set([
    "authorization", "cookie", "set-cookie", "host", "origin", "referer",
    "content-type", "content-length", "accept", "user-agent", "connection",
    "transfer-encoding", "trailer", "te", "upgrade", "keep-alive", "expect",
    "www-authenticate", "x-real-ip", "x-http-method-override", "forwarded",
    "accept-charset", "accept-encoding", "cookie2", "date", "dnt", "via",
    "permissions-policy", "x-http-method", "x-method-override", "x-api-key",
  ]);
  for (const field of fields) {
    const name = field.name.toLowerCase();
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))
      problems.push(`Header ${field.name} must use letters, numbers and single hyphens.`);
    if (reserved.has(name) || /^(sec-|proxy-|x-forwarded-|x-levoks-|access-control-)/.test(name) || /(?:^|-)(password|secret|token)(?:-|$)/.test(name))
      problems.push(`Header ${field.name} is managed by the browser, transport or authentication. Use an application metadata header such as X-App-Version.`);
    if (seen.has(name)) problems.push(`Header ${field.name} is repeated; header names are case-insensitive.`);
    seen.add(name);
    if (["object", "array"].includes(field.type)) problems.push(`Header ${field.name} must use a scalar type.`);
    if (field.defaultValue !== undefined || field.unique || field.indexed || field.ref)
      problems.push(`Header ${field.name} cannot have model defaults, indexes or references.`);
  }
  if (fields.length > 32) problems.push("Declare at most 32 application headers per endpoint.");
  return problems;
}
