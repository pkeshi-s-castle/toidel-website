const MAX_NOTE_LENGTH = 255;
export const DEFAULT_SHIPPING_PAISE = 10000;
const ACCESS_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const ACCESS_JWKS_CACHE = new Map();

export function jsonResponse(status, payload) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

export function methodNotAllowed(allowValue) {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: {
			Allow: allowValue,
			"Cache-Control": "no-store",
		},
	});
}

export function requiredEnv(env, key) {
	const value = env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

export function requiredD1(env) {
	const database = env?.DB;
	if (!database || typeof database.prepare !== "function") {
		throw new Error("Missing D1 binding: DB");
	}
	return database;
}

export function sanitizeText(value) {
	return String(value || "").replace(/\s+/g, " ").trim();
}

export function toInteger(value, fallbackValue) {
	const parsed = parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return fallbackValue;
	}
	return parsed;
}

export function toPrice(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return Math.round(parsed * 100) / 100;
}

export function toPaise(value) {
	const normalized = toPrice(value);
	return Math.round(normalized * 100);
}

export function normalizeCartItem(value) {
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
		id: id.slice(0, 160),
		name: name.slice(0, 200),
		price: toPrice(value.price),
		quantity,
	};
}

export function normalizeCartItems(rawItems) {
	if (!Array.isArray(rawItems)) {
		return [];
	}

	return rawItems
		.map((item) => normalizeCartItem(item))
		.filter((item) => !!item)
		.slice(0, 50);
}

export function calculateAmountPaise(items) {
	const totalRupees = items.reduce((total, item) => total + item.price * item.quantity, 0);
	return Math.round(totalRupees * 100);
}

export function resolveShippingPaise(rawValue) {
	if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
		return DEFAULT_SHIPPING_PAISE;
	}

	const parsed = toInteger(rawValue, DEFAULT_SHIPPING_PAISE);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return DEFAULT_SHIPPING_PAISE;
	}

	return parsed;
}

export function calculateOrderAmountPaise(items, shippingPaise) {
	const subtotalPaise = calculateAmountPaise(items);
	const normalizedShippingPaise = resolveShippingPaise(shippingPaise);
	return subtotalPaise + normalizedShippingPaise;
}

function normalizePhone(value) {
	const compact = sanitizeText(value).replace(/[^\d+]/g, "");
	if (!compact) {
		return "";
	}

	const startsWithPlus = compact.startsWith("+");
	const digits = compact.replace(/\D/g, "");
	if (digits.length < 8 || digits.length > 15) {
		return "";
	}

	return startsWithPlus ? `+${digits}` : digits;
}

function normalizeEmail(value) {
	const email = sanitizeText(value).toLowerCase();
	if (!email) {
		return "";
	}

	const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	if (!isValid) {
		return "";
	}

	return email.slice(0, 254);
}

function normalizePincode(value) {
	return sanitizeText(value).toUpperCase().replace(/[^A-Z0-9 -]/g, "").slice(0, 20);
}

export function normalizeCustomer(rawCustomer) {
	const customer = rawCustomer && typeof rawCustomer === "object" ? rawCustomer : {};

	return {
		name: sanitizeText(customer.name).slice(0, 120),
		phone: normalizePhone(customer.phone),
		email: normalizeEmail(customer.email),
	};
}

export function normalizeShipping(rawShipping) {
	const shipping = rawShipping && typeof rawShipping === "object" ? rawShipping : {};

	return {
		addressLine1: sanitizeText(shipping.address_line1 || shipping.addressLine1).slice(0, 240),
		addressLine2: sanitizeText(shipping.address_line2 || shipping.addressLine2).slice(0, 240),
		city: sanitizeText(shipping.city).slice(0, 120),
		state: sanitizeText(shipping.state).slice(0, 120),
		pincode: normalizePincode(shipping.pincode),
		country: sanitizeText(shipping.country).slice(0, 120) || "India",
	};
}

export function validateCheckoutDetails({ customer, shipping }) {
	if (!customer?.name) {
		return "Customer name is required.";
	}
	if (!customer?.phone) {
		return "Customer phone is required.";
	}
	if (!shipping?.addressLine1) {
		return "Shipping address line 1 is required.";
	}
	if (!shipping?.city) {
		return "Shipping city is required.";
	}
	if (!shipping?.state) {
		return "Shipping state is required.";
	}
	if (!shipping?.pincode) {
		return "Shipping pincode is required.";
	}

	return "";
}

export function buildLocalOrderID() {
	const timestamp = Date.now().toString(36);
	const randomSuffix = Math.random().toString(36).slice(2, 10);
	return `toidel_${timestamp}_${randomSuffix}`.slice(0, 40);
}

