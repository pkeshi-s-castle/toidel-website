import {
	attachRazorpayOrderToLocalOrder,
	buildLocalOrderID,
	buildNotes,
	buildReceipt,
	calculateAmountPaise,
	calculateOrderAmountPaise,
	createPendingOrderRecord,
	jsonResponse,
	markOrderCreateFailed,
	methodNotAllowed,
	normalizeCartItems,
	normalizeCustomer,
	normalizeShipping,
	parseJSONText,
	requiredD1,
	requiredEnv,
	resolveShippingPaise,
	sanitizeText,
	validateCheckoutDetails,
} from "./_lib/payment-store.js";

export async function onRequest(context) {
	try {
		const { request, env } = context;
		if (request.method !== "POST") {
			return methodNotAllowed("POST");
		}

		const payload = parseJSONText(await request.text());
		if (!payload || typeof payload !== "object") {
			return jsonResponse(400, { error: "Invalid JSON payload." });
		}

		const items = normalizeCartItems(payload.items);
		if (!items.length) {
			return jsonResponse(400, { error: "Cart is empty." });
		}

		const subtotalPaise = calculateAmountPaise(items);
		const shippingPaise = resolveShippingPaise(env.SHIPPING_CHARGE_PAISE);
		const amount = calculateOrderAmountPaise(items, shippingPaise);
		if (!Number.isFinite(subtotalPaise) || subtotalPaise <= 0) {
			return jsonResponse(400, { error: "Invalid order amount." });
		}

		const customer = normalizeCustomer(payload.customer);
		const shipping = normalizeShipping(payload.shipping);
		const validationError = validateCheckoutDetails({ customer, shipping });
		if (validationError) {
			return jsonResponse(400, { error: validationError });
		}

		const keyId = requiredEnv(env, "RAZORPAY_KEY_ID");
		const keySecret = requiredEnv(env, "RAZORPAY_KEY_SECRET");
		const database = requiredD1(env);

		const localOrderID = buildLocalOrderID();
		const receipt = buildReceipt(env.RAZORPAY_RECEIPT_PREFIX, localOrderID);
		const notes = buildNotes({ items, localOrderID, customer, shipping, shippingPaise });
		const itemPreview = sanitizeText(notes.item_preview);

		await createPendingOrderRecord(database, {
			localOrderID,
			currency: "INR",
			amountPaise: amount,
			subtotalPaise,
			shippingPaise,
			items,
			itemPreview,
			customer,
			shipping,
		});

		const razorpayOrderPayload = {
			amount,
			currency: "INR",
			receipt,
			notes,
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
			await markOrderCreateFailed(database, localOrderID);
			const message = sanitizeText(responseData.description || responseData.error?.description || "Unable to create Razorpay order.");
			return jsonResponse(502, { error: message });
		}

		await attachRazorpayOrderToLocalOrder(database, {
			localOrderID,
			razorpayOrderID: responseData.id,
			receipt,
		});

		return jsonResponse(200, {
			local_order_id: localOrderID,
			order_id: responseData.id,
			amount: responseData.amount,
			subtotal: subtotalPaise,
			shipping: shippingPaise,
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
