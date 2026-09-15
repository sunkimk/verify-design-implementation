import assert from 'node:assert/strict';
import {layoutScreensWithAdd} from '../assets/shadcn-review-app/src/lib/multi-page.mjs';
const source={width:375,height:812};
for(let count=0;count<=13;count++){
 const screens=Array.from({length:count},(_,i)=>({id:`S${i}`,sources:{design:source,implementation:source}}));
 const result=layoutScreensWithAdd(screens,{left:'design',right:'implementation'});
 assert.equal(result.groups.length,count);
 assert.equal(result.addSlot.x,(count%3)*1000);
 const all=[...result.groups,result.addSlot];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
 }
}
console.log('Three-column append slot placement and non-overlap pass for 0–13 groups.');
