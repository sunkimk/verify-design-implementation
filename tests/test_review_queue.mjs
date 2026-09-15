import assert from 'node:assert/strict';
import {ReviewQueue,resolveQueuedScreen} from '../assets/shadcn-review-app/src/lib/batch-queue.mjs';
const a={id:'a',status:'done',reports:{old:true}},b={id:'b',status:'idle'},c={id:'c',status:'failed'};
const q=new ReviewQueue([a]);q.index=0;
assert.equal(q.enqueue(a),false);
assert.equal(q.enqueue(b),true);assert.equal(q.enqueue(b),false);assert.equal(q.enqueue(c),true);
assert.deepEqual(q.pending().map(s=>s.id),['b','c']);
assert.equal(q.cancel('a'),null);assert.equal(q.cancel('b'),b);
assert.deepEqual(q.pending().map(s=>s.id),['c']);assert.equal(q.enqueue(b),true);
assert.deepEqual(q.pending().map(s=>s.id),['c','b']);
assert.equal(resolveQueuedScreen(c,new Map([['c',{...c,sources:'updated'}]])).sources,'updated');
assert.equal(a.reports.old,true);
// Appending across an await must be visible to the existing consumer, without another worker.
const dynamic=new ReviewQueue([a]);const consumed=[];
for(let i=0;i<dynamic.items.length;i++){dynamic.index=i;consumed.push(dynamic.items[i].id);if(i===0)await Promise.resolve().then(()=>dynamic.enqueue(b));}
assert.deepEqual(consumed,['a','b']);assert.deepEqual(dynamic.pending(),[]);
console.log('review queue: append, deduplication, cancellation, requeue, source replacement and serial consumption passed');
