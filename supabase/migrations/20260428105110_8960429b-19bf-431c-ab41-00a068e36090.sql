DO $$
DECLARE
  b_id uuid := '0b494c15-5442-4f0c-a549-becb959ae588';
  owner_id uuid := '4ef8b7bb-38e9-473c-b77b-498e3a24b48f';
  cat_web uuid := 'e59d6b15-70b4-465d-a06f-67f410d14bc8';
  cat_hw uuid := 'fa80c676-e8c8-4eba-bf3d-3131378f11cb';
  cat_it uuid := 'd0aed482-5b41-47d0-824e-1076b4ed081c';
  cat_software uuid; cat_marketing uuid; cat_office uuid;
  it1 uuid; it2 uuid; it3 uuid; it4 uuid; it5 uuid; it6 uuid; it7 uuid; it8 uuid;
  cust1 uuid; cust2 uuid; cust3 uuid; cust4 uuid; cust5 uuid; cust6 uuid;
  sup1 uuid; sup2 uuid; sup3 uuid;
  inv uuid;
BEGIN
  INSERT INTO categories (business_id, name, description, created_by)
  VALUES (b_id, 'Software Licenses', 'SaaS subscriptions & software', owner_id) RETURNING id INTO cat_software;
  INSERT INTO categories (business_id, name, description, created_by)
  VALUES (b_id, 'Digital Marketing', 'SEO, ads, social media', owner_id) RETURNING id INTO cat_marketing;
  INSERT INTO categories (business_id, name, description, created_by)
  VALUES (b_id, 'Office Supplies', 'Stationery & consumables', owner_id) RETURNING id INTO cat_office;

  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Mobile App Development', 'service', 'SVC-MOBAPP', '998314', 'project', 150000, 80000, 0, 0, 0, 18, cat_web, owner_id, 'Native iOS/Android app development') RETURNING id INTO it1;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Logo Design Package', 'service', 'SVC-LOGO', '998391', 'project', 8500, 2000, 0, 0, 0, 18, cat_web, owner_id, 'Brand logo + style guide') RETURNING id INTO it2;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Google Workspace - Business', 'service', 'SUB-GWS', '998313', 'user/yr', 8400, 6500, 0, 0, 0, 18, cat_software, owner_id, 'Annual workspace license per user') RETURNING id INTO it3;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'SEO Monthly Retainer', 'service', 'SVC-SEO', '998365', 'month', 25000, 9000, 0, 0, 0, 18, cat_marketing, owner_id, 'Ongoing SEO + content') RETURNING id INTO it4;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Wireless Mouse - Logitech M235', 'product', 'HW-MOUSE-M235', '84716060', 'pcs', 750, 480, 35, 50, 10, 18, cat_hw, owner_id, 'USB wireless mouse') RETURNING id INTO it5;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Mechanical Keyboard - TVS Gold', 'product', 'HW-KB-TVS', '84716040', 'pcs', 6500, 4200, 12, 20, 5, 18, cat_hw, owner_id, 'TVS gold mechanical keyboard') RETURNING id INTO it6;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, '24" LED Monitor - Acer', 'product', 'HW-MON-ACER24', '85285900', 'pcs', 9800, 7200, 8, 15, 3, 28, cat_hw, owner_id, 'FHD IPS LED monitor') RETURNING id INTO it7;
  INSERT INTO items (business_id, name, type, sku, hsn_code, unit, sale_price, purchase_price, current_stock, opening_stock, low_stock_alert, tax_rate, category_id, created_by, description)
  VALUES (b_id, 'Annual AMC - Basic', 'service', 'SVC-AMC-BAS', '998313', 'year', 12000, 4000, 0, 0, 0, 18, cat_it, owner_id, 'Annual maintenance contract') RETURNING id INTO it8;

  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Aarav Innovations Pvt Ltd', '+919812345670', 'accounts@aaravinno.com', '27AABCA1234F1Z5', '101 Tech Park, Andheri East, Mumbai', 'Maharashtra', '27', 0, owner_id) RETURNING id INTO cust1;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Bluewave Retail LLP', '+919812345671', 'pay@bluewave.in', '29AAACB5678K1Z2', '34 MG Road, Bangalore', 'Karnataka', '29', 0, owner_id) RETURNING id INTO cust2;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Chetan Sharma (Freelance)', '+919812345672', 'chetan.s@gmail.com', NULL, 'C-12 Vasant Kunj, New Delhi', 'Delhi', '07', 0, owner_id) RETURNING id INTO cust3;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Daisy Foods Ltd', '+919812345673', 'finance@daisyfoods.com', '24AABCD9876P1Z9', 'Plot 22, GIDC, Ahmedabad', 'Gujarat', '24', 0, owner_id) RETURNING id INTO cust4;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Everest Edu Trust', '+919812345674', 'admin@everestedu.org', '09AAATE0001L1Z6', '4 Civil Lines, Lucknow', 'Uttar Pradesh', '09', 0, owner_id) RETURNING id INTO cust5;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'customer', 'Falcon Logistics', '+919812345675', 'ap@falconlogistics.in', '33AABCF1212M1Z3', '78 Anna Salai, Chennai', 'Tamil Nadu', '33', 0, owner_id) RETURNING id INTO cust6;

  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'supplier', 'Ingram Micro India', '+911140000001', 'orders@ingrammicro.in', '07AAACI4321A1Z8', 'Nehru Place, New Delhi', 'Delhi', '07', 0, owner_id) RETURNING id INTO sup1;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'supplier', 'Redington Distribution', '+914423456789', 'sales@redington.in', '33AABCR0099Q1Z4', 'Mount Road, Chennai', 'Tamil Nadu', '33', 0, owner_id) RETURNING id INTO sup2;
  INSERT INTO parties (business_id, type, name, phone, email, gstin, billing_address, state, state_code, opening_balance, created_by)
  VALUES (b_id, 'supplier', 'Cloud Resellers Co', '+918012345678', 'billing@cloudresellers.com', '29AAACC8888Z1Z1', 'Whitefield, Bangalore', 'Karnataka', '29', 0, owner_id) RETURNING id INTO sup3;

  -- SALE 1
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount, balance_amount, created_by, notes)
  VALUES (b_id, cust1, 'sale', 'paid', 'INV-2026-101', CURRENT_DATE - 25, CURRENT_DATE - 10, '27', false, true, 158500, 28530, 14265, 14265, 187030, 187030, 0, owner_id, 'Mobile app + logo bundle')
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it1, 'Mobile App Development', '998314', 1, 'project', 150000, 18, 150000, 27000, 177000),
         (inv, it2, 'Logo Design Package', '998391', 1, 'project', 8500, 18, 8500, 1530, 10030);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, amount, method, payment_date, reference, created_by)
  VALUES (b_id, cust1, inv, 'in', 187030, 'bank', CURRENT_DATE - 10, 'NEFT-AAR-9981', owner_id);

  -- SALE 2
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, cust2, 'sale', 'partial', 'INV-2026-102', CURRENT_DATE - 18, CURRENT_DATE + 12, '29', true, true, 50000, 9000, 9000, 59000, 30000, 29000, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it4, 'SEO Monthly Retainer', '998365', 2, 'month', 25000, 18, 50000, 9000, 59000);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, amount, method, payment_date, reference, created_by)
  VALUES (b_id, cust2, inv, 'in', 30000, 'upi', CURRENT_DATE - 15, 'UPI-BLUE-7723', owner_id);

  -- SALE 3
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, cust3, 'sale', 'unpaid', 'INV-2026-103', CURRENT_DATE - 7, CURRENT_DATE + 8, '07', true, true, 8500, 1530, 1530, 10030, 0, 10030, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it2, 'Logo Design Package', '998391', 1, 'project', 8500, 18, 8500, 1530, 10030);

  -- SALE 4 hardware
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, cust4, 'sale', 'paid', 'INV-2026-104', CURRENT_DATE - 12, CURRENT_DATE - 12, '24', true, true, 64900, 13642, 13642, 78542, 78542, 0, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it5, 'Wireless Mouse - Logitech M235', '84716060', 10, 'pcs', 750, 18, 7500, 1350, 8850),
         (inv, it6, 'Mechanical Keyboard - TVS Gold', '84716040', 5, 'pcs', 6500, 18, 32500, 5850, 38350),
         (inv, it7, '24" LED Monitor - Acer', '85285900', 2, 'pcs', 9800, 28, 19600, 5488, 25088),
         (inv, it3, 'Google Workspace - Business', '998313', 1, 'user/yr', 5300, 18, 5300, 954, 6254);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, amount, method, payment_date, reference, created_by)
  VALUES (b_id, cust4, inv, 'in', 78542, 'bank', CURRENT_DATE - 12, 'NEFT-DAISY-2210', owner_id);
  INSERT INTO stock_movements (business_id, item_id, type, quantity, reference_id, notes, created_by) VALUES
    (b_id, it5, 'sale', 10, inv, 'Sale INV-2026-104', owner_id),
    (b_id, it6, 'sale', 5, inv, 'Sale INV-2026-104', owner_id),
    (b_id, it7, 'sale', 2, inv, 'Sale INV-2026-104', owner_id);
  UPDATE items SET current_stock = current_stock - 10 WHERE id=it5;
  UPDATE items SET current_stock = current_stock - 5 WHERE id=it6;
  UPDATE items SET current_stock = current_stock - 2 WHERE id=it7;

  -- SALE 5
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, cust5, 'sale', 'partial', 'INV-2026-105', CURRENT_DATE - 5, CURRENT_DATE + 25, '09', true, true, 54000, 9720, 9720, 63720, 25000, 38720, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it8, 'Annual AMC - Basic', '998313', 1, 'year', 12000, 18, 12000, 2160, 14160),
         (inv, it3, 'Google Workspace - Business', '998313', 5, 'user/yr', 8400, 18, 42000, 7560, 49560);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, amount, method, payment_date, reference, created_by)
  VALUES (b_id, cust5, inv, 'in', 25000, 'cheque', CURRENT_DATE - 3, 'CHQ-EVE-1100', owner_id);

  -- SALE 6
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, cust6, 'sale', 'unpaid', 'INV-2026-106', CURRENT_DATE - 2, CURRENT_DATE + 28, '33', true, true, 25000, 4500, 4500, 29500, 0, 29500, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it4, 'SEO Monthly Retainer', '998365', 1, 'month', 25000, 18, 25000, 4500, 29500);

  -- PURCHASE 1
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, sup1, 'purchase', 'paid', 'PUR-2026-201', CURRENT_DATE - 30, CURRENT_DATE - 30, '07', true, true, 72000, 14400, 14400, 86400, 86400, 0, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it5, 'Wireless Mouse - Logitech M235', '84716060', 50, 'pcs', 480, 18, 24000, 4320, 28320),
         (inv, it6, 'Mechanical Keyboard - TVS Gold', '84716040', 8, 'pcs', 4200, 18, 33600, 6048, 39648),
         (inv, it7, '24" LED Monitor - Acer', '85285900', 2, 'pcs', 7200, 28, 14400, 4032, 18432);
  INSERT INTO payments (business_id, party_id, invoice_id, direction, amount, method, payment_date, reference, created_by)
  VALUES (b_id, sup1, inv, 'out', 86400, 'bank', CURRENT_DATE - 30, 'NEFT-INGRAM', owner_id);
  INSERT INTO stock_movements (business_id, item_id, type, quantity, reference_id, notes, created_by) VALUES
    (b_id, it5, 'purchase', 50, inv, 'Purchase PUR-2026-201', owner_id),
    (b_id, it6, 'purchase', 8, inv, 'Purchase PUR-2026-201', owner_id),
    (b_id, it7, 'purchase', 2, inv, 'Purchase PUR-2026-201', owner_id);
  UPDATE items SET current_stock = current_stock + 50 WHERE id=it5;
  UPDATE items SET current_stock = current_stock + 8 WHERE id=it6;
  UPDATE items SET current_stock = current_stock + 2 WHERE id=it7;

  -- PURCHASE 2
  INSERT INTO invoices (business_id, party_id, type, status, invoice_number, invoice_date, due_date, party_state_code, is_inter_state, is_gst, subtotal, tax_amount, igst_amount, total_amount, paid_amount, balance_amount, created_by)
  VALUES (b_id, sup3, 'purchase', 'unpaid', 'PUR-2026-202', CURRENT_DATE - 6, CURRENT_DATE + 24, '29', true, true, 39000, 7020, 7020, 46020, 0, 46020, owner_id)
  RETURNING id INTO inv;
  INSERT INTO invoice_items (invoice_id, item_id, item_name, hsn_code, quantity, unit, price, tax_rate, taxable_amount, tax_amount, total_amount)
  VALUES (inv, it3, 'Google Workspace - Business', '998313', 6, 'user/yr', 6500, 18, 39000, 7020, 46020);

  INSERT INTO expenses (business_id, category, amount, method, expense_date, description, reference, created_by) VALUES
    (b_id, 'Rent', 35000, 'bank', CURRENT_DATE - 28, 'Office rent - April', 'NEFT-LANDLORD', owner_id),
    (b_id, 'Salaries', 220000, 'bank', CURRENT_DATE - 27, 'Staff salaries - April', 'PAYROLL-APR', owner_id),
    (b_id, 'Electricity', 8400, 'upi', CURRENT_DATE - 20, 'Office electricity bill', 'BSES-APR', owner_id),
    (b_id, 'Internet', 3200, 'upi', CURRENT_DATE - 19, 'Fiber broadband', 'JIO-APR', owner_id),
    (b_id, 'Digital Marketing', 18000, 'card', CURRENT_DATE - 14, 'Google Ads campaign', 'GADS-3398', owner_id),
    (b_id, 'Travel', 6450, 'card', CURRENT_DATE - 9, 'Client visit - Mumbai', 'UBER+FLIGHT', owner_id),
    (b_id, 'Office Supplies', 2780, 'cash', CURRENT_DATE - 5, 'Stationery & printer ink', NULL, owner_id),
    (b_id, 'Software', 4999, 'card', CURRENT_DATE - 3, 'Figma team subscription', 'FIG-APR', owner_id),
    (b_id, 'Food & Refreshments', 1850, 'cash', CURRENT_DATE - 2, 'Team lunch', NULL, owner_id);
END $$;