export const autoConfirmsPair = entry => Number.isFinite(entry.match) && entry.match >= 90 && !entry.needsConfirmation;
export function sortPairRows(rows) {
  return rows.map((row,index)=>({...row,sourceIndex:index})).sort((a,b)=>{
    const score = row => Number.isFinite(row.quality.match) ? row.quality.match : -1;
    return score(b)-score(a) || a.sourceIndex-b.sourceIndex;
  });
}

export function canRunPair(entry, quality, skipped = false) {
  return Boolean(entry.design && entry.implementation && quality.state === 'ready' && !skipped);
}
