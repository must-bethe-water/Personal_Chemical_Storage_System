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
