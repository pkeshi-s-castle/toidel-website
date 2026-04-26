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

function parseJSONBody(request) {
	return request
		.json()
		.catch(() => null);
}

function timingSafeEqual(left, right) {
	if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

async function hmacSHA256Hex(message, secret) {
	const textEncoder = new TextEncoder();
	const keyData = textEncoder.encode(secret);
	const messageData = textEncoder.encode(message);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyData,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
	const signatureBytes = new Uint8Array(signatureBuffer);

	return Array.from(signatureBytes, (value) => value.toString(16).padStart(2, "0")).join("");
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

		return jsonResponse(200, {
			ok: true,
			order_id: orderID,
			payment_id: paymentID,
			status: "verified",
		});
	} catch (error) {
		return jsonResponse(500, {
			error: error?.message || "Unexpected error while verifying Razorpay payment.",
		});
	}
}
