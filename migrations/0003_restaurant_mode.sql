ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'retail'
  CHECK (product_type IN ('retail', 'menu_item', 'ingredient'));

ALTER TABLE sales ADD COLUMN order_type TEXT NOT NULL DEFAULT 'counter'
  CHECK (order_type IN ('counter', 'dine_in', 'takeaway', 'delivery'));
ALTER TABLE sales ADD COLUMN table_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN order_source TEXT NOT NULL DEFAULT 'pos'
  CHECK (order_source IN ('pos', 'whatsapp'));

CREATE INDEX idx_products_business_type ON products(business_id, product_type, active);
CREATE INDEX idx_sales_business_order ON sales(business_id, order_type, created_at);
