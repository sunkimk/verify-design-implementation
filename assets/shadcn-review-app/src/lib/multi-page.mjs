export const GROUP_WIDTH = 900;
export const GROUP_IMAGE_WIDTH = 414;
export function layoutScreens(screens, relation = {left:'design',right:'implementation'}) {
  const columns = 3, gap = 100;
  let y = 0;
  const groups = [];
  for (let start=0; start<screens.length; start+=columns) {
    const row = screens.slice(start,start+columns).map((screen,index) => {
      const images=[screen.sources?.[relation.left],screen.sources?.[relation.right]];
      const height = Math.max(300,...images.filter(Boolean).map(img=>GROUP_IMAGE_WIDTH*img.height/img.width)) + 120;
      return {screen,x:index*(GROUP_WIDTH+gap),y,width:GROUP_WIDTH,height};
    });
    groups.push(...row);y+=Math.max(...row.map(group=>group.height))+gap;
  }
  return {groups,width:Math.min(columns,screens.length)*(GROUP_WIDTH+gap)- (screens.length?gap:0),height:Math.max(0,y-gap)};
}
export function exportStatus(screen, report) {
  if (!screen.sources?.design || !screen.sources?.implementation) return '素材不完整';
  if (screen.status === 'running') return '检测中（未完成）';
  if (screen.status === 'failed') return '检测失败';
  if (!report) return '未检测';
  if ((report.issues || []).some(item=>item.kind==='blocker')) return '两侧不对应，需重新配对';
  return report.issues?.length ? '待处理问题' : '未发现未忽略问题（非人工验收通过）';
}
export function collectExportParts(screens,pairKey,relation) {
  return screens.map((screen,index)=>({
    id:screen.id || `S${index+1}`, name:screen.name || `界面 ${index+1}`, sources:screen.sources || {},
    left:screen.sources?.[relation.left],right:screen.sources?.[relation.right],
    issues:screen.reports?.[pairKey]?.issues || [],
    status:exportStatus(screen,screen.reports?.[pairKey]),error:screen.error || '',
  }));
}
export function pageFileName(part,index,extension) {
  const safe=String(part.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,90).trim() || '页面';
  return `${String(index+1).padStart(3,'0')}-${safe}.${extension}`;
}

export function layoutScreensWithAdd(screens, relation) {
  const populated=screens.filter(screen=>screen.sources?.design||screen.sources?.implementation);
  const last=populated.at(-1);
  const layout=layoutScreens([...populated,{id:'add-slot',sources:last?.sources||{}}],relation);
  const addSlot=layout.groups.pop();
  addSlot.height=Math.max(addSlot.height,...layout.groups.filter(group=>group.y===addSlot.y).map(group=>group.height));
  return {...layout,addSlot,height:Math.max(layout.height,addSlot.y+addSlot.height)};
}
