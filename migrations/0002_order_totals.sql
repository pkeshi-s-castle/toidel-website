PRAGMA foreign_keys = ON;

ALTER TABLE orders ADD COLUMN subtotal_paise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN shipping_paise INTEGER NOT NULL DEFAULT 0;

UPDATE orders
SET subtotal_paise = COALESCE(
	(SELECT SUM(line_total_paise) FROM order_items WHERE order_items.order_id = orders.id),
	amount_paise
)
WHERE subtotal_paise = 0;
