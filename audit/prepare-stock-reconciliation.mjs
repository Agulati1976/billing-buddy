// Writes a reviewable SQL plan; does not connect to any database.
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const input='audit/private/stock-investigation.json';
const source=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'');
const rows=JSON.parse(source).rows;
const plan=rows.map(({investigation:{item,movements,batches}})=>({
 id:item.id,business_id:item.business_id,current_stock:item.current_stock,
 batch_quantity:item.batch_quantity,ledger_quantity:item.ledger_quantity,
 movement_count:movements.length,batch_count:batches.length,
}));
if(plan.length!==6 || plan.some(p=>!Number.isFinite(Number(p.batch_quantity))||p.batch_quantity<0))throw new Error('Unexpected reconciliation scope');
const run=randomUUID();
const sql=fs.readFileSync('audit/reconcile-stock.sql','utf8').replace('__APPROVED_PLAN_JSON__',JSON.stringify(plan).replaceAll("'","''")).replaceAll('__RUN_ID__',run);
for(const [suffix,finalize]of [['rehearsal','ROLLBACK'],['apply','COMMIT']])fs.writeFileSync(`audit/private/stock-${suffix}.sql`,sql.replace('__FINALIZE__',finalize));
fs.writeFileSync('audit/private/stock-plan.json',JSON.stringify({run_id:run,input_sha256:createHash('sha256').update(source).digest('hex'),plan},null,2));
console.log(JSON.stringify({run_id:run,items:plan.length,item_totals_changed:plan.filter(p=>p.current_stock!==p.batch_quantity).length}));
