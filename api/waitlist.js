import { put, get, del } from '@vercel/blob';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
const limits=new Map();
export function validate(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  if(typeof body.email!=='string')return null;
  const email=body.email.trim().toLowerCase();
  if(email.length>254||!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)||/[\r\n\x00-\x1f]/.test(email))return null;
  return {email,scenario:['report','talk','meeting','other'].includes(body.scenario)?body.scenario:'',language:body.language==='en'?'en':'zh'};
}
async function read(path){const result=await get(path,{access:'private',useCache:false});if(!result||result.statusCode!==200)return null;return JSON.parse(await new Response(result.stream).text())}
export function makeHandler(storage={put,read,del},now=Date.now){return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  if(!['POST','DELETE'].includes(req.method)){res.setHeader('Allow','POST, DELETE');return res.status(405).json({error:'method_not_allowed'})}
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).json({error:'json_required'});
  const origin=req.headers.origin;const host=req.headers.host;
  if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'origin_rejected'})}catch{return res.status(403).json({error:'origin_rejected'})}}
  let body=req.body;try{if(typeof body==='string')body=JSON.parse(body)}catch{return res.status(400).json({error:'invalid_body'})}
  if(Buffer.byteLength(JSON.stringify(body??''))>2048)return res.status(413).json({error:'too_large'});
  const value=validate(body);if(!value)return res.status(400).json({error:'invalid_email'});
  if(body.company)return res.status(400).json({error:'invalid_request'});
  const stamp=now();const ip=hash(String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]);
  for(const [key,entry] of limits)if(entry.until<stamp)limits.delete(key);
  const bucket=limits.get(ip)||{count:0,until:stamp+60_000};if(bucket.count>=8){res.setHeader('Retry-After','60');return res.status(429).json({error:'rate_limited'})}bucket.count++;limits.set(ip,bucket);
  const pathname=`waitlist/${hash(value.email)}.json`;
  try{
    if(req.method==='DELETE'){
      if(typeof body.token!=='string'||!/^[a-f0-9]{48}$/.test(body.token))return res.status(403).json({error:'invalid_token'});
      const existing=await storage.read(pathname);if(!existing)return res.status(200).json({ok:true});
      const supplied=Buffer.from(hash(body.token),'hex');const expected=Buffer.from(existing.withdrawalTokenHash||'','hex');
      if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return res.status(403).json({error:'invalid_token'});
      await storage.del(pathname);return res.status(200).json({ok:true});
    }
    if(body.consent!==true)return res.status(400).json({error:'consent_required'});
    const existing=await storage.read(pathname);if(existing)return res.status(200).json({ok:true});
    const withdrawalToken=randomBytes(24).toString('hex');
    try{await storage.put(pathname,JSON.stringify({...value,createdAt:new Date(stamp).toISOString(),consentVersion:'2026-11-16',withdrawalTokenHash:hash(withdrawalToken)}),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:false})}
    catch(error){if(error?.name==='BlobAlreadyExistsError')return res.status(200).json({ok:true});throw error}
    return res.status(201).json({ok:true,withdrawalToken});
  }catch(error){console.error('Waitlist storage operation failed:',error?.name||'StorageError');return res.status(503).json({error:'temporarily_unavailable'})}
}}
export default makeHandler();
