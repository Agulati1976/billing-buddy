
DO $$
DECLARE
  b_id UUID := '0b494c15-5442-4f0c-a549-becb959ae588';
  u_id UUID := '4ef8b7bb-38e9-473c-b77b-498e3a24b48f';
  cat_web UUID := gen_random_uuid();
  cat_hw UUID := gen_random_uuid();
  cat_svc UUID := gen_random_uuid();
  wh_main UUID := gen_random_uuid();
  item1 UUID := gen_random_uuid();
  item2 UUID := gen_random_uuid();
  item3 UUID := gen_random_uuid();
  item4 UUID := gen_random_uuid();
  item5 UUID := gen_random_uuid();
  item6 UUID := gen_random_uuid();
  cust1 UUID := gen_random_uuid();
  cust2 UUID := gen_random_uuid();
  cust3 UUID := gen_random_uuid();
  sup1 UUID := gen_random_uuid();
  sup2 UUID := gen_random_uuid();
  inv1 UUID := gen_random_uuid();
  inv2 UUID := gen_random_uuid();
  inv3 UUID := gen_random_uuid();
  inv4 UUID := gen_random_uuid();
  pinv1 UUID := gen_random_uuid();
BEGIN
  -- Categories
  INSERT INTO categories (id, business_id, name, description, created_by) VALUES
    (cat_web, b_id, 'Web Services', 'Website design & development', u_id),
    (cat_hw, b_id, 'Hardware', 'Computer hardware & accessories', u_id),
    (cat_svc, b_id, 'IT Services', 'Support, AMC, consulting', u_id);

  -- Warehouse
  INSERT INTO warehouses (id, business_id, name, address, is_default, created_by) VALUES
    (wh_main, b_id, 'Main Office', 'Ludhiana, Punjab', true, u_id);

  -- Items
  INSERT INTO items (id, business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, tax_rate, opening_stock, low_stock_alert, category_id, created_by) VALUES
    (item1, b_id, 'Business Website (5 pages)', 'service', 'WEB-BIZ-5', '998314', 'project', 15000, 0, 18, 0, 0, cat_web, u_id),
    (item2, b_id, 'E-commerce Website', 'service', 'WEB-ECOM', '998314', 'project', 45000, 0, 18, 0, 0, cat_web, u_id),
    (item3, b_id, 'Annual Maintenance (AMC)', 'service', 'AMC-1Y', '998313', 'year', 6000, 0, 18, 0, 0, cat_svc, u_id),
    (item4, b_id, 'Logitech Wireless Mouse', 'product', 'HW-MS-LOG', '8471', 'pcs', 850, 600, 18, 25, 5, cat_hw, u_id),
    (item5, b_id, 'HP Laser Printer M1005', 'product', 'HW-PRN-HP', '8443', 'pcs', 18500, 15500, 18, 6, 2, cat_hw, u_id),
    (item6, b_id, 'USB Cable Type-C 1m', 'product', 'HW-USB-C', '8544', 'pcs', 250, 120, 18, 50, 10, cat_hw, u_id);

  -- Customers
  INSERT INTO parties (id, business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by) VALUES
    (cust1, b_id, 'customer', 'Sharma Garments', '+91 98761 23456', 'accounts@sharmagarments.in', '03ABCDE1234F1Z5', 'Model Town, Ludhiana', 'Punjab', '03', 0, u_id),
    (cust2, b_id, 'customer', 'Modern Electronics', '+91 99880 11223', 'modern.elec@gmail.com', NULL, 'Civil Lines, Delhi', 'Delhi', '07', 0, u_id),
    (cust3, b_id, 'customer', 'Singh Dental Clinic', '+91 98155 67890', 'dr.singh@sdc.in', NULL, 'Sector 17, Chandigarh', 'Chandigarh', '04', 5000, u_id),
    (sup1, b_id, 'supplier', 'TechWorld Distributors', '+91 99991 22334', 'sales@techworld.in', '07AAACT1234A1Z9', 'Nehru Place, Delhi', 'Delhi', '07', 0, u_id),
    (sup2, b_id, 'supplier', 'Compu Source Pvt Ltd', '+91 98123 45678', 'orders@compusource.in', '03AABCC9988B1ZK', 'Industrial Area, Ludhiana', 'Punjab', '03', 0, u_id);

  -- Sale Invoice 1: Sharma Garments — paid (intra-state Punjab)
  INSERT INTO invoices (id, business_id, party_id, type, invoice_number, invoice_date, due_date, is_gst, party_state_code, is_inter_state, subtotal, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount, balance_amount, status, created_by) VALUES
    (inv1, b_id, cust1, 'sale', 'INV-001', CURRENT_DATE - 20, CURRENT_DATE - 5, true, '03', false, 15000, 2700, 1350, 1350, 17700, 17700, 0, 'paid', u_id);
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount) VALUES
    (inv1, item1, 'Business Website (5 pages)', '998314', 1, 'project', 15000, 18, 15000, 2700, 17700);

  -- Sale Invoice 2: Modern Electronics — partial (inter-state Delhi)
  INSERT INTO invoices (id, business_id, party_id, type, invoice_number, invoice_date, due_date, is_gst, party_state_code, is_inter_state, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, status, created_by) VALUES
    (inv2, b_id, cust2, 'sale', 'INV-002', CURRENT_DATE - 10, CURRENT_DATE + 5, true, '07', true, 22200, 3996, 3996, 26196, 10000, 16196, 'partial', u_id);
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount) VALUES
    (inv2, item5, 'HP Laser Printer M1005', '8443', 1, 'pcs', 18500, 18, 18500, 3330, 21830),
    (inv2, item4, 'Logitech Wireless Mouse', '8471', 2, 'pcs', 850, 18, 1700, 306, 2006),
    (inv2, item6, 'USB Cable Type-C 1m', '8544', 8, 'pcs', 250, 18, 2000, 360, 2360);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, method, amount, payment_date, reference, created_by) VALUES
    (b_id, cust2, inv2, 'in', 'upi', 10000, CURRENT_DATE - 8, 'UPI-998877', u_id);

  -- Sale Invoice 3: Singh Dental — overdue (inter-state Chandigarh)
  INSERT INTO invoices (id, business_id, party_id, type, invoice_number, invoice_date, due_date, is_gst, party_state_code, is_inter_state, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, status, created_by) VALUES
    (inv3, b_id, cust3, 'sale', 'INV-003', CURRENT_DATE - 45, CURRENT_DATE - 15, true, '04', true, 6000, 1080, 1080, 7080, 0, 7080, 'unpaid', u_id);
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount) VALUES
    (inv3, item3, 'Annual Maintenance (AMC)', '998313', 1, 'year', 6000, 18, 6000, 1080, 7080);

  -- Sale Invoice 4: Sharma Garments — recent unpaid
  INSERT INTO invoices (id, business_id, party_id, type, invoice_number, invoice_date, due_date, is_gst, party_state_code, is_inter_state, subtotal, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount, balance_amount, status, created_by) VALUES
    (inv4, b_id, cust1, 'sale', 'INV-004', CURRENT_DATE - 2, CURRENT_DATE + 13, true, '03', false, 45000, 8100, 4050, 4050, 53100, 0, 53100, 'unpaid', u_id);
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount) VALUES
    (inv4, item2, 'E-commerce Website', '998314', 1, 'project', 45000, 18, 45000, 8100, 53100);

  -- Purchase Invoice: TechWorld (inter-state Delhi)
  INSERT INTO invoices (id, business_id, party_id, type, invoice_number, invoice_date, is_gst, party_state_code, is_inter_state, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, status, created_by) VALUES
    (pinv1, b_id, sup1, 'purchase', 'PUR-001', CURRENT_DATE - 30, true, '07', true, 35000, 6300, 6300, 41300, 41300, 0, 'paid', u_id);
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount) VALUES
    (pinv1, item5, 'HP Laser Printer M1005', '8443', 2, 'pcs', 15500, 18, 31000, 5580, 36580),
    (pinv1, item4, 'Logitech Wireless Mouse', '8471', 5, 'pcs', 600, 18, 3000, 540, 3540),
    (pinv1, item6, 'USB Cable Type-C 1m', '8544', 8, 'pcs', 120, 18, 960, 173, 1133);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, method, amount, payment_date, reference, created_by) VALUES
    (b_id, sup1, pinv1, 'out', 'bank', 41300, CURRENT_DATE - 28, 'NEFT-TWDIST-2231', u_id);

  -- Expenses
  INSERT INTO expenses (business_id, category, amount, expense_date, method, description, created_by) VALUES
    (b_id, 'Office Rent', 12000, CURRENT_DATE - 25, 'bank', 'Monthly office rent', u_id),
    (b_id, 'Internet', 1499, CURRENT_DATE - 20, 'upi', 'JioFiber broadband', u_id),
    (b_id, 'Travel', 850, CURRENT_DATE - 12, 'cash', 'Client visit – Chandigarh', u_id),
    (b_id, 'Stationery', 620, CURRENT_DATE - 6, 'cash', 'Printer paper & pens', u_id);
END $$;
