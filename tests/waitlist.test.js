import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeHandler,validate} from '../api/waitlist.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
function harness(storage){let index=0;const handler=makeHandler(storage);return async(method,body,extra={})=>{let code=200,result;const headers={};const res={setHeader:(k,v)=>headers[k]=v,status:n=>(code=n,res),json:x=>{result=x;return res}};await handler({method,body,headers:{'content-type':'application/json',host:'oralo.fun',origin:'https://oralo.fun','x-forwarded-for':`192.0.2.${++index}`,...extra}},res);return {code,result,headers};};}
test('retired registration returns 410 without reading or writing subscriber data',async()=>{
 const unexpected=async()=>assert.fail('Registration must not access storage');const send=harness({read:unexpected,put:unexpected,del:unexpected});
 for(const body of [undefined,{}, {email:'test@example.com',consent:true}]){
  const result=await send('POST',body);assert.equal(result.code,410);assert.equal(result.result.error,'registration_closed');assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.result.downloadUrl,'https://apps.apple.com/app/oralo-ai-teleprompter/id6835449605');
 }
 assert.equal((await send('GET',{})).code,405);assert.equal((await send('GET',{})).headers.Allow,'DELETE');
});
test('existing records can still be deleted with their original credential only',async()=>{
 const token='a'.repeat(48),email='test@example.com',path=`waitlist/${hash(email)}.json`,map=new Map([[path,{email,withdrawalTokenHash:hash(token)}]]);
 const send=harness({read:async key=>map.get(key),del:async key=>map.delete(key)});
 assert.equal((await send('DELETE',{email,token:'b'.repeat(48)})).code,403);assert.equal(map.size,1);
 assert.equal((await send('DELETE',{email,token})).code,200);assert.equal(map.size,0);
 assert.equal((await send('DELETE',{email,token})).code,200);
});
test('legacy deletion validates email, origin and credentials and does not report storage failure as success',async()=>{
 assert.equal(validate({email:' Alice@Example.com '}).email,'alice@example.com');for(const body of [null,{}, {email:'bad'}, {email:'a@b\n.com'}])assert.equal(validate(body),null);
 const send=harness({read:async()=>{throw Error('unavailable');},del:async()=>assert.fail('Must not delete')});
 assert.equal((await send('DELETE',{email:'test@example.com',token:'a'.repeat(48)},{origin:'https://unrelated.example'})).code,403);
 assert.equal((await send('DELETE',{email:'test@example.com'})).code,403);
 assert.equal((await send('DELETE',{email:'test@example.com',token:'a'.repeat(48),company:'bot'})).code,400);
 const result=await send('DELETE',{email:'test@example.com',token:'a'.repeat(48)});assert.equal(result.code,503);assert.equal(result.result.ok,undefined);
});
