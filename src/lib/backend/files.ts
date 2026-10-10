import type {
  BackendBlock,
  DbModelConfig,
  ValidationConfig,
} from "@/types/backend";

export function submissionFileFields(
  model: DbModelConfig,
  blocks: Pick<BackendBlock, "type" | "config">[],
) {
  return model.fields
    .filter(
      (field) =>
        ["object", "array"].includes(field.type) &&
        blocks.some(
          (block) =>
            block.type === "validation" &&
            (block.config as ValidationConfig).fieldName === field.name &&
            (block.config as ValidationConfig).rules.some(
              (rule) => rule.type === "file",
            ),
        ),
    )
    .map((field) => field.name);
}

export const MAX_SUBMISSION_FILE_BYTES = 1024 * 1024;
export interface FileLimits {
  maxBytes?: number;
  extensions?: string;
  multiple?: boolean;
  minFiles?: number;
  maxFiles?: number;
  maxTotalBytes?: number;
}
export function fileConfigError(limits: FileLimits = {}) {
  if (
    limits.maxBytes !== undefined &&
    (!Number.isInteger(limits.maxBytes) ||
      limits.maxBytes < 1 ||
      limits.maxBytes > MAX_SUBMISSION_FILE_BYTES)
  )
    return "File size must be from 1 byte to 1024 KiB.";
  if (limits.multiple) {
    const min = limits.minFiles ?? 0,
      max = limits.maxFiles ?? 5;
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max < 1 ||
      max > 5 ||
      min > max
    )
      return "Choose a minimum from 0 to the maximum and a maximum from 1 to 5 files.";
    if (
      limits.maxTotalBytes !== undefined &&
      (!Number.isInteger(limits.maxTotalBytes) ||
        limits.maxTotalBytes < 1 ||
        limits.maxTotalBytes > MAX_SUBMISSION_FILE_BYTES)
    )
      return "Combined file size must be from 1 byte to 1024 KiB.";
  } else if (
    limits.minFiles !== undefined ||
    limits.maxFiles !== undefined ||
    limits.maxTotalBytes !== undefined
  )
    return "File count and combined size limits require Multiple.";
  const extensions = String(limits.extensions || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    String(limits.extensions || "").length > 300 ||
    extensions.length > 20 ||
    extensions.some((value) => !/^\.[a-z0-9]{1,12}$/.test(value))
  )
    return "Use up to 20 file extensions, separated by commas, such as .pdf, .png or .txt. MIME patterns are not supported for submission attachments.";
  return "";
}
export function fileLimits(props: Record<string, unknown>): FileLimits {
  return {
    maxBytes: Number(props.maxFileKB ?? 256) * 1024,
    extensions: String(props.accept || ""),
    ...(props.multiple
      ? {
          multiple: true,
          minFiles: Math.max(
            Number(props.minFiles ?? 0),
            props.required ? 1 : 0,
          ),
          maxFiles: Number(props.maxFiles ?? 5),
          maxTotalBytes: Number(props.maxTotalKB ?? 1024) * 1024,
        }
      : {}),
  };
}
/** Embedded bytes are saved atomically with the record; never used as a filesystem path. */
export const FILE_VALIDATION_RUNTIME = String.raw`
function fileRuleValid(rule, value) {
  const limits = rule.file || {}, maximum = limits.maxBytes ?? 1048576;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1048576) return false;
  if (limits.multiple) {
    const min = limits.minFiles ?? 0, max = limits.maxFiles ?? 5, total = limits.maxTotalBytes ?? 1048576;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 5 || min > max || !Number.isInteger(total) || total < 1 || total > 1048576) return false;
    return Array.isArray(value) && value.length >= min && value.length <= max && value.every(file => fileRuleValid({file: {maxBytes: maximum, extensions: limits.extensions}}, file)) && value.reduce((sum, file) => sum + file.size, 0) <= total;
  }
  if (limits.minFiles !== undefined || limits.maxFiles !== undefined || limits.maxTotalBytes !== undefined) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'data,name,size') return false;
  if (typeof value.name !== 'string' || !value.name || value.name.length > 120 || /[\x00-\x1f\x7f/\\]/.test(value.name) || ['.', '..'].includes(value.name)) return false;
  if (!Number.isInteger(value.size) || value.size < 0 || value.size > maximum || typeof value.data !== 'string' || value.data.length > Math.ceil(maximum / 3) * 4) return false;
  const extensions = String(limits.extensions || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (extensions.length > 20 || extensions.some(item => !/^\.[a-z0-9]{1,12}$/.test(item)) || extensions.length && !extensions.some(item => value.name.toLowerCase().endsWith(item))) return false;
  try { const bytes = atob(value.data); return bytes.length === value.size && btoa(bytes) === value.data; } catch { return false; }
}
`;
