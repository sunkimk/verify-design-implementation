const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
// Stored ZIP: browser-local, UTF-8 filenames, no network/dependency or lossy recompression.
export async function buildZip(files) {
  const encoder=new TextEncoder(),local=[],central=[];let offset=0,centralSize=0;
  if(files.length>65535)throw new Error('文件数量超过ZIP限制');
  for(const file of files){
    const name=encoder.encode(file.name),data=file.data instanceof Uint8Array?file.data:new Uint8Array(await file.data.arrayBuffer());
    if(data.length>0xffffffff || offset+data.length>0xffffffff)throw new Error('导出超过4GB，请分批导出');
    const crc=crc32(data),h=header(30),v=h.view;
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);
    v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
    local.push(h.bytes,name,data);
    const c=header(46),d=c.view;d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);
    d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);
    central.push(c.bytes,name);centralSize+=46+name.length;offset+=30+name.length+data.length;
  }
  const end=header(22),v=end.view;v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  return new Blob([...local,...central,end.bytes],{type:'application/zip'});
}
