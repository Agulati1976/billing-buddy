import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { database, asUser } from './database-helpers.mjs';

test('billing authorization, transactions, returns and subscriptions', async (t) => {
  const db = await database();
  t.after(() => db.close());
  const owner=uuid(), outsider=uuid(), staff=uuid(), biz=uuid(), foreignBiz=uuid();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4),($5,$6)',[owner,'owner@example.invalid',outsider,'other@example.invalid',staff,'staff@example.invalid']);
  await db.query('INSERT INTO businesses(id,owner_id,name,state_code) VALUES($1,$2,$3,$4),($5,$6,$7,$4)',[biz,owner,'Test shop','07',foreignBiz,outsider,'Other shop']);
  await db.query("INSERT INTO business_subscriptions(business_id,plan_id,status,expires_at) SELECT $1,id,'active',now()+interval '30 days' FROM subscription_plans WHERE code='PRO'",[biz]);
  await db.query("INSERT INTO user_roles(user_id,business_id,role) VALUES($1,$2,'staff')",[staff,biz]);
  await db.query("INSERT INTO staff_module_access(user_id,business_id,modules) VALUES($1,$2,ARRAY['sales'])",[staff,biz]);
  const party=uuid();
  await db.query("INSERT INTO parties(id,business_id,name,type,state_code) VALUES($1,$2,'Customer','customer','07')",[party,biz]);
  const row = async (sql,params=[]) => (await db.query(sql,params)).rows[0];
  const stock = async id => Number((await row('SELECT current_stock FROM items WHERE id=$1',[id])).current_stock);
  const product = async (name,quantity=0,batch=false,type='product',business=biz) => {
    const id=uuid();
    await db.query('INSERT INTO items(id,business_id,name,opening_stock,is_batch_tracked,type) VALUES($1,$2,$3,$4,$5,$6)',[id,business,name,quantity,batch,type]);
    return id;
  };
  const header = (type='sale',extra={}) => ({id:uuid(),business_id:biz,party_id:party,type,invoice_number:uuid(),invoice_date:'2026-10-23',is_gst:false,...extra});
  const line = (item,quantity=1,extra={}) => ({id:uuid(),item_id:item,item_name:'Test product',quantity,price:100,unit:'pcs',tax_rate:0,discount_pct:0,...extra});
  const rpc = async (name,args,user=owner) => {
    const values=Object.values(args);
    try { return (await asUser(db,user,`SELECT ${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) result`,values)).rows[0].result; }
    catch (error) { throw new Error(error.message,{cause:{code:error.code}}); }
  };
  const save = (invoice,lines,payments=[],batches=[],version=null,operation=uuid(),user=owner) => rpc('save_invoice',{operation,invoice:JSON.stringify(invoice),lines:JSON.stringify(lines),payments:JSON.stringify(payments),batches:JSON.stringify(batches),version},user);
  const state = (id,action,operation=uuid()) => rpc('change_invoice_state',{operation,id,action});

  await t.test('POS opening is authorized, idempotent and limited to one active till per cashier',async()=>{
    const session=uuid(),operation=uuid();
    await assert.rejects(rpc('open_pos_session',{operation:uuid(),biz,session:uuid(),cash:-1}),/invalid opening/i);
    const opened=await rpc('open_pos_session',{operation,biz,session,cash:200});
    assert.equal(opened.id,session);
    assert.equal((await rpc('open_pos_session',{operation,biz,session,cash:200})).id,session);
    await assert.rejects(rpc('open_pos_session',{operation:uuid(),biz,session:uuid(),cash:200}),/already open/i);
    await assert.rejects(rpc('open_pos_session',{operation:uuid(),biz,session:uuid(),cash:200},outsider),/access denied/i);
    await rpc('close_pos_session',{operation:uuid(),session,cash:200});
  });
  await t.test('tenant and module boundaries apply to RPCs and raw REST tables',async()=>{
    const item=await product('Boundary product',5);
    await assert.rejects(save(header(),[line(item)],[],[],null,uuid(),outsider),/access denied/i);
    await assert.rejects(save(header('purchase'),[line(item)],[],[],null,uuid(),staff),/access denied/i);
    await assert.rejects(asUser(db,owner,"INSERT INTO invoices(business_id,invoice_number,type) VALUES($1,'RAW','sale')",[biz]),/permission denied/i);
    const foreignItem=await product('Other item',5,false,'product',foreignBiz);
    await assert.rejects(save(header(),[line(foreignItem)]),/does not belong/i);
    await db.query("UPDATE businesses SET status='suspended' WHERE id=$1",[biz]);
    await assert.rejects(save(header(),[line(item)]),/access denied/i);
    await db.query("UPDATE businesses SET status='active' WHERE id=$1",[biz]);
    assert.equal(await stock(item),5);
  });
  await t.test('POS-only staff cannot bypass invoice modules by omitting the channel',async()=>{
    await db.query("UPDATE staff_module_access SET modules=ARRAY['pos'] WHERE user_id=$1 AND business_id=$2",[staff,biz]);
    await db.query('INSERT INTO pos_user_access(user_id,business_id) VALUES($1,$2)',[staff,biz]);
    const item=await product('POS restricted',5);
    await assert.rejects(rpc('credit_batch_quantity',{batch:uuid(),quantity:5,reference:uuid()},staff),/permission denied/i);
    await assert.rejects(save(header('purchase'),[line(item)],[],[],null,uuid(),staff),/access denied/i);
    const session=uuid();await rpc('open_pos_session',{op:uuid(),biz,session,cash:0},staff);
    const sale=header('sale',{pos_session_id:session,channel:'pos'});
    await save(sale,[line(item)],[],[],null,uuid(),staff);
    const returned=await save(header('sale_return',{source_invoice_id:sale.id,pos_session_id:session,channel:'pos'}),[line(item,1,{source_line_id:(await row('SELECT id FROM invoice_items WHERE invoice_id=$1',[sale.id])).id})],[],[],null,uuid(),staff);
    assert.equal(returned.type,'sale_return');
    const held=uuid();await asUser(db,staff,"INSERT INTO pos_held_carts(id,business_id,created_by,cart) VALUES($1,$2,$3,'{}')",[held,biz,staff]);
    assert.equal((await asUser(db,staff,'DELETE FROM pos_held_carts WHERE id=$1 RETURNING id',[held])).rows.length,1);
    await db.query("UPDATE staff_module_access SET modules=ARRAY['sales'] WHERE user_id=$1 AND business_id=$2",[staff,biz]);
    await db.query('DELETE FROM pos_user_access WHERE user_id=$1 AND business_id=$2',[staff,biz]);
  });
  await t.test('business administrators can edit the profile but cannot change access or ownership',async()=>{
    await db.query("UPDATE user_roles SET role='admin' WHERE user_id=$1 AND business_id=$2",[staff,biz]);
    assert.equal((await asUser(db,staff,"UPDATE businesses SET name='Updated shop' WHERE id=$1 RETURNING id",[biz])).rows.length,1);
    await assert.rejects(asUser(db,staff,"UPDATE businesses SET status='suspended' WHERE id=$1",[biz]),/platform administrators/i);
    await assert.rejects(asUser(db,staff,'UPDATE businesses SET owner_id=$1 WHERE id=$2',[outsider,biz]),/platform administrators/i);
    await db.query("UPDATE user_roles SET role='staff' WHERE user_id=$1 AND business_id=$2",[staff,biz]);
  });
  await t.test('stock, header, payments and operation receipt roll back together',async()=>{
    const item=await product('Rollback',5), inv=header(), op=uuid();
    await assert.rejects(save(inv,[line(item,6)],[],[],null,op),/out of stock/i);
    assert.equal(await stock(item),5);
    assert.equal(Number((await row('SELECT count(*) n FROM invoices WHERE id=$1',[inv.id])).n),0);
    assert.equal(Number((await row('SELECT count(*) n FROM business_operations WHERE id=$1',[op])).n),0);
    await assert.rejects(save(inv,[line(item,2)],[{amount:201,method:'cash'}]),/Payment exceeds/i);
    assert.equal(await stock(item),5);
    assert.equal(Number((await row('SELECT count(*) n FROM invoices WHERE id=$1',[inv.id])).n),0);
  });
  await t.test('lost-response replay does not duplicate sale, movement or payment',async()=>{
    const item=await product('Replay',10),inv=header(),lines=[line(item,2)],op=uuid(),payments=[{id:uuid(),amount:200,method:'cash'}];
    const first=await save(inv,lines,payments,[],null,op);
    const replay=await save(inv,lines,payments,[],null,op);
    assert.deepEqual(replay,first);
    assert.equal(await stock(item),8);
    assert.equal(Number((await row('SELECT count(*) n FROM payments WHERE invoice_id=$1',[inv.id])).n),1);
    assert.equal(Number((await row('SELECT count(*) n FROM stock_movements WHERE invoice_id=$1',[inv.id])).n),1);
    await assert.rejects(save(inv,[line(item,3)],[],[],null,op),/different request/i);
  });
  await t.test('edits require current version and preserve immutable reversals',async()=>{
    const item=await product('Edit',10),inv=header(),lines=[line(item,2)];
    const first=await save(inv,lines);
    await assert.rejects(save(inv,[{...lines[0],quantity:3}]),/changed/i);
    const updated=await save(inv,[{...lines[0],quantity:3}],[],[],first.updated_at);
    assert.equal(Number(updated.total_amount),300);
    assert.equal(await stock(item),7);
    assert.equal(Number((await row('SELECT count(*) n FROM stock_movements WHERE invoice_id=$1',[inv.id])).n),3);
    await assert.rejects(save(inv,[{...lines[0],quantity:11}],[],[],updated.updated_at),/out of stock/i);
    assert.equal(await stock(item),7);
    assert.equal(Number((await row('SELECT total_amount FROM invoices WHERE id=$1',[inv.id])).total_amount),300);
    await state(inv.id,'delete'); assert.equal(await stock(item),10);
    await state(inv.id,'restore'); assert.equal(await stock(item),7);
  });
  await t.test('purchase deletion rejects consumed stock without clamping',async()=>{
    const item=await product('Consumed purchase'),purchase=header('purchase');
    await save(purchase,[line(item,5)]);
    await save(header(),[line(item,3)]);
    await assert.rejects(state(purchase.id,'delete'),/out of stock/i);
    assert.equal(await stock(item),2);
    assert.equal((await row('SELECT deleted_at FROM invoices WHERE id=$1',[purchase.id])).deleted_at,null);
  });
  await t.test('batch purchases commit quantities once and adjustment requires selected batch',async()=>{
    const item=await product('Batch',0,true),batch=uuid(),purchase=header('purchase');
    await save(purchase,[line(item,5,{batch_id:batch})],[],[{id:batch,item_id:item,batch_number:'B-1',purchase_price:100,sale_price:120}]);
    assert.equal(await stock(item),5);
    assert.equal(Number((await row('SELECT quantity FROM batches WHERE id=$1',[batch])).quantity),5);
    await assert.rejects(rpc('adjust_stock',{op:uuid(),biz,item,qty:1,type:'adjustment_out'}),/Select a batch/i);
    await rpc('adjust_stock',{op:uuid(),biz,item,qty:1,type:'adjustment_out',batch});
    assert.equal(await stock(item),4);
    assert.equal(Number((await row('SELECT quantity FROM batches WHERE id=$1',[batch])).quantity),4);
    await assert.rejects(db.query('DELETE FROM batches WHERE id=$1',[batch]),/linked to invoices/i);
    const unusedItem=await product('Unused batch item',0,true), unusedBatch=uuid();
    await db.query("INSERT INTO batches(id,business_id,item_id,batch_number,quantity) VALUES($1,$2,$3,'DELETE-ME',3)",[unusedBatch,biz,unusedItem]);
    await db.query('DELETE FROM batches WHERE id=$1',[unusedBatch]);
    assert.equal(await stock(unusedItem),0);
    assert.equal(await stock(item),4);
  });
  await t.test('services and quick invoices do not consume stock',async()=>{
    const service=await product('Consulting',0,false,'service'),item=await product('Quick item',2);
    await save(header(),[line(service,3)]);
    await save(header('non_inventory'),[line(item,5)]);
    assert.equal(await stock(service),0); assert.equal(await stock(item),2);
  });
  await t.test('linked returns preserve net balance when a later payment arrives',async()=>{
    const item=await product('Return',10),inv=header(),lines=[line(item,5)];
    await save(inv,lines,[{amount:200,method:'cash'}]);
    const ret=header('sale_return',{source_invoice_id:inv.id});
    await save(ret,[line(item,2,{source_line_id:lines[0].id})]);
    assert.equal(Number((await row('SELECT balance_amount FROM invoices WHERE id=$1',[inv.id])).balance_amount),100);
    await rpc('record_payment',{op:uuid(),payment:JSON.stringify({business_id:biz,party_id:party,invoice_id:inv.id,direction:'in',method:'cash',amount:100,payment_date:'2026-10-23'})});
    assert.equal(Number((await row('SELECT balance_amount FROM invoices WHERE id=$1',[inv.id])).balance_amount),0);
    await assert.rejects(save(header('sale_return',{source_invoice_id:inv.id}),[line(item,4,{source_line_id:lines[0].id})]),/exceeds.*quantity/i);
    assert.equal(await stock(item),7);
    await assert.rejects(state(inv.id,'delete'),/linked returns/i);
  });
  await t.test('sandbox and duplicate callbacks cannot grant extra live subscription days',async()=>{
    const plan=uuid(),prod=uuid(),sandbox=uuid();
    await db.query("INSERT INTO subscription_plans(id,code,name,price_inr,duration_days,features) SELECT $1,'test-paid','Paid',499,30,features FROM subscription_plans WHERE code='PRO'",[plan]);
    await db.query("INSERT INTO subscription_orders(id,business_id,plan_id,cf_order_id,order_amount,mode) VALUES($1,$2,$3,'test-prod',499,'production'),($4,$2,$3,'test-sandbox',499,'sandbox')",[prod,biz,plan,sandbox]);
    const activate=async (order,status='PAID',amount=499,payment='provider-payment') => (await db.query("SELECT process_subscription_payment($1,$2,$3,$4,'INR','upi','{}') result",[order,payment,status,amount])).rows[0].result;
    const previousExpiry=(await row('SELECT expires_at FROM business_subscriptions WHERE business_id=$1',[biz])).expires_at;
    assert.equal((await activate('test-sandbox')).activated,false);
    assert.deepEqual((await row('SELECT expires_at FROM business_subscriptions WHERE business_id=$1',[biz])).expires_at,previousExpiry);
    await assert.rejects(activate('test-prod','PAID',1),/amount or currency mismatch/i);
    assert.equal((await activate('test-prod')).activated,true);
    const expiry=(await row('SELECT expires_at FROM business_subscriptions WHERE business_id=$1',[biz])).expires_at;
    assert.equal((await activate('test-prod')).already_processed,true);
    await activate('test-prod','FAILED');
    assert.equal((await row('SELECT status FROM subscription_orders WHERE id=$1',[prod])).status,'PAID');
    assert.deepEqual((await row('SELECT expires_at FROM business_subscriptions WHERE business_id=$1',[biz])).expires_at,expiry);
    await assert.rejects(rpc('process_subscription_payment',{order:'test-prod',payment:'provider-payment',status:'PAID',amount:499,currency:'INR',method:'upi',payload:'{}'}),/permission denied/i);
  });
  await t.test('stock fields and hidden invoice types cannot be accessed by restricted staff',async()=>{
    const item=await product('Protected',5);
    await assert.rejects(asUser(db,owner,'UPDATE items SET current_stock=999 WHERE id=$1',[item]),/stock adjustment/i);
    const purchase=header('purchase');await save(purchase,[line(item,1)]);
    const visible=await asUser(db,staff,'SELECT id FROM invoices WHERE id=$1',[purchase.id]);
    assert.equal(visible.rows.length,0);
    await assert.rejects(rpc('record_payment',{op:uuid(),payment:JSON.stringify({business_id:biz,party_id:party,invoice_id:purchase.id,direction:'out',method:'cash',amount:1,payment_date:'2026-10-23'})},staff),/access denied/i);
  });
  await t.test('item and opening batch creation are one idempotent transaction',async()=>{
    const id=uuid(),op=uuid(),item={id,business_id:biz,name:'Atomic item',type:'product',is_batch_tracked:true,opening_stock:0};
    const batch={id:uuid(),batch_number:'OPEN',quantity:3,purchase_price:40};
    await rpc('save_item',{op,item:JSON.stringify(item),batch:JSON.stringify(batch)});
    await rpc('save_item',{op,item:JSON.stringify(item),batch:JSON.stringify(batch)});
    assert.equal(await stock(id),3);
    const invalid={...item,id:uuid(),name:'Invalid batch item'};
    await assert.rejects(rpc('save_item',{op:uuid(),item:JSON.stringify(invalid),batch:JSON.stringify({...batch,id:uuid(),quantity:-1})}),/negative|invalid/i);
    assert.equal(Number((await row('SELECT count(*) n FROM items WHERE id=$1',[invalid.id])).n),0);
  });
  await t.test('purge can be retried safely after its invoice no longer exists',async()=>{
    const item=await product('Purge',3),inv=header();await save(inv,[line(item)]);
    await state(inv.id,'delete');const op=uuid();const result=await state(inv.id,'purge',op);
    assert.deepEqual(await state(inv.id,'purge',op),result);assert.equal(await stock(item),3);
  });
  await t.test('deleting an unused nonempty batch preserves its audit reversal and is replay safe',async()=>{
    const item=await product('Disposable batch',0,true),batch=uuid(),op=uuid();
    await db.query("INSERT INTO batches(id,business_id,item_id,batch_number,quantity) VALUES($1,$2,$3,'DELETE-TEST',5)",[batch,biz,item]);
    assert.equal(await stock(item),5);
    const deleted=await rpc('delete_batch',{op,biz,batch});
    assert.deepEqual(await rpc('delete_batch',{op,biz,batch}),deleted);
    assert.equal(await stock(item),0);
    const movements=(await db.query('SELECT batch_id,notes,type,quantity FROM stock_movements WHERE item_id=$1',[item])).rows;
    assert.equal(movements.length,2);
    assert.ok(movements.every(movement=>movement.batch_id===null));
    assert.ok(movements.some(movement=>movement.type==='adjustment_out'&&Number(movement.quantity)===5&&movement.notes.includes('DELETE-TEST')));
  });
  await t.test('loyalty credits reverse after return and deletion without duplicate earning',async()=>{
    await db.query('INSERT INTO loyalty_settings(business_id,enabled,amount_per_point,point_value,min_redeem_points) VALUES($1,true,100,1,1)',[biz]);
    const item=await product('Loyalty',10),inv=header(),lines=[line(item,3)];await save(inv,lines);
    const points=async()=>Number((await row('SELECT sum(points_earned-points_redeemed) n FROM loyalty_transactions WHERE invoice_id=$1',[inv.id])).n);
    assert.equal(await points(),3);
    const ret=header('sale_return',{source_invoice_id:inv.id});await save(ret,[line(item,1,{source_line_id:lines[0].id})]);assert.equal(await points(),2);
    await state(ret.id,'delete');assert.equal(await points(),3);
    await state(inv.id,'delete');assert.equal(await points(),0);
  });
  await t.test('POS close counts only its till cash and deducts its refunds',async()=>{
    await db.query('INSERT INTO business_features(business_id,pos_enabled) VALUES($1,true) ON CONFLICT(business_id) DO UPDATE SET pos_enabled=true',[biz]);
    const session=uuid(),otherSession=uuid();
    await db.query('INSERT INTO pos_sessions(id,business_id,opened_by,opening_cash) VALUES($1,$2,$3,50),($4,$2,$3,0)',[session,biz,owner,otherSession]);
    const item=await product('Till',20),inv=header('sale',{pos_session_id:session,channel:'pos'}),lines=[line(item,5)];
    await save(inv,lines,[{amount:500,method:'cash'}]);
    await save(header('sale',{pos_session_id:otherSession,channel:'pos'}),[line(item,3)],[{amount:300,method:'cash'}]);
    await save(header(),[line(item,6)],[{amount:600,method:'cash'}]);
    await save(header('sale_return',{source_invoice_id:inv.id,pos_session_id:session,channel:'pos'}),[line(item,1,{source_line_id:lines[0].id})],[{amount:100,method:'cash'}]);
    const result=await rpc('close_pos_session',{op:uuid(),session,cash:450});
    assert.equal(Number(result.expected_cash),450);assert.ok(result.closed_at);
    await assert.rejects(save(header('sale',{pos_session_id:session,channel:'pos'}),[line(item)]),/Open your POS day/i);
  });
  await t.test('sale cost is a snapshot and return cost comes from the original line',async()=>{
    const item=await product('Cost',5);await db.query('UPDATE items SET purchase_price=40 WHERE id=$1',[item]);
    const inv=header(),lines=[line(item,2)];await save(inv,lines);
    await db.query('UPDATE items SET purchase_price=90 WHERE id=$1',[item]);
    const ret=header('sale_return',{source_invoice_id:inv.id}),returnLine=line(item,1,{source_line_id:lines[0].id});await save(ret,[returnLine]);
    assert.equal(Number((await row('SELECT unit_cost FROM invoice_items WHERE id=$1',[lines[0].id])).unit_cost),40);
    assert.equal(Number((await row('SELECT unit_cost FROM invoice_items WHERE id=$1',[returnLine.id])).unit_cost),40);
  });
  await t.test('plan quotas are enforced by the database on direct item writes',async()=>{
    const previous=(await row('SELECT plan_id FROM business_subscriptions WHERE business_id=$1',[biz])).plan_id;
    const plan=uuid(),count=Number((await row('SELECT count(*) n FROM items WHERE business_id=$1',[biz])).n);
    await db.query("INSERT INTO subscription_plans(id,code,name,price_inr,features,limits) VALUES($1,'limited','Limited',99,'{}',$2)",[plan,JSON.stringify({max_items:count+1})]);
    await db.query('UPDATE business_subscriptions SET plan_id=$1 WHERE business_id=$2',[plan,biz]);
    await product('Last allowed item');await assert.rejects(product('Over quota'),/Plan limit reached/i);
    await db.query('UPDATE business_subscriptions SET plan_id=$1 WHERE business_id=$2',[previous,biz]);
  });
  await t.test('refunds cannot exceed the selected return even when another credit is unrefunded',async()=>{
    const item=await product('Refund cap',10),inv=header(),lines=[line(item,5)];
    await save(inv,lines,[{amount:500,method:'cash'}]);
    await save(header('sale_return',{source_invoice_id:inv.id}),[line(item,2,{source_line_id:lines[0].id})]);
    const ret=header('sale_return',{source_invoice_id:inv.id});
    await assert.rejects(save(ret,[line(item,1,{source_line_id:lines[0].id})],[{amount:300,method:'cash'}]),/exceeds/i);
    await save(ret,[line(item,1,{source_line_id:lines[0].id})]);
    await rpc('record_payment',{op:uuid(),payment:JSON.stringify({business_id:biz,party_id:party,invoice_id:ret.id,direction:'out',method:'cash',amount:100,payment_date:'2026-10-23'})});
    await assert.rejects(rpc('record_payment',{op:uuid(),payment:JSON.stringify({business_id:biz,party_id:party,invoice_id:ret.id,direction:'out',method:'cash',amount:1,payment_date:'2026-10-23'})}),/refundable amount/i);
  });
  await t.test('legacy public plans become enforceable and expiry falls back to Free',async()=>{
    const free=await row("SELECT id,features,limits FROM subscription_plans WHERE code='FREE'");
    const pro=await row("SELECT id,features,limits FROM subscription_plans WHERE code='PRO'");
    assert.equal(free.limits.max_invoices_per_month,50);assert.equal(free.limits.max_users,1);assert.equal(free.features.ai_insights,false);
    assert.equal(pro.limits.max_users,5);assert.equal(pro.features.pos,true);assert.equal(pro.features.batch_tracking,true);
    const previous=await row('SELECT plan_id,expires_at FROM business_subscriptions WHERE business_id=$1',[biz]);
    await db.query("UPDATE business_subscriptions SET expires_at=now()-interval '1 second' WHERE business_id=$1",[biz]);
    assert.equal((await asUser(db,owner,"SELECT app_has_access($1,'ai_insights') allowed",[biz])).rows[0].allowed,false);
    assert.equal((await asUser(db,staff,'SELECT is_business_member($1,$2) allowed',[staff,biz])).rows[0].allowed,false);
    await assert.rejects(product('Free batch',0,true),/not included/i);
    await db.query('UPDATE business_subscriptions SET plan_id=$1,expires_at=$2 WHERE business_id=$3',[previous.plan_id,previous.expires_at,biz]);
    assert.equal((await asUser(db,staff,'SELECT is_business_member($1,$2) allowed',[staff,biz])).rows[0].allowed,true);
  });
  await t.test('business owner roles cannot be removed or reassigned through raw REST',async()=>{
    await assert.rejects(asUser(db,owner,"UPDATE user_roles SET role='staff' WHERE user_id=$1 AND business_id=$2",[owner,biz]),/Transfer ownership/i);
    await assert.rejects(asUser(db,owner,'DELETE FROM user_roles WHERE user_id=$1 AND business_id=$2',[owner,biz]),/Transfer ownership/i);
  });
  await t.test('support sender identity is derived and inactive assigned staff lose access',async()=>{
    const ticket=uuid();
    await db.query("INSERT INTO profiles(user_id,full_name,email) VALUES($1,'Owner','owner@example.invalid') ON CONFLICT(user_id) DO NOTHING",[owner]);
    await db.query("INSERT INTO support_staff(user_id,active,full_name) VALUES($1,true,'Support')",[outsider]);
    await db.query("INSERT INTO support_tickets(id,business_id,created_by,subject,assigned_to) VALUES($1,$2,$3,'Help',$4)",[ticket,biz,owner,outsider]);
    await asUser(db,owner,"INSERT INTO support_ticket_messages(ticket_id,sender_id,sender_role,message) VALUES($1,$2,'admin','Customer message')",[ticket,owner]);
    assert.equal((await row('SELECT sender_role FROM support_ticket_messages WHERE ticket_id=$1',[ticket])).sender_role,'customer');
    await assert.rejects(asUser(db,owner,'UPDATE support_tickets SET assigned_to=NULL WHERE id=$1',[ticket]),/managed by support/i);
    assert.equal((await asUser(db,outsider,'SELECT * FROM ticket_contact($1)',[ticket])).rows[0].full_name,'Owner');
    await db.query('UPDATE support_staff SET active=false WHERE user_id=$1',[outsider]);
    assert.equal((await asUser(db,outsider,'SELECT * FROM support_tickets WHERE id=$1',[ticket])).rows.length,0);
    await assert.rejects(asUser(db,outsider,"INSERT INTO support_ticket_messages(ticket_id,sender_id,sender_role,message) VALUES($1,$2,'staff','No access')",[ticket,outsider]),/Access denied/i);
  });
});
