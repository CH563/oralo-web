import test from 'node:test';
import assert from 'node:assert/strict';
import {countScript, estimateTime, estimateBudget, UNICODE_VERSION} from '../public/tools/speech-math.js';
const time = (script, options = {}) => estimateTime({script, Rc:'200', Re:'140', P:'0', ...options});
const budget = (options = {}) => estimateBudget({language:'en', M:'5', Rc:'200', Re:'140', P:'0', ...options});

test('document counting and half-up rounding fixtures', () => {
  const cases = [
    ['你好世界', {}, 4, 0, 1], ['Hello world', {}, 0, 2, 1], ['你好 Oralo', {}, 2, 1, 1],
    ['中'.repeat(200) + ' ' + Array(140).fill('hello').join(' '), {P:'15'}, 200, 140, 135],
    ['Hello world', {Re:'120',P:'10'}, 0,2,11], ['中', {Rc:'120'}, 1,0,1], ['中', {Rc:'600'}, 1,0,1],
    ['你好，世界！', {},4,0,1], ['你好\r\nworld',{},2,1,1],
    ["don't well-known U.S. AI", {Re:'120'},0,4,2], ['we’re hello‑world',{Re:'120'},0,2,1],
    ["Hello.World hello--world 'hello'", {Re:'120'},0,5,3], ['二〇二六',{},4,0,1], ['漢字',{},2,0,1],
    ['你好Oralo',{},2,1,1], ['NASA AI U.S. A.I',{Re:'120'},0,4,2], ['hello‐world',{Re:'120'},0,1,1],
    ['中'.repeat(20000),{},20000,0,6000], ['中',{P:'3600'},1,0,3600],
  ];
  for (const [script,options,H,E,seconds] of cases) {
    const result=time(script,options);assert.equal(result.errors,undefined);assert.equal(result.H,H);assert.equal(result.E,E);assert.equal(result.seconds,seconds);
    assert.equal(result.minutes*60+result.remainder,seconds);
  }
});

test('blocked content never returns a partial count or duration', () => {
  for (const script of ['2026','3.5','½','Ⅳ','٢','１２','²']) assert.deepEqual(countScript(script),{errors:['numbers']});
  assert.deepEqual(countScript('增长20%'),{errors:['numbers','symbols']});
  for (const script of ['你好😀','你好1️⃣','你好1⃣','你好👩‍💻','🇨🇳','🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}','👨🏽‍🦽‍➡️','©️','#️⃣','*️⃣']) assert.deepEqual(countScript(script),{errors:['symbols']});
  for (const script of ['中文かな','안녕','café','cafe\u0301','Ελληνικά']) assert.deepEqual(countScript(script),{errors:['text']});
  for (const script of ['hello\u200B','hello\u200D','\uFE0F','\u0301','\u2028','\u2029','\u0378','\u{10FFFF}','\u0000','\uD800','\uE000']) assert.deepEqual(countScript(script),{errors:['hidden']});
  for (const script of ['a%b','a‰b','a‱b','a&b','a@b','a#b','a/b','a\\b','a+b','a=b',"<script>alert('x')</script>"]) assert.deepEqual(countScript(script),{errors:['symbols']});
  const invalid=time('增长20% café\u200B');assert.deepEqual(invalid.errors.script,['numbers','symbols','text','hidden']);assert.equal(invalid.seconds,undefined);assert.equal(invalid.H,undefined);
});

test('empty and oversized scripts cannot become successful by adding allowance', () => {
  for (const script of ['', ' \t\n\r\n\u00A0\u3000', '，。！？']) assert.deepEqual(time(script,{P:'10'}).errors.script,['empty']);
  const text='中'.repeat(20001);assert.deepEqual(time(text).errors.script,['tooLong']);assert.equal(text.length,20001);
  // A supplementary Han character is one code point, not two UTF-16 units.
  assert.equal(time('𠮷'.repeat(20000)).H,20000);assert.deepEqual(time('𠮷'.repeat(20001)).errors.script,['tooLong']);
  assert.deepEqual(countScript('e\u0301'.repeat(10001)).errors,['tooLong']);
});

test('classification version is pinned and input is not rewritten', () => {
  assert.equal(UNICODE_VERSION,'16.0.0');
  const script='we’re\r\nhello‑world';const saved=script;assert.equal(countScript(script).E,2);assert.equal(script,saved);
  assert.equal(countScript('（Hello）—world！').E,2);
  assert.equal(countScript('一百 二〇二六').H,6);
});

test('pure-language scripts validate only the pace they actually use', () => {
  assert.equal(time('hello',{Rc:'NaN'}).seconds,1);assert.equal(time('中',{Re:''}).seconds,1);
  assert.deepEqual(time('hello中',{Rc:'NaN',Re:''}).errors,{Rc:['Rc'],Re:['Re']});
  assert.equal(budget({language:'zh',Re:'Infinity'}).budget,1000);assert.equal(budget({Rc:''}).budget,700);
});

test('pace and allowance bounds and strict decimal input', () => {
  for (const value of ['50','600',' 200 ']) assert.equal(time('中',{Rc:value}).errors,undefined);
  for (const value of ['50','400',' 140 ']) assert.equal(time('hello',{Re:value}).errors,undefined);
  for (const value of ['','0','-1','49','601','5.0','1e2','NaN','Infinity','200 cpm','+200']) assert.deepEqual(time('中',{Rc:value}).errors.Rc,['Rc']);
  for (const value of ['49','401']) assert.deepEqual(time('hello',{Re:value}).errors.Re,['Re']);
  for (const value of ['0','3600',' 15 ']) assert.equal(time('中',{P:value}).errors,undefined);
  for (const value of ['','-1','3601','1.5','1e2','NaN','Infinity','10 sec']) assert.deepEqual(time('中',{P:value}).errors.P,['P']);
});

test('document budget fixtures use exact decimal minutes and always round down', () => {
  for (const [options, expected] of [
    [{language:'zh'},1000],[{},700],[{language:'zh',P:'30'},900],[{P:'30'},630],[{M:'0.1'},14],[{M:'180',Re:'400'},72000],
    [{M:'5.0'},700],[{M:' 0.5 '},70],[{M:'1.1',Re:'50'},55],
  ]) {const result=budget(options);assert.equal(result.errors,undefined);assert.equal(result.budget,expected);}
  assert.deepEqual(budget({language:'zh',M:'0.1',Rc:'50',P:'5'}).errors,{M:['zeroBudget']});
  for (const P of ['300','301']) assert.deepEqual(budget({P}).errors,{P:['allowanceTooLarge']});
  for (const M of ['','0','180.1','5.55','.5','5.','5,0','1e2','NaN','Infinity','5 min','-5','+5']) assert.deepEqual(budget({M}).errors.M,['M']);
});

test('rounding agrees with exact rational arithmetic across mixed counts and rates', () => {
  for (const [H,E] of [[1,1],[7,11],[199,139],[200,140]]) for (const Rc of [50,120,200,599,600]) for (const Re of [50,120,140,399,400]) {
    const script='中'.repeat(H)+' '+Array(E).fill('word').join(' ');
    const denominator=BigInt(Rc*Re);const numerator=60n*BigInt(H*Re+E*Rc)+17n*denominator;
    const expected=Number((2n*numerator+denominator)/(2n*denominator));
    assert.equal(time(script,{Rc:String(Rc),Re:String(Re),P:'17'}).seconds,Math.max(1,expected));
  }
});
