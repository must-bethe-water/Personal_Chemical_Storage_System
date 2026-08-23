import assert from "node:assert/strict";
import test from "node:test";
import { isValidCas, migrateStoredTags, parseTagQuery, uniqueTags } from "../desktop/ui/model.ts";

test("CAS validation checks format and checksum", () => {
  assert.equal(isValidCas("65-85-0"), true);
  assert.equal(isValidCas("58-08-2"), true);
  assert.equal(isValidCas("65-85-1"), false);
  assert.equal(isValidCas("not-a-cas"), false);
});

test("tag parsing accepts bilingual separators and deduplicates case-insensitively", () => {
  assert.deepEqual(parseTagQuery("Acid，Flammable; acid / Dry"), ["Acid", "Flammable", "Dry"]);
  assert.deepEqual(uniqueTags([" Acid ", "acid", "", "Dry"]), ["Acid", "Dry"]);
});

test("legacy single-tag records migrate without overriding modern tags", () => {
  assert.deepEqual(migrateStoredTags(undefined, "Acid, Dry"), ["Acid", "Dry"]);
  assert.deepEqual(migrateStoredTags(["Modern"], "Legacy"), ["Modern"]);
  assert.deepEqual(migrateStoredTags(["Valid", 3], "Fallback"), ["Fallback"]);
});
