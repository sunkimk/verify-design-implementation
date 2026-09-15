export const draftKey = row => row._rowId || (row.design ? `d:${row.design.name}` : `i:${row.implementation?.name || ''}`);
export const pinRows = rows => rows.map(row => ({...row, _rowId: draftKey(row)}));
// A selected source moves between draft rows, never duplicates itself. Clearing only unassigns it.
// Picking a file for one row leaves every other row alone, even when they already hold that same
// file. One screenshot legitimately serves several pairs — the same screen on iOS and Android each
// compared against one design, or one build screenshot checked against two design revisions. This
// used to trade the file away from whichever row had it, which silently broke a pairing the reviewer
// had already settled. Automatic matching still prefers unused files, so duplicates only ever come
// from an explicit pick.
export function selectDraftSource(rows, key, side, source) {
  const pinned = pinRows(rows);
  const target = pinned.find(row => draftKey(row) === key);
  if (!target) return pinned;
  const complete = Boolean(source && target[side === "design" ? "implementation" : "design"]);
  return pinned.map(row => draftKey(row) === key
    ? {...row, [side]: source, manual: true, confirmed: complete, needsConfirmation: !complete}
    : row);
}

export function confirmDraftPair(rows, key, confirmed) {
  return pinRows(rows).map(row => draftKey(row) === key && row.design && row.implementation
    ? {...row, confirmed, needsConfirmation: !confirmed} : row);
}
