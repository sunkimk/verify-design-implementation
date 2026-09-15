export function mergeDraftSources(current, kind, loaded, append = false) {
  const field = kind === 'design' ? 'designs' : 'implementations';
  const next = {
    designs: current?.designs || [], implementations: current?.implementations || [],
    overrides: append ? {...current?.overrides} : {},
    skipped: append ? {...current?.skipped} : {},
  };
  const merged = append ? [...next[field], ...loaded] : [...loaded];
  next[field] = kind === 'design'
    ? merged.sort((a,b) => a.name.localeCompare(b.name,'zh-Hans-CN',{numeric:true,sensitivity:'base'}))
    : merged;
  return next;
}
