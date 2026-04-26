function jsonResponse(status, payload) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

function methodNotAllowed() {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: {
			Allow: "POST",
			"Cache-Control": "no-store",
		},
	});
}

function requiredEnv(env, key) {
	const value = env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function sanitizeText(value) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

function toInteger(value, fallbackValue) {
	const parsed = parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return fallbackValue;
	}
	return parsed;
}

function toPrice(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return Math.round(parsed * 100) / 100;
}

function normalizeCartItem(value) {
	if (!value || typeof value !== "object") {
		return null;
	}

	const id = sanitizeText(value.id);
	const name = sanitizeText(value.name);
	if (!id || !name) {
		return null;
	}

	let quantity = toInteger(value.quantity, 1);
	if (quantity < 1) {
		quantity = 1;
	}
	if (quantity > 100) {
		quantity = 100;
	}

	return {
		id,
		name,
		price: toPrice(value.price),
		quantity,
	};
}

function normalizeCartItems(rawItems) {
	if (!Array.isArray(rawItems)) {
		return [];
	}

	return rawItems
		.map((item) => normalizeCartItem(item))
		.filter((item) => !!item)
		.slice(0, 50);
}

function calculateAmountPaise(items) {
	const totalRupees = items.reduce((total, item) => total + item.price * item.quantity, 0);
	return Math.round(totalRupees * 100);
}

function buildReceipt(rawPrefix) {
	const prefix = sanitizeText(rawPrefix || "toidel")
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "")
		.slice(0, 12) || "toidel";
	const timestamp = Date.now().toString(36).slice(-7);
	const randomSuffix = Math.random().toString(36).slice(2, 8);
	return `${prefix}_${timestamp}_${randomSuffix}`.slice(0, 40);
}

function buildNotes(items) {
	const compactItemList = items
		.slice(0, 6)
		.map((item) => `${item.name} x${item.quantity}`)
		.join(" | ")
		.slice(0, 255);

	return {
		source: "toidel-website",
		item_count: String(items.length),
		item_preview: compactItemList,
	};
}

function parseJSONBody(request) {
	return request
		.json()
		.catch(() => null);
}

export async function onRequest(context) {
	try {
		const { request, env } = context;
		if (request.method !== "POST") {
			return methodNotAllowed();
		}

		const payload = await parseJSONBody(request);
		if (!payload || typeof payload !== "object") {
			return jsonResponse(400, { error: "Invalid JSON payload." });
		}

		const items = normalizeCartItems(payload.items);
		if (!items.length) {
			return jsonResponse(400, { error: "Cart is empty." });
		}

		const amount = calculateAmountPaise(items);
		if (!Number.isFinite(amount) || amount <= 0) {
			return jsonResponse(400, { error: "Invalid order amount." });
		}

		const keyId = requiredEnv(env, "RAZORPAY_KEY_ID");
		const keySecret = requiredEnv(env, "RAZORPAY_KEY_SECRET");
		const receipt = buildReceipt(env.RAZORPAY_RECEIPT_PREFIX);

		const razorpayOrderPayload = {
			amount,
			currency: "INR",
			receipt,
			notes: buildNotes(items),
		};

		const response = await fetch("https://api.razorpay.com/v1/orders", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
			},
			body: JSON.stringify(razorpayOrderPayload),
		});

		const responseData = await response.json().catch(() => ({}));
		if (!response.ok || !responseData.id) {
			const message = sanitizeText(responseData.description || responseData.error?.description || "Unable to create Razorpay order.");
			return jsonResponse(502, { error: message });
		}

		return jsonResponse(200, {
			order_id: responseData.id,
			amount: responseData.amount,
			currency: responseData.currency,
			key_id: keyId,
			name: sanitizeText(env.RAZORPAY_BRAND_NAME || "Toidel"),
			description: sanitizeText(env.RAZORPAY_CHECKOUT_DESCRIPTION || "Cart order payment"),
		});
	} catch (error) {
		return jsonResponse(500, {
			error: error?.message || "Unexpected error while creating Razorpay order.",
		});
	}
}
