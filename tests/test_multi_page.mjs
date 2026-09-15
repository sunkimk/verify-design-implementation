import assert from 'node:assert/strict';
import {layoutScreens,collectExportParts,pageFileName} from '../assets/shadcn-review-app/src/lib/multi-page.mjs';
import {buildZip} from '../assets/shadcn-review-app/src/lib/zip.mjs';
import {writeFile} from 'node:fs/promises';
const image={width:375,height:812,src:'test'};
const screens=Array.from({length:7},(_,i)=>({id:`S${i}`,name:'同名',sources:{design:image,implementation:{...image,height:i?812:4000}},reports:i?{}:{'design-implementation':{issues:[{id:'VD-001'}]}}}));
const board=layoutScreens(screens);
assert.equal(board.groups.length,7);
for(let i=0;i<board.groups.length;i++)for(let j=i+1;j<board.groups.length;j++){
 const a=board.groups[i],b=board.groups[j];assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
}
const parts=collectExportParts(screens,'design-implementation',{left:'design',right:'implementation'});
assert.equal(parts[0].issues.length,1);assert.equal(parts[1].status,'未检测');assert.equal(new Set(parts.map((p,i)=>pageFileName(p,i,'html'))).size,7);
const zip=await buildZip([{name:'001-同名.html',data:new Blob(['first'])},{name:'002-同名.html',data:new Blob(['second'])}]);
await writeFile('/private/tmp/zymix-multi-test.zip',new Uint8Array(await zip.arrayBuffer()));
console.log('Multi-screen layout, independent reports/statuses and unique names pass.');
