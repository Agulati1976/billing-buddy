// Local audit evidence. Executes current source functions with in-memory dependencies.
// No network, credentials, production writes, emails, or payment requests.
// Historical only: these checks target commit 02ed926, before stabilization.
// The maintained regression suite is `npm run check`.
// These assertions confirm the reported faulty behavior, not the desired fixed behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
const results = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (code) => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function sourceNode(file, name, kind = 'variable') {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = (node) => {
    if (kind === 'function' && ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (kind === 'variable' && ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, `Source node ${file}:${name} must exist`);
  return { source, node: found };
}

function closure(file, name, scope = {}, kind = 'variable') {
  const { source, node } = sourceNode(file, name, kind);
  const declaration = kind === 'function' ? node.getText(source).replace(/^export\s+/, '') : `const ${name} = ${node.initializer.getText(source)};`;
  return new Function(...Object.keys(scope), `${compile(declaration)}; return ${name};`)(...Object.values(scope));
}

async function check(id, label, run) {
  const evidence = await run();
  results.push({ id, label, reproduced: true, ...evidence });
  console.log(`REPRODUCED ${id}: ${label}`);
}

const invoiceModule = await import(`data:text/javascript;base64,${Buffer.from(compile(read('src/lib/invoice.ts'))).toString('base64')}`);
const line = { item_id: 'item', item_name: 'Item', hsn_code: null, quantity: 1, unit: 'pcs', price: 118, discount_pct: 0, tax_rate: 18 };

await check('F25', 'GST-inclusive prices report tax as a discount', () => {
  const totals = invoiceModule.computeInvoice([line], false, { pricesIncludeTax: true });
  assert.equal(totals.total_amount, 118);
  assert.equal(totals.discount_amount, 18);
  return { expectedDiscount: 0, actualDiscount: totals.discount_amount };
});

await check('F09', 'Tenant-controlled business name executes script in admin print window', () => {
  let html = '';
  const printWindow = { document: { write: (text) => { html += text; }, close: () => {} }, focus: () => {}, print: () => {} };
  const print = closure('src/pages/admin/AdminCustomerInvoices.tsx', 'printInvoice', {
    bizMap: new Map([['business', { name: '<script>window.__auditMarker = 1</script>', email: 'example@example.invalid' }]]),
    window: { open: () => printWindow }, setTimeout: () => {},
  });
  print({ business_id: 'business', invoice_no: 'AUDIT', issue_date: '2026-10-23', due_date: null,
    line_items: [], subtotal: 0, gst_percent: 0, gst_amount: 0, total: 0, notes: null });
  const dom = new JSDOM(html, { url: 'https://billlook.com/', runScripts: 'dangerously' });
  assert.equal(dom.window.__auditMarker, 1);
  dom.window.close();
  return { expectedScriptExecution: false, actualScriptExecution: true, environment: 'isolated jsdom; harmless marker only' };
});

await check('F20', 'POS return generates zero tender and cannot complete', async () => {
  const totals = invoiceModule.computeInvoice([{ ...line, quantity: -1 }], false);
  const errors = [];
  const complete = closure('src/pages/Pos.tsx', 'completeSale', {
    current: { id: 'business' }, user: { id: 'user' }, totalPaid: totals.total_amount,
    toast: { error: (message) => errors.push(message) },
  });
  await complete();
  assert.deepEqual(errors, ['Enter payment amount']);
  return { expected: 'a return/refund transaction', actual: errors[0], generatedTender: totals.total_amount };
});

await check('F21', 'POS refuses service items because their stock is zero', () => {
  let cart = [];
  const errors = [];
  const add = closure('src/pages/Pos.tsx', 'addToCart', {
    setCart: (update) => { cart = update(cart); },
    toast: { error: (message) => errors.push(message) },
    composeItemName: invoiceModule.composeItemName,
  });
  add({ id: 'service', name: 'Consultation', type: 'service', current_stock: 0,
    sale_price: 500, tax_rate: 18, unit: 'service', is_batch_tracked: false });
  assert.equal(cart.length, 0);
  assert.match(errors[0], /Out of stock/);
  return { expectedCartLines: 1, actualCartLines: cart.length, actualError: errors[0] };
});

await check('F22', 'Supplier detail ignores purchase invoices in payable totals', () => {
  const stats = closure('src/pages/CustomerDetail.tsx', 'stats', {
    useMemo: (fn) => fn(), invoices: [{ type: 'purchase', total_amount: 500, paid_amount: 0, balance_amount: 500 }],
    party: { type: 'supplier', opening_balance: 0 }, todayISO: () => '2026-10-23',
  });
  assert.equal(stats.outstanding, 0);
  return { expectedPayable: 500, actualPayable: stats.outstanding };
});

await check('F27', 'Payment submission accepts a stale invoice belonging to the previous party', async () => {
  let payload;
  const submit = closure('src/pages/Payments.tsx', 'submit', {
    current: { id: 'business' }, user: { id: 'user' }, amount: '100', partyId: 'supplier-B',
    invoiceId: 'previous-customer-A-sale', direction: 'out', method: 'cash', date: '2026-10-23', reference: '', notes: '',
    setSaving: () => {}, omInsert: async (_table, row) => { payload = row; return { queued: false, error: null }; },
    toast: { success: () => {}, error: () => {} }, setOpen: () => {}, setAmount: () => {},
    setReference: () => {}, setNotes: () => {}, setInvoiceId: () => {}, setPartyId: () => {}, load: () => {},
  });
  await submit();
  assert.equal(payload.invoice_id, 'previous-customer-A-sale');
  assert.equal(payload.party_id, 'supplier-B');
  return { expected: 'clear or reject stale invoice selection', actualInvoice: payload.invoice_id, actualParty: payload.party_id };
});

await check('F12', 'Restoring a sale silently clamps insufficient stock to zero', async () => {
  let updated;
  const supabase = { from: (table) => {
    const chain = { select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { id: 'item', current_stock: 5, type: 'product', is_batch_tracked: false } }),
      update: (row) => { updated = row; return chain; },
      then: (resolve) => resolve(table === 'invoice_items'
        ? { data: [{ item_id: 'item', batch_id: null, quantity: 10 }] } : { error: null }),
    };
    return chain;
  }};
  const reverse = closure('src/pages/Invoices.tsx', 'reverseStock', { supabase, type: 'sale' });
  await reverse('invoice', 'reapply');
  assert.equal(updated.current_stock, 0);
  return { available: 5, required: 10, expected: 'reject restoration atomically', actualStoredStock: updated.current_stock };
});

