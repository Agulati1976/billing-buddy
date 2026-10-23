// Opt-in integration rehearsal against the local restore of the hosted backup.
// These fixed loopback endpoints deliberately prevent production writes.
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHmac} from 'node:crypto';
import fs from 'node:fs';
import {Client} from 'pg';
import {chromium} from '@playwright/test';
import {preview} from 'vite';

const auth='http://127.0.0.1:15442',rest='http://127.0.0.1:15443';
const secret='local-rehearsal-only-jwt-secret-at-least-32-characters';
const sign=role=>{
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({role,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return `${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;
};
const service=sign('service_role');
const db=new Client({connectionString:'postgresql://supabase_admin:local-restore-test-only@127.0.0.1:15441/postgres'});
const results=[],users=[],businesses=[];
let server,browser;
const password='Rehearsal-'+uuid()+'!';
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log('PASS',name);};
async function request(base,path,token,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data};
}
const rpc=async(name,body,token)=>{
 const r=await request(rest,'/rpc/'+name,token,body);
 assert.equal(r.status,200,`${name}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;
};
const row=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
try{
 await db.connect();
 const health=await fetch(auth+'/health').then(r=>r.json());
 assert.equal(health.version,'v2.197.0');
 const identities=[];
 await check('real GoTrue creates and signs in owner, staff and outsider',async()=>{
  for(const role of ['owner','staff','outsider']){
   const email=`rehearsal-${role}-${uuid()}@example.invalid`;
   const created=await request(auth,'/admin/users',service,{email,password,email_confirm:true,role:'authenticated'});
   assert.equal(created.status,200,JSON.stringify(created.data));users.push(created.data.id);
   const signed=await request(auth,'/token?grant_type=password',service,{email,password});
   assert.equal(signed.status,200,JSON.stringify(signed.data));
   identities.push({id:created.data.id,email,session:signed.data});
  }
 });
 const [owner,staff,outsider]=identities;
 const token=owner.session.access_token,biz=uuid();businesses.push(biz);
 await db.query("INSERT INTO public.businesses(id,owner_id,name,state_code) VALUES($1,$2,'REHEARSAL - isolated business','07')",[biz,owner.id]);
 await db.query("INSERT INTO public.business_subscriptions(business_id,plan_id,status,expires_at) SELECT $1,id,'active',now()+interval '30 days' FROM public.subscription_plans WHERE upper(code)='PRO'",[biz]);
 await db.query("INSERT INTO public.user_roles(user_id,business_id,role) VALUES($1,$2,'staff')",[staff.id,biz]);
 await db.query("INSERT INTO public.staff_module_access(user_id,business_id,modules) VALUES($1,$2,ARRAY['dashboard','sales'])",[staff.id,biz]);
 const item=uuid(),batch=uuid(),session=uuid(),invoice=uuid(),line=uuid(),operation=uuid();
 await check('real PostgREST RPC creates an item and opening batch exactly once',async()=>{
  const body={p_operation_id:uuid(),p_item:{id:item,business_id:biz,name:'Rehearsal Batch Product',type:'product',is_batch_tracked:true,opening_stock:0,sale_price:100},p_batch:{id:batch,batch_number:'REHEARSAL-BATCH',quantity:5,purchase_price:40,sale_price:100}};
  await rpc('save_item',body,token);await rpc('save_item',body,token);
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[item])).current_stock),5);
 });
 await check('real RLS/RPC denies outsiders, staff purchases and raw financial writes',async()=>{
  const read=await request(rest,`/items?business_id=eq.${biz}`,outsider.session.access_token);assert.equal(read.status,200);assert.deepEqual(read.data,[]);
  for(const who of [outsider,staff]){
   const denied=await request(rest,'/rpc/save_invoice',who.session.access_token,{p_operation_id:uuid(),p_invoice:{id:uuid(),business_id:biz,type:'purchase'},p_lines:[]});assert.equal(denied.status,403);
  }
  const raw=await request(rest,'/invoices',token,{business_id:biz,invoice_number:'UNSAFE',type:'sale'});assert.equal(raw.status,403);
 });
 await check('stale item and batch edits return HTTP 409 without retries',async()=>{
  for(const [name,body]of [['save_item',{p_item:{id:item,business_id:biz,name:'Rehearsal Batch Product'}}],['save_batch',{p_batch:{id:batch,item_id:item,business_id:biz,batch_number:'REHEARSAL-BATCH',quantity:5}}]]){
   const conflict=await request(rest,'/rpc/'+name,token,{p_operation_id:uuid(),...body});assert.equal(conflict.status,409);assert.equal(conflict.data.code,'PT409');
  }
 });
 await rpc('open_pos_session',{p_operation_id:uuid(),p_business_id:biz,p_session_id:session,p_opening_cash:200},token);
 const header={id:invoice,business_id:biz,type:'sale',invoice_number:'REHEARSAL-'+invoice,invoice_date:'2026-10-23',is_gst:false,pos_session_id:session,channel:'pos'};
 const lines=[{id:line,item_id:item,batch_id:batch,item_name:'Rehearsal Batch Product',quantity:2,price:100,tax_rate:0,unit:'pcs'}];
 let saved;
 await check('real HTTP replay commits one sale, payment and stock deduction',async()=>{
  const body={p_operation_id:operation,p_invoice:header,p_lines:lines,p_payments:[{amount:100,method:'cash'}]};
  saved=await rpc('save_invoice',body,token);assert.deepEqual(await rpc('save_invoice',body,token),saved);
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[item])).current_stock),3);
  assert.equal(Number((await row('SELECT count(*) n FROM payments WHERE invoice_id=$1',[invoice])).n),1);
 });
 await check('partial payment settles through the real gateway',async()=>{
  await rpc('record_payment',{p_operation_id:uuid(),p_payment:{business_id:biz,invoice_id:invoice,direction:'in',method:'cash',amount:100,payment_date:'2026-10-23',pos_session_id:session}},token);
  assert.equal(Number((await row('SELECT balance_amount FROM invoices WHERE id=$1',[invoice])).balance_amount),0);
 });
 await check('real invoice edit reverses stock and rejects a stale version',async()=>{
  const version=(await row('SELECT updated_at::text FROM invoices WHERE id=$1',[invoice])).updated_at;
  const body={p_operation_id:uuid(),p_invoice:{...header,notes:'Edited in rehearsal'},p_lines:[{...lines[0],quantity:3}],p_expected_updated_at:version};
  await rpc('save_invoice',body,token);
  const stale=await request(rest,'/rpc/save_invoice',token,{...body,p_operation_id:uuid()});assert.equal(stale.status,409);assert.match(stale.data.message,/changed|reload/i);
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[item])).current_stock),2);
 });
 const returned=uuid();
 await check('linked return and refund reconcile actual stock and cash',async()=>{
  await rpc('save_invoice',{p_operation_id:uuid(),p_invoice:{...header,id:returned,type:'sale_return',source_invoice_id:invoice,invoice_number:'REHEARSAL-RETURN-'+returned},p_lines:[{...lines[0],id:uuid(),source_line_id:line,quantity:2}]},token);
  const excessive=await request(rest,'/rpc/record_payment',token,{p_operation_id:uuid(),p_payment:{business_id:biz,invoice_id:returned,direction:'out',method:'cash',amount:101,payment_date:'2026-10-23',pos_session_id:session}});assert.equal(excessive.status,400);
  await rpc('record_payment',{p_operation_id:uuid(),p_payment:{business_id:biz,invoice_id:returned,direction:'out',method:'cash',amount:100,payment_date:'2026-10-23',pos_session_id:session}},token);
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[item])).current_stock),4);
  const close=await rpc('close_pos_session',{p_operation_id:uuid(),p_session_id:session,p_closing_cash:300},token);assert.equal(Number(close.expected_cash),300);
 });
 await check('delete and restore replay preserve both stock and payment history',async()=>{
  for(const action of ['delete','restore']){
   const body={p_operation_id:uuid(),p_invoice_id:returned,p_action:action};
   const first=await rpc('change_invoice_state',body,token);assert.deepEqual(await rpc('change_invoice_state',body,token),first);
   assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[item])).current_stock),action==='delete'?2:4);
  }
 });
 const last=uuid();
 await rpc('save_item',{p_operation_id:uuid(),p_item:{id:last,business_id:biz,name:'Last unit',opening_stock:1,type:'product'}},token);
 await check('concurrent real HTTP checkouts cannot oversell the last unit',async()=>{
  const attempts=await Promise.all([1,2].map(()=>request(rest,'/rpc/save_invoice',token,{p_operation_id:uuid(),p_invoice:{...header,id:uuid(),invoice_number:'LAST-'+uuid(),pos_session_id:null,channel:null},p_lines:[{id:uuid(),item_id:last,item_name:'Last unit',quantity:1,price:100,tax_rate:0,unit:'pcs'}]})));
  assert.deepEqual(attempts.map(a=>a.status).sort(),[200,400]);
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[last])).current_stock),0);
 });
 await check('suspended business loses real REST and RPC access',async()=>{
  await db.query("UPDATE businesses SET status='suspended' WHERE id=$1",[biz]);
  try{
   const read=await request(rest,`/items?business_id=eq.${biz}`,token);assert.equal(read.status,200);assert.deepEqual(read.data,[]);
   const denied=await request(rest,'/rpc/open_pos_session',token,{p_operation_id:uuid(),p_business_id:biz,p_session_id:uuid(),p_opening_cash:0});assert.equal(denied.status,403);
  }finally{await db.query("UPDATE businesses SET status='active' WHERE id=$1",[biz]);}
 });
 const browserItem=uuid();
 await rpc('save_item',{p_operation_id:uuid(),p_item:{id:browserItem,business_id:biz,name:'Browser Rehearsal Product',opening_stock:2,type:'product',sale_price:100}},token);
 await rpc('open_pos_session',{p_operation_id:uuid(),p_business_id:biz,p_session_id:uuid(),p_opening_cash:0},token);
 server=await preview({preview:{host:'127.0.0.1',port:4173,strictPort:true}});
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
 const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')];}));
 const project=new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(({project,session})=>{localStorage.setItem(`sb-${project}-auth-token`,JSON.stringify(session));window.print=()=>{};},{project,session:owner.session});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.origin!==env.VITE_SUPABASE_URL)return route.abort();
  const target=url.pathname.startsWith('/auth/v1/')?auth+url.pathname.slice('/auth/v1'.length)+url.search:url.pathname.startsWith('/rest/v1/')?rest+url.pathname.slice('/rest/v1'.length)+url.search:null;
  if(!target)return route.abort();
  const response=await route.fetch({url:target});await route.fulfill({response});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await check('production frontend checks out against real GoTrue and PostgREST services',async()=>{
  await page.goto('http://127.0.0.1:4173/pos');
  await page.getByText('Browser Rehearsal Product',{exact:true}).click({timeout:20000});
  await page.getByRole('button',{name:/Pay \(F9\)/}).click();
  await page.getByRole('button',{name:'Complete & Print'}).evaluate(el=>{el.click();el.click();});
  await page.getByRole('button',{name:/Pay \(F9\).*0.00/}).waitFor({timeout:15000});
  assert.equal(Number((await row('SELECT current_stock FROM items WHERE id=$1',[browserItem])).current_stock),1);
  assert.equal(Number((await row('SELECT count(*) n FROM invoice_items WHERE item_id=$1',[browserItem])).n),1);
  assert.deepEqual(errors,[]);
  fs.mkdirSync('tests/.artifacts/staging',{recursive:true});await page.screenshot({path:'tests/.artifacts/staging/real-checkout.png'});
 });
 await check('rehearsal batch, item and movement ledger balances all agree',async()=>{
  const mismatches=await row("SELECT count(*) n FROM items i WHERE business_id=$1 AND (current_stock<>(SELECT coalesce(sum(CASE WHEN type IN ('opening','purchase','adjustment_in') THEN quantity ELSE -quantity END),0) FROM stock_movements WHERE item_id=i.id) OR (is_batch_tracked AND current_stock<>(SELECT coalesce(sum(quantity),0) FROM batches WHERE item_id=i.id)))",[biz]);
  assert.equal(Number(mismatches.n),0);
 });
 await check('real recovery token reaches the password form and changes the Auth password',async()=>{
  const link=await request(auth,'/admin/generate_link',service,{type:'recovery',email:owner.email,redirect_to:'http://127.0.0.1:4173/auth/reset-password'});
  assert.equal(link.status,200,JSON.stringify(link.data));
  const action=new URL(link.data.action_link);assert.equal(action.hostname,'127.0.0.1');
  const verified=await fetch(action,{redirect:'manual'});assert.equal(verified.status,303);
  const destination=new URL(verified.headers.get('location'));assert.equal(destination.origin,'http://127.0.0.1:4173');
  await page.goto(destination.href);
  const changedPassword='Changed-'+uuid()+'!';
  await page.getByLabel('New password',{exact:true}).fill(changedPassword);
  await page.getByLabel('Confirm new password').fill(changedPassword);
  await page.getByRole('button',{name:'Update password'}).click();
  await page.getByText('Password updated',{exact:true}).waitFor({timeout:10000});
  const signed=await request(auth,'/token?grant_type=password',service,{email:owner.email,password:changedPassword});assert.equal(signed.status,200);
 });
} catch(error){results.push({passed:false,error:error.message});console.error(error.message);process.exitCode=1;
} finally{
 await browser?.close();await server?.httpServer.close();
 try{
  if(businesses.length){
   await db.query('BEGIN');await db.query('SET LOCAL session_replication_role=replica');
   await db.query('DELETE FROM public.invoice_items WHERE invoice_id IN(SELECT id FROM public.invoices WHERE business_id=ANY($1::uuid[]))',[businesses]);
   const tables=await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='business_id'");
   for(const {table_name}of tables.rows){assert.match(table_name,/^[a-z_]+$/);await db.query(`DELETE FROM public."${table_name}" WHERE business_id=ANY($1::uuid[])`,[businesses]);}
   await db.query('DELETE FROM public.businesses WHERE id=ANY($1::uuid[])',[businesses]);await db.query('COMMIT');
  }
  for(const id of users){const r=await request(auth,'/admin/users/'+id,service,undefined,'DELETE');assert.equal(r.status,200,'Auth cleanup failed');}
  results.push({name:'isolated rehearsal users and business data removed',passed:true});
 }catch(error){console.error('Cleanup failed:',error.message);results.push({name:'cleanup',passed:false,error:error.message});process.exitCode=1;}
 await db.end();
 fs.mkdirSync('audit/private',{recursive:true});fs.writeFileSync('audit/private/real-api-results.json',JSON.stringify({time:new Date().toISOString(),target:'local restore of hosted backup; real GoTrue/PostgREST; no external providers',results},null,2));
}
