import assert from "node:assert/strict";
import test from "node:test";
import { isValidCas, migrateStoredTags, parseTagQuery, uniqueTags, selectedInScope, addTagToRecords, restoreDeleted, DELETE_UNDO_MS, paginate, validPageSize } from "../desktop/ui/model.ts";

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

const records = [
  { id: "a", tags: ["Acid"], amount: "250 g", database: { sources: ["pubchem"] } },
  { id: "b", tags: [], amount: "2 L", database: { sources: [] } },
  { id: "c", tags: ["Dry"], amount: "5 g", database: { sources: [] } },
];
test("batch targets stay inside filtered results, including stale selection IDs", () => {
  const scope = records.slice(0, 2);
  assert.deepEqual(selectedInScope(scope, ["b", "c", "missing"]), [records[1]]);
  assert.deepEqual(selectedInScope([], ["a"]), []);
});
test("batch tags preserve fields and outside records, deduplicate and accept new tags", () => {
  const updated = addTagToRecords(records, ["a", "b"], " acid ");
  assert.deepEqual(updated[0], records[0]);
  assert.deepEqual(updated[1].tags, ["acid"]);
  assert.equal(updated[2], records[2]);
  assert.deepEqual(addTagToRecords(updated, ["b"], "New tag")[1].tags, ["acid", "New tag"]);
});
test("undo restores an entire batch losslessly without overwriting subsequent edits", () => {
  const edited = { ...records[2], amount: "10 g" };
  const batch = { records: records.slice(0, 2), expiresAt: DELETE_UNDO_MS };
  assert.deepEqual(restoreDeleted([edited], batch, 1), [edited, records[0], records[1]]);
  assert.deepEqual(restoreDeleted([records[0]], batch, 1), [records[0], records[1]]);
  assert.deepEqual(restoreDeleted([], batch, DELETE_UNDO_MS), []);
  assert.deepEqual(restoreDeleted([], batch, DELETE_UNDO_MS + 1), []);
});

test("pagination handles boundaries, shrinking filtered results and empty inventories", () => {
  assert.deepEqual(paginate(records, 1, 2), { page: 1, pages: 2, start: 1, end: 2, items: records.slice(0, 2) });
  assert.deepEqual(paginate(records, 2, 2).items, [records[2]]);
  assert.equal(paginate(records.slice(0, 1), 2, 2).page, 1);
  assert.deepEqual(paginate([], 10, 2), { page: 1, pages: 1, start: 0, end: 0, items: [] });
  assert.equal(paginate(records, -1, 2).page, 1);
  assert.equal(paginate(records, 1, 0).pages, 1);
});
test("page size preferences accept only bounded integers", () => {
  for (const size of [1, 24, 500]) assert.equal(validPageSize(size), true);
  for (const size of [0, -1, 1.5, 501, NaN, Infinity]) assert.equal(validPageSize(size), false);
});
test("selection remains independent of the displayed page", () => {
  const selected = selectedInScope(records, ["a", "c"]);
  assert.equal(paginate(records, 2, 2).items.length, 1);
  assert.deepEqual(selected.map((record) => record.id), ["a", "c"]);
});
