import assert from 'node:assert/strict';
import {pinRows,draftKey,selectDraftSource,confirmDraftPair} from '../assets/shadcn-review-app/src/lib/draft-rows.mjs';
const a={name:'a'},b={name:'b'},x={name:'x'},y={name:'y'};
const rows=pinRows([{design:a,implementation:x},{design:b,implementation:y},{_rowId:'new',design:null,implementation:null}]);
const cleared=selectDraftSource(rows,'d:a','design',null);
assert.equal(cleared[0].implementation,x);assert.equal(draftKey(cleared[0]),'d:a');assert.equal(cleared.length,3);
const filled=selectDraftSource(cleared,'new','implementation',y);
// The same file may serve several rows: picking y for the new row must not take it from row 1.
assert.equal(filled[2].implementation,y);assert.equal(filled[1].implementation,y);assert.equal(filled[1].design,b);
assert.equal(rows[0].design,a);assert.equal(rows[1].implementation,y);
console.log('Draft row identity, single-side clearing, shared sources and input immutability pass.');

const confirmed=confirmDraftPair(rows,'d:a',true);
assert.equal(confirmed[0].confirmed,true);
assert.equal(confirmDraftPair(confirmed,'d:a',false)[0].needsConfirmation,true);
assert.equal(selectDraftSource(confirmed,'d:a','implementation',y)[0].confirmed,true);
assert.equal(selectDraftSource(confirmed,'d:a','design',null)[0].confirmed,false);
assert.equal(confirmDraftPair(rows,'new',true)[2].confirmed,undefined);
console.log('Confirm, undo, reassignment invalidation and incomplete-pair protection pass.');

// Untouched rows keep their own confirmation; only the row that changed is re-evaluated.
assert.equal(selectDraftSource(confirmed,"d:a","implementation",y)[1].confirmed,confirmed[1].confirmed);
assert.equal(selectDraftSource(rows,"new","design",a)[2].confirmed,false);
