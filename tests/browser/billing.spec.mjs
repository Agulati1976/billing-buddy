import { test,expect } from '@playwright/test';
import { mockBackend,ids } from './mock-backend.mjs';

async function checkout(page,name='Test Product'){
 await page.goto('/pos');
 await expect(page.getByText(/Day open ·/)).toBeVisible();
 await page.getByText(name,{exact:true}).click();
 await page.getByRole('button',{name:/Pay \(F9\)/}).click();
 await expect(page.getByRole('button',{name:'Complete & Print'})).toBeVisible();
}

test('zero-stock services complete once on rapid checkout and survive printing failure',async({page})=>{
 const backend=await mockBackend(page,{saveDelay:500,failPrint:true});
 await checkout(page,'Consultation');
 const complete=page.getByRole('button',{name:'Complete & Print'});
 await complete.evaluate(button=>{button.click();button.click();});
 await expect.poll(()=>backend.saveCalls().length).toBe(1);
 await expect(complete).not.toBeVisible();
 await expect(page.getByRole('button',{name:/Pay \(F9\).*0.00/})).toBeVisible();
 const call=backend.saveCalls()[0];
 expect(call.body.p_lines[0].item_id).toBe(ids.service);
 expect(call.body.p_payments[0].amount).toBe(100);
 backend.assertAtomic();
});

test('payment failure retains checkout for correction',async({page})=>{
 const backend=await mockBackend(page,{saveError:true});
 await checkout(page);
 await page.getByRole('button',{name:'Complete & Print'}).click();
 await expect(page.getByText('Payment transaction rejected',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Complete & Print'})).toBeEnabled();
 expect(backend.saveCalls()).toHaveLength(1);
 backend.assertAtomic();
});

test('switching businesses clears the POS cart',async({page})=>{
 await mockBackend(page);
 await page.goto('/pos');
 await page.getByText('Test Product',{exact:true}).click();
 await expect(page.getByRole('button',{name:/Pay \(F9\).*100.00/})).toBeVisible();
 await page.getByRole('button',{name:'Bill Look Test Shop'}).click();
 await page.getByRole('menuitem',{name:'Bill Look Second Shop'}).click();
 await expect(page.getByRole('button',{name:/Pay \(F9\).*0.00/})).toBeVisible();
});

test('POS return carries a positive source-linked line and current till',async({page})=>{
 const backend=await mockBackend(page);
 await page.goto('/pos');
 await page.getByRole('button',{name:'Returns',exact:true}).click();
 await page.getByRole('button',{name:'Load as return'}).click();
 await expect(page).toHaveURL(new RegExp('/sale_returns/new\\?from='+ids.source));
 await expect(page.getByText(/Loaded 1 item/)).toBeVisible();
 await page.getByRole('button',{name:'Save',exact:true}).first().click();
 await expect.poll(()=>backend.saveCalls().length).toBe(1);
 const request=backend.saveCalls()[0].body;
 expect(request.p_invoice.type).toBe('sale_return');
 expect(request.p_invoice.source_invoice_id).toBe(ids.source);
 expect(request.p_invoice.pos_session_id).toBe(ids.session);
 expect(request.p_lines[0].quantity).toBe(1);
 expect(request.p_lines[0].source_line_id).toBe(ids.line);
 backend.assertAtomic();
});

test('mobile customers expose working edit and delete controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await mockBackend(page);
 await page.goto('/customers');
 await page.getByRole('button',{name:'Edit Test Customer',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Delete Test Customer',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
});

test('recovery form validates confirmation before auth update',async({page})=>{
 const backend=await mockBackend(page);
 await page.goto('/auth/reset-password');
 await page.getByLabel('New password',{exact:true}).fill('TestPassword123!');
 await page.getByLabel('Confirm new password').fill('DoesNotMatch123!');
 await page.getByRole('button',{name:'Update password'}).click();
 await expect(page.getByText('Passwords do not match',{exact:true})).toBeVisible();
 expect(backend.calls.filter(call=>call.path==='/auth/v1/user'&&call.method==='PUT')).toHaveLength(0);
 await page.getByLabel('Confirm new password').fill('TestPassword123!');
 await page.getByRole('button',{name:'Update password'}).click();
 await expect.poll(()=>backend.calls.filter(call=>call.path==='/auth/v1/user'&&call.method==='PUT').length).toBe(1);
});

test('disabled memberships show an access screen without creating another business',async({page})=>{
 const backend=await mockBackend(page,{inactive:true});
 await page.goto('/pos');
 await expect(page.getByRole('heading',{name:'Business access unavailable'})).toBeVisible();
 expect(backend.saveCalls()).toHaveLength(0);
});

test('POS-only access can load a linked return without unlocking purchase screens',async({page})=>{
 await mockBackend(page,{accessModules:['dashboard','pos']});
 await page.goto('/pos');
 await page.getByRole('button',{name:'Returns',exact:true}).click();
 await page.getByRole('button',{name:'Load as return'}).click();
 await expect(page.getByText(/Loaded 1 item/)).toBeVisible();
 await expect(page).toHaveURL(/\/sale_returns\/new\?/);
 await page.goto('/purchases');
 await expect(page).toHaveURL('/');
});

test('offline checkout stores one whole operation under its originating account',async({page})=>{
 const backend=await mockBackend(page);
 await checkout(page);
 await page.context().setOffline(true);
 await page.getByRole('button',{name:'Complete & Print'}).click();
 await expect(page.getByRole('button',{name:'Complete & Print'})).not.toBeVisible();
 const entries=await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('billbook-offline');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   return new Promise((resolve,reject)=>{const request=db.transaction('outbox').objectStore('outbox').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};request.onerror=()=>reject(request.error);});
 });
 expect(entries).toHaveLength(1);
 expect(entries[0]).toMatchObject({ownerId:ids.owner,businessId:ids.business,op:'rpc',table:'save_invoice'});
 expect(entries[0].payload.p_lines).toHaveLength(1);
 expect(entries[0].payload.p_payments[0].amount).toBe(100);
 expect(entries[0].payload.p_operation_id).toBeTruthy();
 expect(backend.saveCalls()).toHaveLength(0);
 backend.assertAtomic();
});

test('batch stock adjustment is reachable and records the selected batch',async({page})=>{
 const backend=await mockBackend(page,{batchTracked:true});
 await page.goto('/stock');
 await page.getByRole('button',{name:'Adjust',exact:true}).first().click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('combobox').first().click();
 await page.getByRole('option',{name:/Batch-A/}).click();
 await dialog.getByRole('spinbutton').fill('2');
 await dialog.getByRole('button',{name:'Apply',exact:true}).click();
 await expect.poll(()=>backend.calls.filter(call=>call.path.endsWith('/rpc/adjust_stock')).length).toBe(1);
 const call=backend.calls.find(call=>call.path.endsWith('/rpc/adjust_stock'));
 expect(call.body.p_batch_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 expect(call.body.p_quantity).toBe(2);
 backend.assertAtomic();
});