await check('F18', 'Offline drainer runs dependent operations after a parent fails', async () => {
  const calls = [];
  const drain = closure('src/lib/offlineSync.ts', 'drainOutbox', {
    draining: false, MAX_ATTEMPTS: 6,
    listOutbox: async () => [{ id: 'parent-invoice', attempts: 0 }, { id: 'dependent-lines', attempts: 0 }],
    runOne: async (op) => { calls.push(op.id); return op.id === 'parent-invoice'
      ? { ok: false, networkErr: false, error: { message: 'constraint failure' } } : { ok: true }; },
    updateOutbox: async () => {}, deleteOutbox: async () => {}, toast: { success: () => {}, error: () => {} },
  }, 'function');
  await drain({ silent: true });
  assert.deepEqual(calls, ['parent-invoice', 'dependent-lines']);
  return { expected: 'dependent lines wait for their invoice', actualCallOrder: calls };
});

await check('F28', 'Closing one POS till counts other cashiers and unrelated receipts', async () => {
  let updated;
  const filters = [];
  const supabase = { from: (table) => {
    const chain = { select: () => chain,
      eq: (column, value) => { filters.push([table, column, value]); return chain; },
      is: () => chain, gte: () => chain, update: (row) => { updated = row; return chain; },
      then: (resolve) => resolve(table === 'payments'
        ? { data: [{ amount: 50, method: 'cash' }, { amount: 200, method: 'cash' }, { amount: 300, method: 'cash' }] }
        : { error: null }),
    };
    return chain;
  }};
  const close = closure('src/pages/Pos.tsx', 'closeDay', {
    session: { id: 'cashier-A-session', opening_cash: 100, opened_at: '2026-10-23T04:00:00Z' },
    current: { id: 'business' }, closingCash: '150', supabase,
    toast: { success: () => {}, error: () => {} }, setSession: () => {}, setCloseSessionDialog: () => {}, setClosingCash: () => {},
  });
  await close();
  assert.equal(updated.expected_cash, 650);
  assert.ok(!filters.some(([table, column]) => table === 'payments' && column === 'pos_session_id'));
  return { openingCash: 100, ownSales: 50, otherCashierSales: 200, unrelatedReceipts: 300, expectedTill: 150, actualExpectedTill: updated.expected_cash };
});

await check('F35', 'GST report ignores sale returns and uses pre-discount taxable value', () => {
  const gst = closure('src/pages/Reports.tsx', 'gst', {
    useMemo: (fn) => fn(), purchases: [],
    sales: [{ subtotal: 1000, discount_amount: 100, cgst_amount: 81, sgst_amount: 81, igst_amount: 0 }],
    saleReturns: [{ subtotal: 100, cgst_amount: 9, sgst_amount: 9, igst_amount: 0 }],
  });
  assert.equal(gst.out.taxable, 1000);
  assert.equal(gst.liability, 162);
  return { expectedNetTaxable: 800, actualTaxable: gst.out.taxable, expectedNetTax: 144, actualNetTax: gst.liability };
});

