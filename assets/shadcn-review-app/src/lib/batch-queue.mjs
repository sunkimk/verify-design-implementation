export function canEditQueuedScreen(screen,{batchRunning,isAnalyzing,replacing,runningId}) {
  return Boolean(screen && !isAnalyzing && !replacing && runningId!==screen.id && (!batchRunning || screen.status==='idle' || screen.status==='pending'));
}
export function resolveQueuedScreen(original,changes) {
  return changes.has(original.id) ? changes.get(original.id) : original;
}

// Mutable work list: the consumer may be awaiting a review while the UI appends/removes jobs.
export class ReviewQueue {
  constructor(items=[]) { this.items=[...items]; this.index=-1; }
  pending() { return this.items.slice(this.index+1); }
  enqueue(screen) {
    if(this.items.slice(Math.max(0,this.index)).some(item=>item.id===screen.id))return false;
    this.items.push(screen);return true;
  }
  cancel(id) {
    const index=this.items.findIndex((item,index)=>index>this.index&&item.id===id);
    if(index<0)return null;
    return this.items.splice(index,1)[0];
  }
}
