// Only the five best candidates move to the front; the rest keep their source order.
export function rankCandidates(options, counterpart, score) {
  const rows = options.map((item,index) => ({item,index,score:counterpart ? score(item,counterpart) : NaN}));
  const best = rows.filter(row=>Number.isFinite(row.score)).sort((a,b)=>b.score-a.score || a.index-b.index).slice(0,5);
  const selected = new Set(best.map(row=>row.index));
  return [...best.map(row=>({item:row.item,percent:Math.round(Math.max(0,Math.min(1,row.score))*100)})),
    ...rows.filter(row=>!selected.has(row.index)).map(row=>({item:row.item,percent:null}))];
}
