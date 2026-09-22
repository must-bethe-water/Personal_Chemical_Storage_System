const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

export const isValidCas = (cas: string) => {
  if (!CAS_PATTERN.test(cas)) return false;
  const digits = cas.replaceAll("-", "");
  const checksum = digits.slice(0, -1).split("").reverse().reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 10;
  return checksum === Number(digits.at(-1));
};

export const parseTagQuery = (value: string) => {
  const seen = new Set<string>();
  return value.split(/[,，;；/]+/).map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const uniqueTags = (tags: string[]) => {
  const seen = new Set<string>();
  return tags.map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const migrateStoredTags = (tags: unknown, legacyTag: unknown) =>
  Array.isArray(tags) && tags.every((tag) => typeof tag === "string")
    ? uniqueTags(tags)
    : parseTagQuery(typeof legacyTag === "string" ? legacyTag : "");

export const DELETE_UNDO_MS = 30 * 60 * 1000;
export const selectedInScope = <T extends { id: string }>(records: T[], ids: string[]) => {
  const selected = new Set(ids);
  return records.filter((record) => selected.has(record.id));
};
export const addTagToRecords = <T extends { id: string; tags: string[] }>(records: T[], ids: string[], tag: string): T[] => {
  const selected = new Set(ids);
  return records.map((record) => selected.has(record.id) ? { ...record, tags: uniqueTags([...record.tags, tag]) } : record);
};
export const restoreDeleted = <T extends { id: string }>(records: T[], batch: { records: T[]; expiresAt: number }, now: number): T[] => {
  if (now >= batch.expiresAt) return records;
  const existing = new Set(records.map((record) => record.id));
  return [...records, ...batch.records.filter((record) => !existing.has(record.id))];
};

export const DEFAULT_PAGE_SIZE = 24;
export const validPageSize = (value: number) => Number.isInteger(value) && value >= 1 && value <= 500;
export const paginate = <T>(records: T[], requestedPage: number, requestedSize: number) => {
  const size = validPageSize(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(records.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * size;
  return { page, pages, start: records.length ? start + 1 : 0, end: Math.min(start + size, records.length), items: records.slice(start, start + size) };
};
