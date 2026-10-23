import {test,expect} from '@playwright/test';
import {mockBackend,ids} from './mock-backend.mjs';

const ownerRoutes=['/','/sales','/purchases','/sale_returns','/quotations','/quick_invoices','/customers','/suppliers','/items','/stock','/batches','/categories','/warehouses','/branches','/accounts','/payments','/expenses','/loyalty','/reports','/ai-insights','/settings','/settings/team','/settings/invoice','/billing','/support','/party-ledger','/proforma-invoice'];
const adminRoutes=['/admin','/admin/shopkeepers','/admin/users','/admin/tickets','/admin/plans','/admin/payments','/admin/customer-invoices','/admin/reminders','/admin/subscriptions','/admin/invoices','/admin/audit','/admin/admins','/admin/shopkeepers/'+ids.business];
for(const [name,routes,admin]of [['shopkeeper',ownerRoutes,false],['platform administrator',adminRoutes,true]]){
 test(`${name} pages render without an uncaught exception`,async({page})=>{
   test.setTimeout(120000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await mockBackend(page,{admin});
   for(const route of routes){
     await page.goto(route);
     await expect(page).toHaveURL(route);
     await expect(page.locator('main')).toBeVisible();
     await expect(page.locator('main h1').first()).toBeVisible();
     expect(errors,`Uncaught exception on ${route}`).toEqual([]);
   }
 });
}
