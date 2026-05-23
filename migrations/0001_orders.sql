PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'pending',
	currency TEXT NOT NULL DEFAULT 'INR',
	amount_paise INTEGER NOT NULL,
	item_count INTEGER NOT NULL DEFAULT 0,
	item_preview TEXT,
	customer_name TEXT NOT NULL,
	customer_phone TEXT NOT NULL,
	customer_email TEXT,
	shipping_address_line1 TEXT NOT NULL,
	shipping_address_line2 TEXT,
	shipping_city TEXT NOT NULL,
	shipping_state TEXT NOT NULL,
	shipping_pincode TEXT NOT NULL,
	shipping_country TEXT NOT NULL DEFAULT 'India',
	receipt TEXT,
	razorpay_order_id TEXT UNIQUE,
	razorpay_payment_id TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id ON orders(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	order_id TEXT NOT NULL,
	product_id TEXT NOT NULL,
	product_name TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	unit_price_paise INTEGER NOT NULL,
	line_total_paise INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payment_events (
	event_id TEXT PRIMARY KEY,
	event_type TEXT NOT NULL,
	razorpay_order_id TEXT,
	razorpay_payment_id TEXT,
	payload_json TEXT NOT NULL,
	processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(razorpay_payment_id);
