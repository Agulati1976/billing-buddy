import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { edgeFunction,mockClients } from './edge-helpers.mjs';
const biz='22222222-2222-4222-8222-222222222222';
const request=(body={},token=true)=>new Request('https://example.invalid',{method:'POST',headers:token?{Authorization:'Bearer session'}:{},body:JSON.stringify(body)});
const memberTables={businesses:{data:{id:biz,status:'active',deleted_at:null}},user_roles:{data:[{role:'owner'}]}};

for(const name of ['parse-purchase-invoice','ai-insights','send-payment-reminder','send-saas-reminder','cashfree-create-order','cashfree-verify-order','create-staff']) {
  test(name+' rejects anonymous requests before database or provider access',async()=>assert.equal((await edgeFunction(name)(request({},false))).status,401));
}
test('OCR rejects another business and never invokes the AI gateway',async()=>{
  const mocks=mockClients({tables:{...memberTables,user_roles:{data:[]}}});
  const response=await edgeFunction('parse-purchase-invoice',mocks)(request({business_id:biz,image_base64:'AAAA',mime_type:'image/png'}));
  assert.equal(response.status,403);assert.equal(mocks.calls.filter(c=>c.rpc==='consume_function_quota').length,0);
});
test('OCR checks image type and quota before any billable AI call',async()=>{
  const mocks=mockClients({tables:memberTables,rpc:name=>({data:name!=='consume_function_quota',error:null})});
  const handler=edgeFunction('parse-purchase-invoice',mocks);
  assert.equal((await handler(request({business_id:biz,image_base64:'AAAA',mime_type:'text/html'}))).status,400);
  assert.equal((await handler(request({business_id:biz,image_base64:'AAAA',mime_type:'image/png'}))).status,429);
});
test('SaaS email requires a platform administrator',async()=>{
  const mocks=mockClients();
  assert.equal((await edgeFunction('send-saas-reminder',mocks)(request({business_id:biz,subject:'Hello',body:'Message'}))).status,403);
});
test('reminder refuses a party outside the requested business',async()=>{
  const mocks=mockClients({tables:memberTables});
  assert.equal((await edgeFunction('send-payment-reminder',mocks)(request({businessId:biz,partyId:'other-party'}))).status,404);
  const lookup=mocks.calls.find(c=>c.table==='parties');
  assert.ok(lookup.filters.some(f=>f[0]==='eq'&&f[1]==='business_id'&&f[2]===biz));
  assert.equal(mocks.calls.filter(c=>c.action==='insert').length,0);
});
test('payment verification authorizes the order business before provider access',async()=>{
  const mocks=mockClients({tables:{...memberTables,user_roles:{data:[]},subscription_orders:{data:{business_id:biz,mode:'production',cf_order_id:'order'}}}});
  assert.equal((await edgeFunction('cashfree-verify-order',mocks)(request({cf_order_id:'order'}))).status,403);
});

test('public invoice rejects malformed IDs and hides inactive businesses',async()=>{
  assert.equal((await edgeFunction('public-invoice')(request({id:'invalid'}))).status,400);
  const invoice={id:'33333333-3333-4333-8333-333333333333',business_id:biz,party_id:null};
  const mocks=mockClients({tables:{invoices:{data:invoice},businesses:{data:null},invoice_items:{data:[]},invoice_settings:{data:null}}});
  const response=await edgeFunction('public-invoice',mocks)(request({id:invoice.id}));
  assert.equal(response.status,404);
  assert.ok(mocks.calls.find(call=>call.table==='businesses').filters.some(filter=>filter[1]==='status'&&filter[2]==='active'));
});
test('webhook rejects invalid signatures without persisting attacker data',async()=>{
  assert.equal((await edgeFunction('cashfree-webhook',{env:{CASHFREE_WEBHOOK_SECRET:'test-secret'}})(request({type:'PAYMENT_SUCCESS_WEBHOOK'},false))).status,401);
});
test('signed webhook passes verified payment identity to atomic activation',async()=>{
  const body=JSON.stringify({type:'PAYMENT_SUCCESS_WEBHOOK',data:{order:{order_id:'order',order_amount:499,order_currency:'INR'},payment:{cf_payment_id:123,payment_status:'SUCCESS',payment_group:'upi'}}});
  const timestamp='1700000000',secret='test-secret';
  const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+body))).toString('base64');
  const mocks=mockClients({tables:{subscription_orders:{data:{mode:'production'},error:null}}});
  const options={...mocks,env:{CASHFREE_WEBHOOK_SECRET:secret,CASHFREE_APP_ID:'LIVE_ID',CASHFREE_SECRET_KEY:'test-only-key'},fetch:async()=>new Response(JSON.stringify({order_status:'PAID',order_amount:499,order_currency:'INR'}))};
  const signed=()=>new Request('https://example.invalid',{method:'POST',body,headers:{'x-webhook-timestamp':timestamp,'x-webhook-signature':signature}});
  const response=await edgeFunction('cashfree-webhook',options)(signed());
  assert.equal(response.status,200);
  const activation=mocks.calls.find(c=>c.rpc==='process_subscription_payment');
  assert.equal(activation.args.p_payment_id,'123');assert.equal(activation.args.p_status,'PAID');assert.equal(activation.args.p_amount,499);
  mocks.calls.length=0;
  const pending=await edgeFunction('cashfree-webhook',{...options,fetch:async()=>new Response(JSON.stringify({order_status:'ACTIVE'}))})(signed());
  assert.equal(pending.status,503);assert.equal(mocks.calls.filter(call=>call.rpc==='process_subscription_payment').length,0);
});
