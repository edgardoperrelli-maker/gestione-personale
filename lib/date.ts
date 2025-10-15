export function monthRange(d=new Date()) {
  const y=d.getFullYear(), m=d.getMonth();
  const start=new Date(y,m,1); const end=new Date(y,m+1,0);
  const iso=(x:Date)=>x.toISOString().slice(0,10);
  return {start: iso(start), end: iso(end)};
}
