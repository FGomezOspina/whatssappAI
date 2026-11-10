const test=require('node:test'),assert=require('node:assert/strict');
const {authorize,modelInput}=require('../scripts/evaluation/replay-frozen-business');
test('replay refuses to overwrite frozen inputs before any model import',()=>{
 const {outputPath}=require('../scripts/evaluation/replay-frozen-business');
 assert.throws(()=>outputPath(['--output='+require.resolve('./fixtures/distrifinca-business-2026-10-29.json')]),/already exists/);
});
test('replay defaults to local even when a credential exists',()=>assert.equal(authorize([], {OPENAI_API_KEY:'synthetic-not-a-key'}),'local'));
test('paid replay requires explicit opt-ins and case scope before importing the interpreter',()=>{
 for(const args of [['--provider=openai'],['--provider=openai','--allow-paid-openai'],['--provider=openai','--allow-paid-openai','--confirm-user-recharge']])assert.throws(()=>authorize(args,{OPENAI_API_KEY:'synthetic-not-a-key'}),/disabled/);
});
test('reviewer labels and expected catalog identities never leak into model input',()=>{
 const input=modelInput({id:'C99',input:{message:'original query',history:[],contextState:null},expected:{reference:'SECRET GOLD'},provenance:{evidence:'SECRET EVIDENCE'}},[],{});
 assert.equal(input.mensaje,'original query');assert.doesNotMatch(JSON.stringify(input),/SECRET|expected|provenance/);
});