export function buildReceipt(rawPrefix, localOrderID) {
	const prefix = sanitizeText(rawPrefix || "toidel")
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "")
		.slice(0, 12) || "toidel";
	const compactOrderID = sanitizeText(localOrderID)
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "")
		.slice(-18) || Date.now().toString(36).slice(-8);
	return `${prefix}_${compactOrderID}`.slice(0, 40);
}

export function buildNotes({ items, localOrderID, customer, shipping, shippingPaise }) {
	const compactItemList = items
		.slice(0, 6)
		.map((item) => `${item.name} x${item.quantity}`)
		.join(" | ")
		.slice(0, MAX_NOTE_LENGTH);

	return {
		source: "toidel-website",
		local_order_id: sanitizeText(localOrderID).slice(0, MAX_NOTE_LENGTH),
		item_count: String(items.length).slice(0, MAX_NOTE_LENGTH),
		item_preview: compactItemList,
		customer_phone: sanitizeText(customer?.phone).slice(0, MAX_NOTE_LENGTH),
		shipping_pincode: sanitizeText(shipping?.pincode).slice(0, MAX_NOTE_LENGTH),
		shipping_paise: String(resolveShippingPaise(shippingPaise)).slice(0, MAX_NOTE_LENGTH),
	};
}

export async function hmacSHA256Hex(message, secret) {
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

export async function sha256Hex(message) {
	const bytes = new TextEncoder().encode(String(message || ""));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(left, right) {
	if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
		return false;
	}

	let mismatch = 0;
	for (let index = 0; index < left.length; index += 1) {
		mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return mismatch === 0;
}

function extractBearerToken(authorizationHeader) {
	const rawValue = sanitizeText(authorizationHeader);
	if (!rawValue) {
		return "";
	}

	const match = rawValue.match(/^Bearer\s+(.+)$/i);
	return match ? sanitizeText(match[1]) : "";
}

function normalizeAccessDomain(rawValue) {
	const normalized = sanitizeText(rawValue).replace(/\/+$/, "");
	if (!normalized) {
		return "";
	}
	if (/^https?:\/\//i.test(normalized)) {
		return normalized;
	}
	return `https://${normalized}`;
}

function decodeBase64URLToBytes(rawValue) {
	let base64Value = sanitizeText(rawValue).replace(/-/g, "+").replace(/_/g, "/");
	if (!base64Value) {
		throw new Error("Invalid JWT segment.");
	}
	while (base64Value.length % 4 !== 0) {
		base64Value += "=";
	}

	const binaryValue = atob(base64Value);
	const bytes = new Uint8Array(binaryValue.length);
	for (let index = 0; index < binaryValue.length; index += 1) {
		bytes[index] = binaryValue.charCodeAt(index);
	}
	return bytes;
}

function decodeBase64URLJSON(rawValue) {
	const decodedBytes = decodeBase64URLToBytes(rawValue);
	const decodedText = new TextDecoder().decode(decodedBytes);
	return parseJSONText(decodedText);
}

function parseJWTToken(tokenValue) {
	const token = sanitizeText(tokenValue);
	const tokenParts = token.split(".");
	if (tokenParts.length !== 3) {
		throw new Error("Invalid Cloudflare Access token.");
	}

	const header = decodeBase64URLJSON(tokenParts[0]);
	const payload = decodeBase64URLJSON(tokenParts[1]);
	const signature = decodeBase64URLToBytes(tokenParts[2]);
	if (!header || typeof header !== "object" || !payload || typeof payload !== "object" || !signature.length) {
		throw new Error("Invalid Cloudflare Access token format.");
	}

	return {
		token,
		header,
		payload,
		signature,
		signedData: new TextEncoder().encode(`${tokenParts[0]}.${tokenParts[1]}`),
	};
}

function hasAudience(audienceClaim, expectedAudience) {
	if (!expectedAudience) {
		return false;
	}

	if (typeof audienceClaim === "string") {
		return audienceClaim === expectedAudience;
	}
	if (Array.isArray(audienceClaim)) {
		return audienceClaim.some((value) => sanitizeText(value) === expectedAudience);
	}
	return false;
}

function parseCSVValues(rawValue) {
	return sanitizeText(rawValue)
		.split(",")
		.map((value) => sanitizeText(value).toLowerCase())
		.filter((value) => !!value);
}

async function getAccessJWKs(teamDomain) {
	const cacheKey = sanitizeText(teamDomain);
	const currentTime = Date.now();
	const cachedValue = ACCESS_JWKS_CACHE.get(cacheKey);
	if (cachedValue && cachedValue.expiresAt > currentTime) {
		return cachedValue.keysByKid;
	}

	const certsURL = `${teamDomain}/cdn-cgi/access/certs`;
	const response = await fetch(certsURL, {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Unable to fetch Cloudflare Access certs: ${response.status}`);
	}

	const certsPayload = await response.json().catch(() => null);
	const keys = Array.isArray(certsPayload?.keys) ? certsPayload.keys : [];
	const keysByKid = new Map();
	for (const key of keys) {
		const kid = sanitizeText(key?.kid);
		if (!kid) {
			continue;
		}
		keysByKid.set(kid, key);
	}

	if (keysByKid.size === 0) {
		throw new Error("No Cloudflare Access signing keys were returned.");
	}

	const cacheControl = sanitizeText(response.headers.get("cache-control"));
	const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
	const maxAgeMilliseconds = maxAgeMatch ? Math.max(1000, toInteger(maxAgeMatch[1], 0) * 1000) : ACCESS_JWKS_CACHE_TTL_MS;
	const ttlMilliseconds = Math.min(ACCESS_JWKS_CACHE_TTL_MS, maxAgeMilliseconds);
	ACCESS_JWKS_CACHE.set(cacheKey, {
		expiresAt: currentTime + ttlMilliseconds,
		keysByKid,
	});

	return keysByKid;
}

async function verifyCloudflareAccessJWT(jwtToken, env) {
	const teamDomain = normalizeAccessDomain(requiredEnv(env, "CF_ACCESS_TEAM_DOMAIN"));
	const audience = sanitizeText(requiredEnv(env, "CF_ACCESS_AUD"));
	const parsedToken = parseJWTToken(jwtToken);
	const algorithm = sanitizeText(parsedToken.header?.alg).toUpperCase();
	const keyID = sanitizeText(parsedToken.header?.kid);

	if (algorithm !== "RS256" || !keyID) {
		throw new Error("Cloudflare Access token uses an unsupported signing algorithm.");
	}

	const keysByKid = await getAccessJWKs(teamDomain);
	const keyData = keysByKid.get(keyID);
	if (!keyData) {
		throw new Error("Cloudflare Access signing key not found for token.");
	}

	const cryptoKey = await crypto.subtle.importKey(
		"jwk",
		keyData,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["verify"],
	);

	const isSignatureValid = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		parsedToken.signature,
		parsedToken.signedData,
	);
	if (!isSignatureValid) {
		throw new Error("Cloudflare Access token signature validation failed.");
	}

	const payload = parsedToken.payload;
	const tokenIssuer = normalizeAccessDomain(payload?.iss);
	if (!tokenIssuer || tokenIssuer !== teamDomain) {
		throw new Error("Cloudflare Access token issuer does not match.");
	}
	if (!hasAudience(payload?.aud, audience)) {
		throw new Error("Cloudflare Access token audience does not match.");
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const expirySeconds = toInteger(payload?.exp, 0);
	const notBeforeSeconds = toInteger(payload?.nbf, 0);
	if (!expirySeconds || expirySeconds <= nowSeconds) {
		throw new Error("Cloudflare Access token has expired.");
	}
	if (notBeforeSeconds && notBeforeSeconds > nowSeconds + 30) {
		throw new Error("Cloudflare Access token is not valid yet.");
	}

	return payload;
}

function isEmailAllowed(emailValue, env) {
	const normalizedEmail = sanitizeText(emailValue).toLowerCase();
	if (!normalizedEmail) {
		return false;
	}

	const allowedEmails = parseCSVValues(env.ORDER_ADMIN_ALLOWED_EMAILS || env.CF_ACCESS_ALLOWED_EMAILS || "");
	if (!allowedEmails.length) {
		return true;
	}

	return allowedEmails.includes(normalizedEmail);
}

export async function requireCloudflareAccessIdentity(request, env) {
	const jwtAssertion = sanitizeText(request.headers.get("cf-access-jwt-assertion")) || extractBearerToken(request.headers.get("authorization"));
	if (!jwtAssertion) {
		throw new Error("Unauthorized request. Missing Cloudflare Access token.");
	}

	let tokenPayload = null;
	try {
		tokenPayload = await verifyCloudflareAccessJWT(jwtAssertion, env);
	} catch (error) {
		throw new Error(`Unauthorized request. ${error?.message || "Invalid Cloudflare Access token."}`);
	}
	const headerEmail = sanitizeText(request.headers.get("cf-access-authenticated-user-email")).toLowerCase();
	const payloadEmail = sanitizeText(tokenPayload?.email).toLowerCase();
	const identityEmail = headerEmail || payloadEmail;

	if (!isEmailAllowed(identityEmail, env)) {
		throw new Error("Unauthorized request. Email not allowed.");
	}

	return {
		email: identityEmail,
		sub: sanitizeText(tokenPayload?.sub),
		issuer: sanitizeText(tokenPayload?.iss),
	};
}

export function parseJSONText(textValue) {
	try {
		return JSON.parse(textValue);
	} catch (error) {
		return null;
	}
}

export function nowISOString() {
	return new Date().toISOString();
}

function safeJSONStringify(value) {
	try {
		return JSON.stringify(value);
	} catch (error) {
		return "{}";
	}
}

export async function createPendingOrderRecord(db, orderData) {
	const now = nowISOString();
	const orderStatements = [
		db.prepare(
			`INSERT INTO orders (
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
				created_at,
				updated_at
			) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			orderData.localOrderID,
			orderData.currency,
			orderData.amountPaise,
			orderData.subtotalPaise || 0,
			orderData.shippingPaise || 0,
			orderData.items.length,
			orderData.itemPreview,
			orderData.customer.name,
			orderData.customer.phone,
			orderData.customer.email || null,
			orderData.shipping.addressLine1,
			orderData.shipping.addressLine2 || null,
			orderData.shipping.city,
			orderData.shipping.state,
			orderData.shipping.pincode,
			orderData.shipping.country,
			now,
			now,
		),
	];

	for (const item of orderData.items) {
		const lineTotalPaise = toPaise(item.price) * item.quantity;
		orderStatements.push(
			db.prepare(
				`INSERT INTO order_items (
					order_id,
					product_id,
					product_name,
					quantity,
					unit_price_paise,
					line_total_paise,
					created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`
			).bind(
				orderData.localOrderID,
				item.id,
				item.name,
				item.quantity,
				toPaise(item.price),
				lineTotalPaise,
				now,
			)
		);
	}

	await db.batch(orderStatements);
}

export async function markOrderCreateFailed(db, localOrderID) {
	await db.prepare(
		`UPDATE orders
		SET status = 'failed', updated_at = ?
		WHERE id = ?`
	).bind(nowISOString(), localOrderID).run();
}

export async function attachRazorpayOrderToLocalOrder(db, values) {
	await db.prepare(
		`UPDATE orders
		SET razorpay_order_id = ?,
			receipt = ?,
			updated_at = ?
		WHERE id = ?`
	).bind(values.razorpayOrderID, values.receipt, nowISOString(), values.localOrderID).run();
}

export async function fetchOrderByRazorpayOrderID(db, razorpayOrderID) {
	return db.prepare(
		`SELECT *
		FROM orders
		WHERE razorpay_order_id = ?
		LIMIT 1`
	).bind(razorpayOrderID).first();
}

export async function fetchOrderByLocalOrderID(db, localOrderID) {
	return db.prepare(
		`SELECT *
		FROM orders
		WHERE id = ?
		LIMIT 1`
	).bind(localOrderID).first();
}

export async function upsertOrderPaymentStatus(db, payload) {
	const now = nowISOString();
	const normalizedStatus = sanitizeText(payload.status).toLowerCase();
	const paymentID = sanitizeText(payload.paymentID);
	const paidAt = normalizedStatus === "paid" ? now : null;

	await db.prepare(
		`UPDATE orders
		SET status = CASE
			WHEN status = 'paid' AND ? != 'paid' THEN status
			ELSE ?
		END,
			razorpay_payment_id = CASE
				WHEN ? != '' THEN ?
				ELSE razorpay_payment_id
			END,
			paid_at = CASE
				WHEN ? = 'paid' THEN COALESCE(paid_at, ?)
				ELSE paid_at
			END,
			updated_at = ?
		WHERE razorpay_order_id = ?`
	).bind(
		normalizedStatus,
		normalizedStatus,
		paymentID,
		paymentID,
		normalizedStatus,
		paidAt,
		now,
		payload.razorpayOrderID,
	).run();
}

export async function insertWebhookEventIfNew(db, payload) {
	const now = nowISOString();
	const result = await db.prepare(
		`INSERT OR IGNORE INTO payment_events (
			event_id,
			event_type,
			razorpay_order_id,
			razorpay_payment_id,
			payload_json,
			processed_at
		) VALUES (?, ?, ?, ?, ?, ?)`
	).bind(
		payload.eventID,
		payload.eventType,
		payload.razorpayOrderID || null,
		payload.razorpayPaymentID || null,
		safeJSONStringify(payload.rawPayload || {}),
		now,
	).run();

	const changes = result?.meta?.changes || 0;
	return changes > 0;
}

export function buildWebhookTarget(eventPayload) {
	const paymentEntity = eventPayload?.payload?.payment?.entity || null;
	const orderEntity = eventPayload?.payload?.order?.entity || null;
	const notes = paymentEntity?.notes || orderEntity?.notes || {};
	const localOrderID = sanitizeText(notes?.local_order_id);

	return {
		eventType: sanitizeText(eventPayload?.event).toLowerCase(),
		razorpayOrderID: sanitizeText(paymentEntity?.order_id || orderEntity?.id),
		razorpayPaymentID: sanitizeText(paymentEntity?.id),
		localOrderID,
	};
}
