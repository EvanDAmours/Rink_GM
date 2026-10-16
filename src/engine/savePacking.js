// Lossless repeated-record schemas keep complete career histories economical.
// Arrays carry -1; objects carry a schema index. Strings/keys are never evaluated.
export function packLeague(value){
 const schemas=[],ids=new Map();
 const visit=v=>{
  if(v===null || typeof v!=='object')return v;
  if(Array.isArray(v))return [-1,...v.map(visit)];
  const keys=Object.keys(v).filter(k=>v[k]!==undefined && typeof v[k]!=='function' && typeof v[k]!=='symbol'),signature=JSON.stringify(keys);
  let id=ids.get(signature);if(id===undefined){id=schemas.length;ids.set(signature,id);schemas.push(keys);}
  return [id,...keys.map(k=>visit(v[k]))];
 };
 const data=visit(value);return {rinkgmPacked:1,schemas,data};
}
export function unpackLeague(value){
 if(value?.rinkgmPacked!==1)return value;
 const {schemas}=value;if(!Array.isArray(schemas))throw new Error('Invalid save schemas');
 const visit=v=>{
  if(!Array.isArray(v))return v;
  const [id,...items]=v;if(id===-1)return items.map(visit);
  const keys=schemas[id];if(!Number.isInteger(id)||!Array.isArray(keys)||keys.length!==items.length)throw new Error('Invalid save record');
  return Object.fromEntries(keys.map((key,i)=>{if(typeof key!=='string')throw new Error('Invalid save key');return [key,visit(items[i])];}));
 };
 return visit(value.data);
}