await check('F23', 'A paid quick invoice becomes a false customer credit in the ledger', () => {
  const ledger = closure('src/pages/PartyLedger.tsx', 'computeLedger', {}, 'function');
  const entries = ledger({ id: 'party', type: 'customer', opening_balance: 0 },
    [{ id: 'quick', type: 'non_inventory', total_amount: 500, invoice_date: '2026-10-23', invoice_number: 'QINV' }],
    [{ id: 'payment', direction: 'in', amount: 500, payment_date: '2026-10-23', method: 'cash' }]);
  assert.equal(entries.at(-1).running, -500);
  return { expectedBalance: 0, actualBalance: entries.at(-1).running };
});

function edgeHandler(file, createClient, env = {}) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const body = source.statements.filter((statement) => !ts.isImportDeclaration(statement)).map((statement) => statement.getText(source)).join('\n');
  let handler;
  new Function('Deno', 'createClient', 'fetch', 'crypto', compile(body))(
    { serve: (fn) => { handler = fn; }, env: { get: (name) => env[name] } }, createClient,
    async () => new Response(JSON.stringify({ order_status: 'PAID', order_amount: 100 })), globalThis.crypto);
  assert.equal(typeof handler, 'function');
  return handler;
}

function subscriptionStore(mode = 'production') {
  const state = { order: { id: 'order', cf_order_id: 'AUDIT', business_id: 'business', plan_id: 'plan', mode, status: 'CREATED' },
    subscription: { id: 'subscription', expires_at: '2099-01-01T00:00:00.000Z' }, events: 0 };
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'user' } }, error: null }) },
    from: (table) => {
      const chain = { select: () => chain, eq: () => chain,
        insert: () => { if (table === 'cashfree_webhook_events') state.events++; return chain; },
        update: (patch) => {
          if (table === 'subscription_orders') Object.assign(state.order, patch);
          if (table === 'business_subscriptions') Object.assign(state.subscription, patch);
          return chain;
        },
        maybeSingle: async () => ({ data: table === 'subscription_orders' ? { ...state.order }
          : table === 'subscription_plans' ? { duration_days: 30 }
          : table === 'business_subscriptions' ? { ...state.subscription } : { id: `event-${state.events}` } }),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    },
  };
  return { state, client };
}

await check('F05', 'A retried Cashfree success webhook extends the subscription twice', async () => {
  const { state, client } = subscriptionStore();
  const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'AUDIT' }, payment: { cf_payment_id: 'audit-payment' } } });
  const secret = 'local-audit-fixture';
  const timestamp = '1792700000';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + body))).toString('base64');
  const handler = edgeHandler('supabase/functions/cashfree-webhook/index.ts', () => client,
    { CASHFREE_WEBHOOK_SECRET: secret, SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' });
  const request = () => new Request('https://example.invalid/webhook', { method: 'POST', body,
    headers: { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp } });
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request())).status, 200);
  const extendedDays = (Date.parse(state.subscription.expires_at) - Date.parse('2099-01-01T00:00:00.000Z')) / 86400000;
  assert.equal(extendedDays, 60);
  return { expectedGrantedDays: 30, actualGrantedDays: extendedDays, networkRequests: 0, webhookEventsStored: state.events };
});

await check('F04', 'Sandbox payment verification activates the real subscription record', async () => {
  const { state, client } = subscriptionStore('test');
  const handler = edgeHandler('supabase/functions/cashfree-verify-order/index.ts', () => client,
    { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'fixture-only', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
      CASHFREE_TEST_APP_ID: 'TEST-FIXTURE', CASHFREE_TEST_SECRET_KEY: 'fixture-only' });
  const result = await handler(new Request('https://example.invalid/verify', { method: 'POST', body: JSON.stringify({ cf_order_id: 'AUDIT' }),
    headers: { Authorization: 'Bearer local-audit-fixture', 'Content-Type': 'application/json' } }));
  assert.equal(result.status, 200);
  assert.equal(state.subscription.plan_id, 'plan');
  assert.equal(state.subscription.status, 'active');
  return { mode: state.order.mode, expectedLiveSubscriptionMutation: false, actualLiveSubscriptionMutation: true, networkRequests: 0 };
});

fs.writeFileSync(path.join(root, 'audit/reproduction-results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.length} findings reproduced against current source. No production operations executed.`);
