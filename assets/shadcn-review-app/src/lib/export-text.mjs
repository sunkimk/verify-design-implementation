export function structuredReport(parts,projectName,designerName){
 return {schemaVersion:1,projectName,designerName,exportedAt:new Date().toISOString(),pages:parts.map(p=>({id:p.id,name:p.name,status:p.status,error:p.error,sources:Object.fromEntries(Object.entries(p.sources).map(([k,v])=>[k,{name:v.name,width:v.width,height:v.height}])),issues:p.issues}))};
}
const escape = text=>String(text??'').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function markdownReport(parts,projectName){
 return `# ${escape(projectName)} · 设计验收报告\n\n`+parts.map(p=>`## ${escape(p.id)} · ${escape(p.name)}\n\n状态：${escape(p.status)}\n\n`+Object.entries(p.sources).map(([k,v])=>`- ${escape(k)}：${escape(v.name)}（${v.width}×${v.height}px）`).join('\n')+'\n\n'+p.issues.map(i=>`### ${escape(i.id)} · ${escape(i.title)}\n\n优先级：${escape(i.severity)} · ${escape(i.category)}\n\n**设计预期**：${escape(i.expected||i.summary)}\n\n**实现现状**：${escape(i.actual||i.delta)}\n\n**复刻要求**：${escape(i.recommendation||i.delta)}\n\n**坐标（原图像素）**\n\n\`\`\`json\n${JSON.stringify({left:i.leftLocation||i.location,right:i.rightLocation||i.location},null,2)}\n\`\`\`\n`).join('\n')).join('\n---\n\n');
}
