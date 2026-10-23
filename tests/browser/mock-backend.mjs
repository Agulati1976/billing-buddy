import { expect } from '@playwright/test';
export const ids={owner:'11111111-1111-4111-8111-111111111111',business:'22222222-2222-4222-8222-222222222222',other:'33333333-3333-4333-8333-333333333333',product:'44444444-4444-4444-8444-444444444444',service:'55555555-5555-4555-8555-555555555555',party:'66666666-6666-4666-8666-666666666666',source:'77777777-7777-4777-8777-777777777777',line:'88888888-8888-4888-8888-888888888888',session:'99999999-9999-4999-8999-999999999999'};
export const modules=['dashboard','sales','sale_returns','purchases','quick_invoices','quotations','customers','suppliers','party_ledger','items','stock','batches','loyalty','payments','accounts','expenses','reports','pos','branches','warehouses','categories','ai_insights','proforma_invoice'];
const business=(id,name)=>({id,name,owner_id:ids.owner,status:'active',deleted_at:null,state_code:'07',state:'Delhi',pincode:'110001',pincode_rank:1,created_at:'2026-01-01',phone:'9999999999',email:'test@example.invalid',gstin:null,address:'Test address',logo_url:null});
export const source={id:ids.source,business_id:ids.business,type:'sale',invoice_number:'TEST-SALE',invoice_date:'2026-10-23',party_id:ids.party,subtotal:100,total_amount:100,paid_amount:100,balance_amount:0,discount_amount:0,extra_discount:0,is_gst:false,is_inter_state:false,status:'paid',deleted_at:null,updated_at:'2026-10-23T00:00:00Z'};
export async function mockBackend(page,{saveError=false,saveDelay=0,failPrint=false,accessModules=modules,inactive=false,admin=false,batchTracked=false}={}){
 const calls=[];
 const user={id:ids.owner,email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const payload=Buffer.from(JSON.stringify({sub:ids.owner,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
 const token='eyJhbGciOiJIUzI1NiJ9.'+payload+'.test';
 await page.addInitScript(({user,token,biz,failPrint})=>{
   localStorage.setItem('sb-qbxombgwzqqumubpaogo-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
   localStorage.setItem('current_business_id:'+user.id,biz);
   if(failPrint) window.open=()=>{throw new Error('Test printer unavailable');};
 },{user,token,biz:ids.business,failPrint});
 await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return route.continue();
   if(!url.hostname.endsWith('.supabase.co'))return route.abort();
   const path=url.pathname,body=req.postDataJSON();
   calls.push({path,method:req.method(),body,query:url.searchParams});
   const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':'0-0/*'},body:JSON.stringify(data)});
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
   if(path==='/auth/v1/user')return reply(user);
   if(path.startsWith('/auth/'))return reply({access_token:token,refresh_token:'test-refresh',user,expires_in:3600,token_type:'bearer'});
   if(path.includes('/rpc/')){
     const rpc=path.split('/').at(-1);
     if(rpc==='business_entitlements')return reply({modules:accessModules,features:Object.fromEntries([...accessModules,'reports_export','staff_accounts','barcode','custom_invoice_templates'].map(key=>[key,true]))});
     if(rpc==='account_business_limit')return reply(0);
     if(rpc==='app_has_access')return reply(true);
     if(rpc==='save_invoice'){
       if(saveDelay)await new Promise(resolve=>setTimeout(resolve,saveDelay));
       if(saveError)return reply({message:'Payment transaction rejected',code:'23514'},400);
       return reply({...source,...body.p_invoice,invoice_number:'TEST-SAVED',subtotal:100,total_amount:100,paid_amount:100,balance_amount:0});
     }
     return reply([]);
   }
   const table=path.split('/').at(-1),select=url.searchParams.get('select')??'';
   const biz=(url.searchParams.get('business_id')??'').includes(ids.other)?ids.other:ids.business;
   let rows=[];
   if(table==='user_roles')rows=select.includes('businesses')?(inactive?[{businesses:null}]:[{businesses:business(ids.business,'Test Shop')},{businesses:business(ids.other,'Second Shop')}]):[{id:'test-role',user_id:ids.owner,business_id:biz,role:'owner'}];
   if(table==='businesses')rows=[business(biz,biz===ids.business?'Test Shop':'Second Shop')];
   if(table==='items')rows=[{id:ids.product,business_id:biz,name:'Test Product',type:'product',opening_stock:0,current_stock:10,sale_price:100,purchase_price:60,unit:'pcs',tax_rate:0,is_batch_tracked:batchTracked,allow_decimal_qty:false,low_stock_alert:0},{id:ids.service,business_id:biz,name:'Consultation',type:'service',opening_stock:0,current_stock:0,sale_price:100,purchase_price:0,unit:'pcs',tax_rate:0,is_batch_tracked:false,allow_decimal_qty:false}];
   if(table==='parties')rows=[{id:ids.party,business_id:biz,name:'Test Customer',type:'customer',phone:'9999999999',state_code:'07',state:'Delhi',opening_balance:0,gstin:null}];
   if(table==='pos_sessions')rows=[{id:ids.session,business_id:biz,opened_by:ids.owner,opening_cash:200,opened_at:'2026-01-01T00:00:00Z',closed_at:null,closing_cash:null,expected_cash:null}];
   if(table==='invoices')rows=[source];
   if(table==='invoice_items')rows=[{id:ids.line,invoice_id:ids.source,item_id:ids.product,item_name:'Test Product',quantity:1,price:100,taxable_amount:100,total_amount:100,tax_rate:0,tax_amount:0,unit:'pcs',discount_pct:0,discount_amount:0,batch_id:null}];
   if(table==='batches'&&batchTracked)rows=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',business_id:biz,item_id:ids.product,batch_number:'Batch-A',quantity:10}];
   if(table==='profiles')rows=[{user_id:ids.owner,full_name:'Test Owner',email:user.email}];
   if(table==='platform_admins'&&admin)rows=[{id:'test-admin',user_id:ids.owner}];
   if(url.searchParams.has('offset')&&Number(url.searchParams.get('offset'))>0)rows=[];
   if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'*/'+rows.length}});
   return reply(req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]??null):rows);
 });
 return {calls,saveCalls:()=>calls.filter(call=>call.path.endsWith('/rpc/save_invoice')),assertAtomic:()=>expect(calls.filter(call=>call.method!=='GET'&&call.method!=='HEAD'&&/^\/rest\/v1\/(invoices|invoice_items|payments|stock_movements|loyalty_transactions)$/.test(call.path))).toEqual([])};
}
