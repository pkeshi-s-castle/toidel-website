import {
	buildWebhookTarget,
	fetchOrderByLocalOrderID,
	hmacSHA256Hex,
	insertWebhookEventIfNew,
	jsonResponse,
	methodNotAllowed,
	parseJSONText,
	requiredD1,
	requiredEnv,
	sanitizeText,
	sha256Hex,
	timingSafeEqual,
	upsertOrderPaymentStatus,
} from "./_lib/payment-store.js";

function resolveTargetStatus(eventType) {
	switch (eventType) {
		case "payment.captured":
		case "order.paid":
			return "paid";
		case "payment.failed":
			return "failed";
		case "payment.refunded":
		case "refund.created":
		case "refund.processed":
			return "refunded";
		default:
			return "";
	}
}

export async function onRequest(context) {
	try {
		const { request, env } = context;
		if (request.method !== "POST") {
			return methodNotAllowed("POST");
		}

		const rawBody = await request.text();
		const signature = sanitizeText(request.headers.get("x-razorpay-signature")).toLowerCase();
		if (!signature) {
			return jsonResponse(400, { error: "Missing webhook signature." });
		}

		const webhookSecret = requiredEnv(env, "RAZORPAY_WEBHOOK_SECRET");
		const expectedSignature = await hmacSHA256Hex(rawBody, webhookSecret);
		if (!timingSafeEqual(expectedSignature, signature)) {
			return jsonResponse(401, { error: "Invalid webhook signature." });
		}

		const webhookPayload = parseJSONText(rawBody);
		if (!webhookPayload || typeof webhookPayload !== "object") {
			return jsonResponse(400, { error: "Invalid webhook payload." });
		}

		const database = requiredD1(env);
		const target = buildWebhookTarget(webhookPayload);
		const eventType = target.eventType;
		if (!eventType) {
			return jsonResponse(400, { error: "Missing webhook event type." });
		}

		const eventHeaderID = sanitizeText(request.headers.get("x-razorpay-event-id"));
		const eventID = eventHeaderID || `hash_${await sha256Hex(rawBody)}`;
		const isNewEvent = await insertWebhookEventIfNew(database, {
			eventID,
			eventType,
			razorpayOrderID: target.razorpayOrderID,
			razorpayPaymentID: target.razorpayPaymentID,
			rawPayload: webhookPayload,
		});

		if (!isNewEvent) {
			return jsonResponse(200, {
				ok: true,
				duplicate: true,
				event_id: eventID,
				event: eventType,
			});
		}

		let orderID = target.razorpayOrderID;
		if (!orderID && target.localOrderID) {
			const order = await fetchOrderByLocalOrderID(database, target.localOrderID);
			orderID = sanitizeText(order?.razorpay_order_id);
		}

		let statusApplied = "";
		const nextStatus = resolveTargetStatus(eventType);
		if (orderID && nextStatus) {
			await upsertOrderPaymentStatus(database, {
				status: nextStatus,
				razorpayOrderID: orderID,
				paymentID: target.razorpayPaymentID,
			});
			statusApplied = nextStatus;
		}

		return jsonResponse(200, {
			ok: true,
			event_id: eventID,
			event: eventType,
			razorpay_order_id: orderID,
			razorpay_payment_id: target.razorpayPaymentID,
			status_applied: statusApplied,
		});
	} catch (error) {
		return jsonResponse(500, {
			error: error?.message || "Unexpected webhook processing error.",
		});
	}
}
