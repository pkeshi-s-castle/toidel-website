import {
	fetchOrderByRazorpayOrderID,
	hmacSHA256Hex,
	jsonResponse,
	methodNotAllowed,
	parseJSONText,
	requiredD1,
	requiredEnv,
	sanitizeText,
	timingSafeEqual,
	upsertOrderPaymentStatus,
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

		const orderID = sanitizeText(payload.razorpay_order_id);
		const paymentID = sanitizeText(payload.razorpay_payment_id);
		const signature = sanitizeText(payload.razorpay_signature).toLowerCase();
		if (!orderID || !paymentID || !signature) {
			return jsonResponse(400, { error: "Missing Razorpay verification fields." });
		}

		const keySecret = requiredEnv(env, "RAZORPAY_KEY_SECRET");
		const generatedSignature = await hmacSHA256Hex(`${orderID}|${paymentID}`, keySecret);

		if (!timingSafeEqual(generatedSignature, signature)) {
			return jsonResponse(400, { error: "Invalid Razorpay signature." });
		}

		const database = requiredD1(env);
		await upsertOrderPaymentStatus(database, {
			status: "paid",
			razorpayOrderID: orderID,
			paymentID,
		});

		const orderRecord = await fetchOrderByRazorpayOrderID(database, orderID);

		return jsonResponse(200, {
			ok: true,
			order_id: orderID,
			payment_id: paymentID,
			local_order_id: orderRecord?.id || "",
			status: "verified",
		});
	} catch (error) {
		return jsonResponse(500, {
			error: error?.message || "Unexpected error while verifying Razorpay payment.",
		});
	}
}
