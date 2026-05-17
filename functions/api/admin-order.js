import {
	isValidAdminToken,
	jsonResponse,
	methodNotAllowed,
	requiredD1,
	sanitizeText,
} from "./_lib/payment-store.js";

export async function onRequest(context) {
	try {
		const { request, env } = context;
		if (request.method !== "GET") {
			return methodNotAllowed("GET");
		}

		if (!isValidAdminToken(request, env)) {
			return jsonResponse(401, { error: "Unauthorized request." });
		}

		const orderID = sanitizeText(new URL(request.url).searchParams.get("id"));
		if (!orderID) {
			return jsonResponse(400, { error: "Order id is required." });
		}

		const database = requiredD1(env);
		const order = await database.prepare(
			`SELECT
				id,
				status,
				currency,
				amount_paise,
				subtotal_paise,
				shipping_paise,
				item_count,
				item_preview,
				customer_name,
				customer_phone,
				customer_email,
				shipping_address_line1,
				shipping_address_line2,
				shipping_city,
				shipping_state,
				shipping_pincode,
				shipping_country,
				receipt,
				razorpay_order_id,
				razorpay_payment_id,
				created_at,
				updated_at,
				paid_at
			FROM orders
			WHERE id = ?
			LIMIT 1`
		).bind(orderID).first();

		if (!order) {
			return jsonResponse(404, { error: "Order not found." });
		}

		const itemsResult = await database.prepare(
			`SELECT
				product_id,
				product_name,
				quantity,
				unit_price_paise,
				line_total_paise
			FROM order_items
			WHERE order_id = ?
			ORDER BY id ASC`
		).bind(orderID).all();

		const razorpayOrderID = sanitizeText(order.razorpay_order_id);
		const razorpayPaymentID = sanitizeText(order.razorpay_payment_id);
		let events = [];
		if (razorpayOrderID || razorpayPaymentID) {
			const eventsResult = await database.prepare(
				`SELECT
					event_id,
					event_type,
					razorpay_order_id,
					razorpay_payment_id,
					processed_at
				FROM payment_events
				WHERE
					(? != '' AND razorpay_order_id = ?)
					OR (? != '' AND razorpay_payment_id = ?)
				ORDER BY datetime(processed_at) DESC
				LIMIT 30`
			).bind(
				razorpayOrderID,
				razorpayOrderID,
				razorpayPaymentID,
				razorpayPaymentID,
			).all();
			events = Array.isArray(eventsResult?.results) ? eventsResult.results : [];
		}

		return jsonResponse(200, {
			ok: true,
			order,
			items: Array.isArray(itemsResult?.results) ? itemsResult.results : [],
			events,
		});
	} catch (error) {
		return jsonResponse(500, {
			error: error?.message || "Unable to fetch order details.",
		});
	}
}
