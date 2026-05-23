import {
	jsonResponse,
	methodNotAllowed,
	requireCloudflareAccessIdentity,
	requiredD1,
	sanitizeText,
	toInteger,
} from "./_lib/payment-store.js";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const ALLOWED_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);

function normalizeLimit(rawValue) {
	const parsed = toInteger(rawValue, DEFAULT_LIMIT);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return DEFAULT_LIMIT;
	}
	return Math.min(parsed, MAX_LIMIT);
}

function normalizeStatus(rawValue) {
	const normalized = sanitizeText(rawValue).toLowerCase();
	if (!normalized || normalized === "all") {
		return "";
	}
	return ALLOWED_STATUSES.has(normalized) ? normalized : "";
}

function normalizeSearch(rawValue) {
	return sanitizeText(rawValue).slice(0, 120);
}

export async function onRequest(context) {
	try {
		const { request, env } = context;
		if (request.method !== "GET") {
			return methodNotAllowed("GET");
		}

		const identity = await requireCloudflareAccessIdentity(request, env);
		const database = requiredD1(env);
		const requestURL = new URL(request.url);
		const limit = normalizeLimit(requestURL.searchParams.get("limit"));
		const status = normalizeStatus(requestURL.searchParams.get("status"));
		const search = normalizeSearch(requestURL.searchParams.get("q"));

		const whereClauses = [];
		const bindValues = [];

		if (status) {
			whereClauses.push("status = ?");
			bindValues.push(status);
		}

		if (search) {
			const likeValue = `%${search}%`;
			whereClauses.push(
				`(
					id LIKE ?
					OR COALESCE(razorpay_order_id, '') LIKE ?
					OR COALESCE(razorpay_payment_id, '') LIKE ?
					OR customer_name LIKE ?
					OR customer_phone LIKE ?
				)`
			);
			bindValues.push(likeValue, likeValue, likeValue, likeValue, likeValue);
		}

		let listQuery = `SELECT
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
			razorpay_order_id,
			razorpay_payment_id,
			created_at,
			updated_at,
			paid_at
		FROM orders`;

		if (whereClauses.length > 0) {
			listQuery += ` WHERE ${whereClauses.join(" AND ")}`;
		}

		listQuery += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
		bindValues.push(limit);

		const ordersResult = await database.prepare(listQuery).bind(...bindValues).all();
		const orders = Array.isArray(ordersResult?.results) ? ordersResult.results : [];

		const statusResult = await database.prepare(
			`SELECT status, COUNT(*) AS count
			FROM orders
			GROUP BY status`
		).all();

		const summaryResult = await database.prepare(
			`SELECT
				COUNT(*) AS total_orders,
				COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paise ELSE 0 END), 0) AS paid_amount_paise
			FROM orders`
		).first();

		const byStatus = {};
		for (const row of statusResult?.results || []) {
			const rowStatus = sanitizeText(row?.status).toLowerCase();
			if (!rowStatus) {
				continue;
			}
			byStatus[rowStatus] = toInteger(row?.count, 0);
		}

		return jsonResponse(200, {
			ok: true,
			viewer: identity,
			orders,
			filters: {
				status: status || "all",
				search,
				limit,
			},
			summary: {
				total_orders: toInteger(summaryResult?.total_orders, 0),
				paid_amount_paise: toInteger(summaryResult?.paid_amount_paise, 0),
				by_status: byStatus,
			},
		});
	} catch (error) {
		const message = error?.message || "Unable to fetch admin orders.";
		const status = /^Unauthorized request\./.test(message) ? 401 : 500;
		return jsonResponse(status, {
			error: message,
		});
	}
}
