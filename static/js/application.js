(function () {
	"use strict";
	var CART_STORAGE_KEY = "toidel.cart.v1";
	var DEFAULT_SHIPPING_CHARGE_RUPEES = 100;
	var currencyFormatter = null;
	var razorpayScriptPromise = null;
	var elementMatches = Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;

	function forEachNode(nodeList, callback) {
		if (!nodeList || !callback) {
			return;
		}

		Array.prototype.forEach.call(nodeList, callback);
	}

	function closestElement(startNode, selector) {
		var current = startNode && startNode.nodeType === 1 ? startNode : startNode && startNode.parentElement;

		while (current) {
			if (elementMatches.call(current, selector)) {
				return current;
			}

			current = current.parentElement;
		}

		return null;
	}

	function isFiniteNumber(value) {
		return typeof value === "number" && isFinite(value);
	}

	function initStylePicker() {
		document.addEventListener("click", function (event) {
			var button = closestElement(event.target, ".style-picker button");
			if (!button) {
				return;
			}

			event.preventDefault();

			var stylesContainer = closestElement(button, ".styles");
			if (!stylesContainer) {
				return;
			}

			var id = String(button.getAttribute("data-item-id") || "");
			forEachNode(stylesContainer.querySelectorAll(".style"), function (style) {
				style.style.display = style.getAttribute("data-item-id") === id ? "" : "none";
			});

			var picker = closestElement(button, ".style-picker");
			if (!picker) {
				return;
			}

			forEachNode(picker.querySelectorAll("button"), function (pickerButton) {
				pickerButton.classList.toggle("is-active", pickerButton === button);
			});
		});
	}

	function initCatalogFilters() {
		forEachNode(document.querySelectorAll("[data-catalog]"), function (catalog) {
			var cards = Array.from(catalog.querySelectorAll("[data-product-card]"));
			var groups = Array.from(catalog.querySelectorAll("[data-category-group]"));
			var tabs = Array.from(catalog.querySelectorAll("[data-category-tab]"));
			var search = catalog.querySelector("[data-product-search]");
			var hint = catalog.querySelector("[data-category-hint]");
			var empty = catalog.querySelector("[data-catalog-empty]");
			var searchTerm = "";

			if (!cards.length) {
				return;
			}

			function updateHint(visibleCount) {
				if (!hint) {
					return;
				}

				if (searchTerm) {
					hint.textContent = "Showing " + visibleCount + ' products matching "' + searchTerm + '"';
					return;
				}

				hint.textContent = "Showing all products";
			}

			function setActiveTab(categoryKey) {
				if (!tabs.length) {
					return;
				}

				tabs.forEach(function (tab) {
					var isActive = tab.getAttribute("data-category-target") === "catalog-category-" + categoryKey;
					tab.classList.toggle("is-active", isActive);
					tab.setAttribute("aria-pressed", isActive ? "true" : "false");
				});
			}

			function updateActiveTabFromScroll() {
				if (!tabs.length || !groups.length || searchTerm) {
					return;
				}

				var activeGroup = groups[0];
				var closestOffset = Number.POSITIVE_INFINITY;

				groups.forEach(function (group) {
					if (group.hidden) {
						return;
					}

					var rect = group.getBoundingClientRect();
					var offset = Math.abs(rect.top - 160);
					if (offset < closestOffset) {
						closestOffset = offset;
						activeGroup = group;
					}
				});

				if (activeGroup) {
					setActiveTab(activeGroup.getAttribute("data-category-key") || "");
				}
			}

			function applyFilters() {
				var visibleCount = 0;

				cards.forEach(function (card) {
					var searchValue = String(card.getAttribute("data-search") || "").toLowerCase();
					var matchesSearch = !searchTerm || searchValue.indexOf(searchTerm) !== -1;

					card.hidden = !matchesSearch;
					card.style.display = matchesSearch ? "" : "none";

					if (matchesSearch) {
						visibleCount += 1;
					}
				});

				if (empty) {
					empty.hidden = visibleCount !== 0;
				}

				groups.forEach(function (group) {
					var groupCards = Array.from(group.querySelectorAll("[data-product-card]"));
					var groupVisibleCards = groupCards.filter(function (card) {
						return !card.hidden;
					});
					var groupVisibleCount = groupVisibleCards.length;
					var toggle = group.querySelector("[data-category-toggle]");
					var defaultVisible = toInteger(group.getAttribute("data-default-visible"), 3);
					var isExpanded = group.getAttribute("data-expanded") === "true";
					var visibleLimit = searchTerm ? groupVisibleCount : (isExpanded ? groupVisibleCount : defaultVisible);

					groupCards.forEach(function (card) {
						if (card.hidden) {
							card.style.display = "none";
							return;
						}

						var cardIndex = groupVisibleCards.indexOf(card);
						var shouldShowCard = cardIndex > -1 && cardIndex < visibleLimit;
						card.hidden = !shouldShowCard;
						card.style.display = shouldShowCard ? "" : "none";
					});

					var groupEmpty = group.querySelector("[data-category-empty]");
					if (groupEmpty) {
						groupEmpty.hidden = groupVisibleCount !== 0;
					}

					if (toggle) {
						var canExpand = !searchTerm && groupVisibleCount > defaultVisible;
						toggle.hidden = !canExpand;
						toggle.setAttribute("aria-expanded", canExpand && isExpanded ? "true" : "false");
						toggle.textContent = canExpand && !isExpanded ? "Show " + (groupVisibleCount - defaultVisible) + " more" : "Show less";
					}

					if (searchTerm) {
						var hideGroup = groupVisibleCount === 0;
						group.hidden = hideGroup;
						group.style.display = hideGroup ? "none" : "";
					} else {
						group.hidden = false;
						group.style.display = "";
					}
				});

				updateHint(visibleCount);
				updateActiveTabFromScroll();
			}

			catalog.addEventListener("click", function (event) {
				var toggle = closestElement(event.target, "[data-category-toggle]");
				if (toggle) {
					event.preventDefault();

					var toggleGroup = closestElement(toggle, "[data-category-group]");
					if (!toggleGroup) {
						return;
					}

					toggleGroup.setAttribute("data-expanded", toggleGroup.getAttribute("data-expanded") === "true" ? "false" : "true");
					applyFilters();
					return;
				}

				var tab = closestElement(event.target, "[data-category-tab]");
				if (!tab) {
					return;
				}

				event.preventDefault();

				var targetId = tab.getAttribute("data-category-target") || "";
				var targetGroup = targetId ? document.getElementById(targetId) : null;
				if (!targetGroup || targetGroup.hidden) {
					return;
				}

				setActiveTab(targetGroup.getAttribute("data-category-key") || "");
				targetGroup.scrollIntoView({
					behavior: "smooth",
					block: "start"
				});
			});

			if (search) {
				search.addEventListener("input", function () {
					searchTerm = String(search.value || "").trim().toLowerCase();
					applyFilters();
				});
			}

			window.addEventListener("scroll", updateActiveTabFromScroll, { passive: true });

			applyFilters();
		});
	}

	function toInteger(value, fallbackValue) {
		var parsed = parseInt(value, 10);
		if (!isFiniteNumber(parsed)) {
			return fallbackValue;
		}

		return parsed;
	}

	function toPrice(value) {
		var parsed = Number(value);
		if (!isFiniteNumber(parsed) || parsed < 0) {
			return 0;
		}

		return Math.round(parsed * 100) / 100;
	}

	function sanitizeText(value) {
		return String(value || "").replace(/\s+/g, " ").trim();
	}

	function normalizeProductURL(value) {
		var normalized = String(value || "").trim();
		if (!normalized) {
			return "/";
		}

		if (/^https?:\/\//i.test(normalized) || normalized.charAt(0) === "/") {
			return normalized;
		}

		return "/" + normalized.replace(/^\/+/, "");
	}

	function normalizeCartItem(value) {
		if (!value || typeof value !== "object") {
			return null;
		}

		var id = sanitizeText(value.id);
		var name = sanitizeText(value.name);
		if (!id || !name) {
			return null;
		}

		var quantity = toInteger(value.quantity, 1);
		if (quantity < 1) {
			quantity = 1;
		}

		return {
			id: id,
			name: name,
			price: toPrice(value.price),
			quantity: quantity,
			url: normalizeProductURL(value.url || id)
		};
	}

	function loadCart() {
		try {
			var raw = localStorage.getItem(CART_STORAGE_KEY);
			var parsed = JSON.parse(raw || "[]");
			if (!Array.isArray(parsed)) {
				return [];
			}

			return parsed
				.map(function (item) {
					return normalizeCartItem(item);
				})
				.filter(function (item) {
					return !!item;
				});
		} catch (error) {
			return [];
		}
	}

	function saveCart(items) {
		try {
			localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
		} catch (error) {
			return;
		}
	}

	function getCartCount(items) {
		return items.reduce(function (count, item) {
			return count + item.quantity;
		}, 0);
	}

	function calculateCartTotal(items) {
		return items.reduce(function (total, item) {
			return total + item.price * item.quantity;
		}, 0);
	}

	function calculateCartGrandTotal(items, shippingChargeRupees) {
		var subtotal = calculateCartTotal(items);
		var shippingCharge = toPrice(shippingChargeRupees);
		if (subtotal <= 0) {
			return 0;
		}
		return subtotal + shippingCharge;
	}

	function formatCurrency(amount) {
		if (!currencyFormatter && typeof Intl !== "undefined" && Intl.NumberFormat) {
			currencyFormatter = new Intl.NumberFormat("en-IN", {
				style: "currency",
				currency: "INR",
				maximumFractionDigits: 0
			});
		}

		if (currencyFormatter) {
			return currencyFormatter.format(amount);
		}

		return "INR " + Math.round(amount);
	}

	function updateCartBadges(items) {
		var count = getCartCount(items);

		forEachNode(document.querySelectorAll("[data-cart-count]"), function (badge) {
			badge.textContent = String(count);
			badge.hidden = count === 0;
		});

		forEachNode(document.querySelectorAll("[data-cart-link]"), function (link) {
			link.classList.toggle("has-items", count > 0);
		});
	}

	function getCartItemIndex(cartItems, id) {
		return cartItems.findIndex(function (item) {
			return item.id === id;
		});
	}

	function addToCart(item) {
		var normalizedItem = normalizeCartItem(item);
		if (!normalizedItem) {
			return loadCart();
		}

		var cartItems = loadCart();
		var existingIndex = getCartItemIndex(cartItems, normalizedItem.id);
		if (existingIndex === -1) {
			cartItems.push(normalizedItem);
		} else {
			cartItems[existingIndex].quantity += normalizedItem.quantity;
			cartItems[existingIndex].price = normalizedItem.price;
			cartItems[existingIndex].name = normalizedItem.name;
			cartItems[existingIndex].url = normalizedItem.url;
		}

		saveCart(cartItems);
		updateCartBadges(cartItems);
		return cartItems;
	}

	function setCartItemQuantity(id, quantity) {
		var normalizedID = sanitizeText(id);
		if (!normalizedID) {
			return loadCart();
		}

		var cartItems = loadCart();
		var itemIndex = getCartItemIndex(cartItems, normalizedID);
		if (itemIndex === -1) {
			return cartItems;
		}

		if (quantity <= 0) {
			cartItems.splice(itemIndex, 1);
		} else {
			cartItems[itemIndex].quantity = quantity;
		}

		saveCart(cartItems);
		updateCartBadges(cartItems);
		return cartItems;
	}

	function clearCart() {
		saveCart([]);
		updateCartBadges([]);
	}

	function escapeHTML(value) {
		var htmlEscapes = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;"
		};

		return String(value || "").replace(/[&<>"']/g, function (character) {
			return htmlEscapes[character] || character;
		});
	}

	function buildCartMessage(items, prefill, shippingChargeRupees) {
		var heading = sanitizeText(prefill) || "Hi, I would like to place this order:";
		var lines = [heading, "", "Order details:"];
		var subtotal = calculateCartTotal(items);
		var shippingCharge = subtotal > 0 ? toPrice(shippingChargeRupees) : 0;
		var total = subtotal + shippingCharge;

		items.forEach(function (item, index) {
			var lineTotal = item.quantity * item.price;
			lines.push((index + 1) + ". " + sanitizeText(item.name) + " x" + item.quantity + " @ " + formatCurrency(item.price) + " = " + formatCurrency(lineTotal));
		});

		lines.push("");
		lines.push("Subtotal: " + formatCurrency(subtotal));
		lines.push("Shipping: " + formatCurrency(shippingCharge));
		lines.push("Total: " + formatCurrency(total));
		lines.push("");
		lines.push("Please confirm availability and delivery details.");

		return lines.join("\n");
	}

	function buildWhatsAppOrderURL(phone, prefill, items, shippingChargeRupees) {
		var normalizedPhone = String(phone || "").replace(/[^\d]/g, "");
		if (!normalizedPhone || !items.length) {
			return "#";
		}

		var message = buildCartMessage(items, prefill, shippingChargeRupees);
		return "https://wa.me/" + normalizedPhone + "?text=" + encodeURIComponent(message);
	}

	function parseResponseJSON(response) {
		return response.json().catch(function () {
			return {};
		});
	}

	function postJSON(url, payload) {
		return fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(payload || {})
		})
			.then(function (response) {
				return parseResponseJSON(response).then(function (data) {
					if (!response.ok) {
						var message = sanitizeText(data.error || data.message || "Request failed.");
						throw new Error(message || "Request failed.");
					}
					return data;
				});
			});
	}

	function ensureRazorpayLoaded() {
		if (window.Razorpay) {
			return Promise.resolve(window.Razorpay);
		}

		if (razorpayScriptPromise) {
			return razorpayScriptPromise;
		}

		razorpayScriptPromise = new Promise(function (resolve, reject) {
			var existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
			if (existingScript) {
				existingScript.addEventListener("load", function () {
					if (window.Razorpay) {
						resolve(window.Razorpay);
						return;
					}
					reject(new Error("Razorpay checkout was not available after loading."));
				});
				existingScript.addEventListener("error", function () {
					reject(new Error("Unable to load Razorpay checkout script."));
				});
				return;
			}

			var script = document.createElement("script");
			script.src = "https://checkout.razorpay.com/v1/checkout.js";
			script.async = true;
			script.onload = function () {
				if (window.Razorpay) {
					resolve(window.Razorpay);
					return;
				}
				reject(new Error("Razorpay checkout was not available after loading."));
			};
			script.onerror = function () {
				reject(new Error("Unable to load Razorpay checkout script."));
			};
			document.head.appendChild(script);
		})
			.catch(function (error) {
				razorpayScriptPromise = null;
				throw error;
			});

		return razorpayScriptPromise;
	}

	function createRazorpayOrder(orderURL, cartItems, checkoutDetails) {
		return postJSON(orderURL, {
			items: cartItems,
			customer: checkoutDetails.customer,
			shipping: checkoutDetails.shipping
		});
	}

	function verifyRazorpayPayment(verifyURL, payload) {
		return postJSON(verifyURL, payload);
	}

	function openRazorpayCheckout(checkoutData) {
		return new Promise(function (resolve, reject) {
			if (!window.Razorpay) {
				reject(new Error("Razorpay checkout is unavailable."));
				return;
			}

			var hasFinished = false;
			function resolveOnce(value) {
				if (hasFinished) {
					return;
				}
				hasFinished = true;
				resolve(value);
			}

			function rejectOnce(error) {
				if (hasFinished) {
					return;
				}
				hasFinished = true;
				reject(error);
			}

			var options = {
				key: checkoutData.key_id,
				amount: checkoutData.amount,
				currency: checkoutData.currency || "INR",
				name: checkoutData.name || "Toidel",
				description: checkoutData.description || "Cart order payment",
				order_id: checkoutData.order_id,
				handler: function (response) {
					resolveOnce({
						razorpay_order_id: response.razorpay_order_id || "",
						razorpay_payment_id: response.razorpay_payment_id || "",
						razorpay_signature: response.razorpay_signature || ""
					});
				},
				modal: {
					ondismiss: function () {
						var error = new Error("Payment was cancelled.");
						error.code = "payment_cancelled";
						rejectOnce(error);
					}
				},
				theme: {
					color: "#0f5db8"
				}
			};

			var checkout = new window.Razorpay(options);
			checkout.on("payment.failed", function (event) {
				var message = sanitizeText(event && event.error && (event.error.description || event.error.reason || event.error.source)) || "Payment failed.";
				rejectOnce(new Error(message));
			});
			checkout.open();
		});
	}

	function updatePaymentStatus(statusNode, message, tone) {
		if (!statusNode) {
			return;
		}

		var text = sanitizeText(message);
		statusNode.classList.remove("is-success");
		statusNode.classList.remove("is-error");

		if (!text) {
			statusNode.textContent = "";
			statusNode.hidden = true;
			return;
		}

		statusNode.textContent = text;
		statusNode.hidden = false;
		if (tone === "success") {
			statusNode.classList.add("is-success");
		} else if (tone === "error") {
			statusNode.classList.add("is-error");
		}
	}

	function updateOrderSuccess(successNode, details) {
		if (!successNode) {
			return;
		}

		if (!details || typeof details !== "object") {
			successNode.hidden = true;
			return;
		}

		var localOrderNode = successNode.querySelector("[data-success-local-order-id]");
		var razorpayOrderNode = successNode.querySelector("[data-success-razorpay-order-id]");
		var razorpayPaymentNode = successNode.querySelector("[data-success-razorpay-payment-id]");

		if (localOrderNode) {
			localOrderNode.textContent = sanitizeText(details.local_order_id) || "-";
		}
		if (razorpayOrderNode) {
			razorpayOrderNode.textContent = sanitizeText(details.order_id) || "-";
		}
		if (razorpayPaymentNode) {
			razorpayPaymentNode.textContent = sanitizeText(details.payment_id) || "-";
		}

		successNode.hidden = false;
	}

	function isValidCheckoutEmail(value) {
		var email = sanitizeText(value).toLowerCase();
		if (!email) {
			return true;
		}

		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	function normalizeCheckoutPhone(value) {
		var compact = sanitizeText(value).replace(/[^\d+]/g, "");
		if (!compact) {
			return "";
		}

		var startsWithPlus = compact.charAt(0) === "+";
		var digits = compact.replace(/\D/g, "");
		if (digits.length < 8 || digits.length > 15) {
			return "";
		}

		return startsWithPlus ? "+" + digits : digits;
	}

	function collectCheckoutDetails(cartPage) {
		var fields = {
			name: cartPage.querySelector("[data-checkout-name]"),
			phone: cartPage.querySelector("[data-checkout-phone]"),
			email: cartPage.querySelector("[data-checkout-email]"),
			addressLine1: cartPage.querySelector("[data-checkout-address-line1]"),
			addressLine2: cartPage.querySelector("[data-checkout-address-line2]"),
			city: cartPage.querySelector("[data-checkout-city]"),
			state: cartPage.querySelector("[data-checkout-state]"),
			pincode: cartPage.querySelector("[data-checkout-pincode]"),
			country: cartPage.querySelector("[data-checkout-country]")
		};

		var data = {
			customer: {
				name: sanitizeText(fields.name && fields.name.value),
				phone: sanitizeText(fields.phone && fields.phone.value),
				email: sanitizeText(fields.email && fields.email.value).toLowerCase()
			},
			shipping: {
				address_line1: sanitizeText(fields.addressLine1 && fields.addressLine1.value),
				address_line2: sanitizeText(fields.addressLine2 && fields.addressLine2.value),
				city: sanitizeText(fields.city && fields.city.value),
				state: sanitizeText(fields.state && fields.state.value),
				pincode: sanitizeText(fields.pincode && fields.pincode.value),
				country: sanitizeText(fields.country && fields.country.value) || "India"
			}
		};

		return {
			fields: fields,
			data: data
		};
	}

	function validateCheckoutDetails(checkout) {
		var data = checkout.data;
		var fields = checkout.fields;

		if (!data.customer.name) {
			return { message: "Please enter the customer's full name.", field: fields.name };
		}

		var normalizedPhone = normalizeCheckoutPhone(data.customer.phone);
		if (!normalizedPhone) {
			return { message: "Please enter a valid phone number.", field: fields.phone };
		}
		data.customer.phone = normalizedPhone;

		if (!isValidCheckoutEmail(data.customer.email)) {
			return { message: "Please enter a valid email address.", field: fields.email };
		}

		if (!data.shipping.address_line1) {
			return { message: "Please enter address line 1.", field: fields.addressLine1 };
		}

		if (!data.shipping.city) {
			return { message: "Please enter the city.", field: fields.city };
		}

		if (!data.shipping.state) {
			return { message: "Please enter the state.", field: fields.state };
		}

		if (!data.shipping.pincode) {
			return { message: "Please enter the pincode.", field: fields.pincode };
		}

		if (!data.shipping.country) {
			return { message: "Please enter the country.", field: fields.country };
		}

		return null;
	}

	function showAddedFeedback(button) {
		var label = button.querySelector(".catalog-action__label");
		if (!label || label.classList.contains("catalog-action__label--sr")) {
			button.classList.add("is-added");
			window.setTimeout(function () {
				button.classList.remove("is-added");
			}, 900);
			return;
		}

		if (!button.hasAttribute("data-original-label")) {
			button.setAttribute("data-original-label", label.textContent);
		}

		label.textContent = "Added";
		button.classList.add("is-added");

		window.setTimeout(function () {
			label.textContent = button.getAttribute("data-original-label") || "Add to Cart";
			button.classList.remove("is-added");
		}, 900);
	}

	function initCartButtons() {
		updateCartBadges(loadCart());

		document.addEventListener("click", function (event) {
			var addButton = closestElement(event.target, "[data-cart-add]");
			if (!addButton) {
				return;
			}

			event.preventDefault();

			var productID = sanitizeText(addButton.getAttribute("data-product-id"));
			var productName = sanitizeText(addButton.getAttribute("data-product-name"));
			var productURL = normalizeProductURL(addButton.getAttribute("data-product-url"));
			var productPrice = toPrice(addButton.getAttribute("data-product-price"));
			if (!productID || !productName) {
				return;
			}

			addToCart({
				id: productID,
				name: productName,
				price: productPrice,
				quantity: 1,
				url: productURL
			});

			showAddedFeedback(addButton);
		});
	}

	function initCartPage() {
		var cartPage = document.querySelector("[data-cart-page]");
		if (!cartPage) {
			return;
		}

		var phone = cartPage.getAttribute("data-cart-phone") || "";
		var prefill = cartPage.getAttribute("data-cart-prefill") || "";
		var orderURL = cartPage.getAttribute("data-razorpay-order-url") || "/api/razorpay-order";
		var verifyURL = cartPage.getAttribute("data-razorpay-verify-url") || "/api/razorpay-verify";
		var shippingChargeRupees = toPrice(cartPage.getAttribute("data-cart-shipping-charge"));
		if (shippingChargeRupees <= 0) {
			shippingChargeRupees = DEFAULT_SHIPPING_CHARGE_RUPEES;
		}
		var cartList = cartPage.querySelector("[data-cart-items]");
		var emptyState = cartPage.querySelector("[data-cart-empty]");
		var summary = cartPage.querySelector("[data-cart-summary]");
		var subtotalNode = cartPage.querySelector("[data-cart-subtotal]");
		var shippingNode = cartPage.querySelector("[data-cart-shipping]");
		var total = cartPage.querySelector("[data-cart-total]");
		var whatsappButton = cartPage.querySelector("[data-cart-whatsapp]");
		var payButton = cartPage.querySelector("[data-cart-pay]");
		var clearButton = cartPage.querySelector("[data-cart-clear]");
		var paymentStatus = cartPage.querySelector("[data-cart-payment-status]");
		var orderSuccess = cartPage.querySelector("[data-cart-order-success]");
		var newOrderButton = cartPage.querySelector("[data-cart-new-order]");
		var paymentInProgress = false;
		var orderCompleted = false;

		function setOrderCompleted(value) {
			orderCompleted = !!value;
			cartPage.classList.toggle("is-order-complete", orderCompleted);
		}

		function syncPayButton(cartItems) {
			if (!payButton) {
				return;
			}

			var hasItems = Array.isArray(cartItems) && cartItems.length > 0;
			var disabled = !hasItems || paymentInProgress || orderCompleted;
			payButton.classList.toggle("is-disabled", disabled);
			payButton.disabled = disabled;
			if (disabled) {
				payButton.setAttribute("aria-disabled", "true");
			} else {
				payButton.removeAttribute("aria-disabled");
			}
			if (paymentInProgress) {
				payButton.setAttribute("aria-busy", "true");
			} else {
				payButton.removeAttribute("aria-busy");
			}
		}

		function setPaymentInProgress(value) {
			paymentInProgress = !!value;
			syncPayButton(loadCart());
		}

		function renderCartPage() {
			var cartItems = loadCart();
			updateCartBadges(cartItems);

			if (!cartItems.length) {
				if (cartList) {
					cartList.innerHTML = "";
					cartList.hidden = true;
				}
				if (emptyState) {
					emptyState.hidden = false;
				}
				if (total) {
					total.textContent = formatCurrency(0);
				}
				if (subtotalNode) {
					subtotalNode.textContent = formatCurrency(0);
				}
				if (shippingNode) {
					shippingNode.textContent = formatCurrency(0);
				}
				if (whatsappButton) {
					whatsappButton.href = "#";
					whatsappButton.classList.add("is-disabled");
					whatsappButton.setAttribute("aria-disabled", "true");
				}
				if (summary) {
					summary.hidden = true;
				}

				setOrderCompleted(false);
				updateOrderSuccess(orderSuccess, null);
				syncPayButton(cartItems);
				return;
			}

			if (cartList) {
				cartList.hidden = false;
				cartList.innerHTML = cartItems
					.map(function (item) {
						var escapedID = escapeHTML(item.id);
						var escapedName = escapeHTML(item.name);
						var escapedURL = escapeHTML(item.url);
						var lineTotal = item.quantity * item.price;
						var controlDisabled = orderCompleted ? ' disabled aria-disabled="true"' : "";

						return '<li class="cart-item">' +
							'<div class="cart-item__info">' +
								'<a href="' + escapedURL + '" class="cart-item__name">' + escapedName + '</a>' +
								'<p class="cart-item__price">' + formatCurrency(item.price) + ' each</p>' +
							'</div>' +
							'<div class="cart-item__qty">' +
								'<button type="button" class="cart-qty-button" data-cart-decrement data-cart-item-id="' + escapedID + '" aria-label="Decrease quantity"' + controlDisabled + '>-</button>' +
								'<input type="number" min="1" step="1" class="cart-qty-input" value="' + item.quantity + '" data-cart-quantity data-cart-item-id="' + escapedID + '" aria-label="Item quantity"' + controlDisabled + ' />' +
								'<button type="button" class="cart-qty-button" data-cart-increment data-cart-item-id="' + escapedID + '" aria-label="Increase quantity"' + controlDisabled + '>+</button>' +
							'</div>' +
							'<p class="cart-item__line-total">' + formatCurrency(lineTotal) + '</p>' +
							'<button type="button" class="cart-item__remove" data-cart-remove data-cart-item-id="' + escapedID + '"' + controlDisabled + '>Remove</button>' +
						'</li>';
					})
					.join("");
			}

			if (emptyState) {
				emptyState.hidden = true;
			}

			if (summary) {
				summary.hidden = false;
			}

			var subtotalValue = calculateCartTotal(cartItems);
			var shippingValue = subtotalValue > 0 ? shippingChargeRupees : 0;
			if (subtotalNode) {
				subtotalNode.textContent = formatCurrency(subtotalValue);
			}
			if (shippingNode) {
				shippingNode.textContent = formatCurrency(shippingValue);
			}
			if (total) {
				total.textContent = formatCurrency(calculateCartGrandTotal(cartItems, shippingChargeRupees));
			}

			if (whatsappButton) {
				var orderMessageURL = buildWhatsAppOrderURL(phone, prefill, cartItems, shippingChargeRupees);
				whatsappButton.href = orderMessageURL;
				var disabled = orderMessageURL === "#";
				whatsappButton.classList.toggle("is-disabled", disabled);
				if (disabled) {
					whatsappButton.setAttribute("aria-disabled", "true");
				} else {
					whatsappButton.removeAttribute("aria-disabled");
				}
			}

			syncPayButton(cartItems);
		}

		cartPage.addEventListener("click", function (event) {
			var actionButton = closestElement(event.target, "[data-cart-increment], [data-cart-decrement], [data-cart-remove]");
			if (actionButton) {
				if (orderCompleted) {
					return;
				}

				event.preventDefault();
				var itemID = actionButton.getAttribute("data-cart-item-id") || "";
				var cartItems = loadCart();
				var itemIndex = getCartItemIndex(cartItems, itemID);
				if (itemIndex === -1) {
					return;
				}

				var currentQuantity = cartItems[itemIndex].quantity;
				if (actionButton.hasAttribute("data-cart-increment")) {
					setCartItemQuantity(itemID, currentQuantity + 1);
				} else if (actionButton.hasAttribute("data-cart-decrement")) {
					setCartItemQuantity(itemID, currentQuantity - 1);
				} else if (actionButton.hasAttribute("data-cart-remove")) {
					setCartItemQuantity(itemID, 0);
				}

				setOrderCompleted(false);
				updateOrderSuccess(orderSuccess, null);
				renderCartPage();
				return;
			}

			var payAction = closestElement(event.target, "[data-cart-pay]");
			if (payAction && payButton && payAction === payButton) {
				event.preventDefault();

				if (paymentInProgress || orderCompleted) {
					return;
				}

				var checkoutItems = loadCart();
				if (!checkoutItems.length) {
					renderCartPage();
					return;
				}

				var checkout = collectCheckoutDetails(cartPage);
				var validationError = validateCheckoutDetails(checkout);
				if (validationError) {
					updatePaymentStatus(paymentStatus, validationError.message, "error");
					if (validationError.field && typeof validationError.field.focus === "function") {
						validationError.field.focus();
					}
					return;
				}

				setPaymentInProgress(true);
				updatePaymentStatus(paymentStatus, "Preparing secure checkout...", "");
				updateOrderSuccess(orderSuccess, null);

				ensureRazorpayLoaded()
					.then(function () {
						return createRazorpayOrder(orderURL, checkoutItems, checkout.data);
					})
					.then(function (checkoutData) {
						updatePaymentStatus(paymentStatus, "Opening Razorpay checkout...", "");
						return openRazorpayCheckout(checkoutData);
					})
					.then(function (paymentPayload) {
						updatePaymentStatus(paymentStatus, "Verifying payment...", "");
						return verifyRazorpayPayment(verifyURL, paymentPayload);
					})
					.then(function (verificationResult) {
						updatePaymentStatus(paymentStatus, "Payment successful. Order is confirmed.", "success");
						setOrderCompleted(true);
						updateOrderSuccess(orderSuccess, verificationResult);
					})
					.catch(function (error) {
						if (error && error.code === "payment_cancelled") {
							updatePaymentStatus(paymentStatus, error.message || "Payment was cancelled.", "");
							return;
						}

						updatePaymentStatus(paymentStatus, (error && error.message) || "Unable to complete payment.", "error");
					})
					.then(function () {
						setPaymentInProgress(false);
						renderCartPage();
					});

				return;
			}

			var newOrderAction = closestElement(event.target, "[data-cart-new-order]");
			if (newOrderAction && newOrderButton && newOrderAction === newOrderButton) {
				event.preventDefault();
				setOrderCompleted(false);
				updateOrderSuccess(orderSuccess, null);
				updatePaymentStatus(paymentStatus, "", "");
				renderCartPage();
				return;
			}

			if (!clearButton || event.target !== clearButton) {
				return;
			}

			event.preventDefault();
			if (window.confirm("Clear all items from the cart?")) {
				clearCart();
				setOrderCompleted(false);
				updatePaymentStatus(paymentStatus, "", "");
				updateOrderSuccess(orderSuccess, null);
				renderCartPage();
			}
		});

		cartPage.addEventListener("change", function (event) {
			if (orderCompleted) {
				return;
			}

			var quantityInput = closestElement(event.target, "[data-cart-quantity]");
			if (!quantityInput) {
				return;
			}

			var itemID = quantityInput.getAttribute("data-cart-item-id") || "";
			var newQuantity = toInteger(quantityInput.value, 1);
			if (newQuantity < 1) {
				newQuantity = 1;
			}

			setCartItemQuantity(itemID, newQuantity);
			setOrderCompleted(false);
			updatePaymentStatus(paymentStatus, "", "");
			updateOrderSuccess(orderSuccess, null);
			renderCartPage();
		});

		renderCartPage();
	}

	function formatDateTime(value) {
		var normalized = sanitizeText(value);
		if (!normalized) {
			return "-";
		}

		var parsedDate = new Date(normalized);
		if (isNaN(parsedDate.getTime())) {
			return normalized;
		}

		if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
			return new Intl.DateTimeFormat("en-IN", {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(parsedDate);
		}

		return parsedDate.toLocaleString();
	}

	function formatPaiseAsCurrency(value) {
		return formatCurrency(toInteger(value, 0) / 100);
	}

	function renderAdminOrderDetail(detailNode, payload) {
		if (!detailNode) {
			return;
		}

		if (!payload || !payload.order) {
			detailNode.hidden = true;
			detailNode.innerHTML = "";
			return;
		}

		var order = payload.order;
		var items = Array.isArray(payload.items) ? payload.items : [];
		var events = Array.isArray(payload.events) ? payload.events : [];
		var shippingAddress = [
			sanitizeText(order.shipping_address_line1),
			sanitizeText(order.shipping_address_line2),
			sanitizeText(order.shipping_city),
			sanitizeText(order.shipping_state),
			sanitizeText(order.shipping_pincode),
			sanitizeText(order.shipping_country)
		].filter(function (value) {
			return !!value;
		}).join(", ");

		var itemsMarkup = items.length
			? items.map(function (item) {
				return "<tr>" +
					"<td>" + escapeHTML(sanitizeText(item.product_name) || "-") + "</td>" +
					"<td>" + toInteger(item.quantity, 0) + "</td>" +
					"<td>" + escapeHTML(formatPaiseAsCurrency(item.unit_price_paise)) + "</td>" +
					"<td>" + escapeHTML(formatPaiseAsCurrency(item.line_total_paise)) + "</td>" +
				"</tr>";
			}).join("")
			: '<tr><td colspan="4">No item rows found.</td></tr>';

		var eventsMarkup = events.length
			? "<ul>" + events.map(function (eventRow) {
				var eventLabel = sanitizeText(eventRow.event_type) || "event";
				var eventTime = formatDateTime(eventRow.processed_at);
				var eventID = sanitizeText(eventRow.event_id);
				return "<li><strong>" + escapeHTML(eventLabel) + "</strong> at " + escapeHTML(eventTime) + (eventID ? " (" + escapeHTML(eventID) + ")" : "") + "</li>";
			}).join("") + "</ul>"
			: "<p>No webhook events stored for this order yet.</p>";

		detailNode.innerHTML = "<div class=\"orders-admin__detail-head\">" +
			"<h4>Order " + escapeHTML(sanitizeText(order.id)) + "</h4>" +
			"<span class=\"orders-admin__status-tag orders-admin__status-tag--" + escapeHTML(sanitizeText(order.status).toLowerCase()) + "\">" + escapeHTML(sanitizeText(order.status) || "pending") + "</span>" +
		"</div>" +
		"<div class=\"orders-admin__detail-grid\">" +
			"<div>" +
				"<h5>Customer</h5>" +
				"<p><strong>Name:</strong> " + escapeHTML(sanitizeText(order.customer_name) || "-") + "</p>" +
				"<p><strong>Phone:</strong> " + escapeHTML(sanitizeText(order.customer_phone) || "-") + "</p>" +
				"<p><strong>Email:</strong> " + escapeHTML(sanitizeText(order.customer_email) || "-") + "</p>" +
			"</div>" +
			"<div>" +
				"<h5>Shipping</h5>" +
				"<p>" + escapeHTML(shippingAddress || "-") + "</p>" +
			"</div>" +
			"<div>" +
				"<h5>Payment</h5>" +
				"<p><strong>Local Order:</strong> " + escapeHTML(sanitizeText(order.id) || "-") + "</p>" +
				"<p><strong>Razorpay Order:</strong> " + escapeHTML(sanitizeText(order.razorpay_order_id) || "-") + "</p>" +
				"<p><strong>Razorpay Payment:</strong> " + escapeHTML(sanitizeText(order.razorpay_payment_id) || "-") + "</p>" +
				"<p><strong>Created:</strong> " + escapeHTML(formatDateTime(order.created_at)) + "</p>" +
				"<p><strong>Paid At:</strong> " + escapeHTML(formatDateTime(order.paid_at)) + "</p>" +
			"</div>" +
			"<div>" +
				"<h5>Totals</h5>" +
				"<p><strong>Subtotal:</strong> " + escapeHTML(formatPaiseAsCurrency(order.subtotal_paise)) + "</p>" +
				"<p><strong>Shipping:</strong> " + escapeHTML(formatPaiseAsCurrency(order.shipping_paise)) + "</p>" +
				"<p><strong>Total:</strong> " + escapeHTML(formatPaiseAsCurrency(order.amount_paise)) + "</p>" +
				"<p><strong>Items:</strong> " + toInteger(order.item_count, 0) + "</p>" +
			"</div>" +
		"</div>" +
		"<div class=\"orders-admin__detail-table-wrap\">" +
			"<h5>Items</h5>" +
			"<table class=\"orders-admin__detail-table\">" +
				"<thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>" +
				"<tbody>" + itemsMarkup + "</tbody>" +
			"</table>" +
		"</div>" +
		"<div class=\"orders-admin__detail-events\">" +
			"<h5>Webhook Events</h5>" +
			eventsMarkup +
		"</div>";

		detailNode.hidden = false;
	}

	function initOrdersAdminPage() {
		var adminPage = document.querySelector("[data-orders-admin]");
		if (!adminPage) {
			return;
		}

		var refreshButton = adminPage.querySelector("[data-admin-refresh]");
		var searchButton = adminPage.querySelector("[data-admin-search-button]");
		var statusFilter = adminPage.querySelector("[data-admin-status-filter]");
		var searchInput = adminPage.querySelector("[data-admin-search]");
		var controls = adminPage.querySelector("[data-admin-controls]");
		var viewerNode = adminPage.querySelector("[data-admin-viewer]");
		var statusMessage = adminPage.querySelector("[data-admin-status-message]");
		var metricsNode = adminPage.querySelector("[data-admin-metrics]");
		var totalOrdersNode = adminPage.querySelector("[data-admin-total-orders]");
		var paidOrdersNode = adminPage.querySelector("[data-admin-paid-orders]");
		var paidRevenueNode = adminPage.querySelector("[data-admin-paid-revenue]");
		var tableWrap = adminPage.querySelector("[data-admin-table-wrap]");
		var tableBody = adminPage.querySelector("[data-admin-orders-body]");
		var emptyNode = adminPage.querySelector("[data-admin-empty]");
		var detailNode = adminPage.querySelector("[data-admin-order-detail]");
		var listURL = adminPage.getAttribute("data-admin-orders-url") || "/api/admin-orders";
		var detailURL = adminPage.getAttribute("data-admin-order-url") || "/api/admin-order";
		var loading = false;

		function setStatusMessage(message, tone) {
			if (!statusMessage) {
				return;
			}

			var text = sanitizeText(message);
			statusMessage.classList.remove("is-success");
			statusMessage.classList.remove("is-error");
			if (!text) {
				statusMessage.textContent = "";
				statusMessage.hidden = true;
				return;
			}

			statusMessage.textContent = text;
			statusMessage.hidden = false;
			if (tone === "success") {
				statusMessage.classList.add("is-success");
			}
			if (tone === "error") {
				statusMessage.classList.add("is-error");
			}
		}

		function setViewer(identity) {
			if (!viewerNode) {
				return;
			}

			var email = sanitizeText(identity && identity.email);
			if (email) {
				viewerNode.textContent = "Signed in as " + email;
				viewerNode.hidden = false;
				return;
			}

			viewerNode.textContent = "Signed in via Cloudflare Access";
			viewerNode.hidden = false;
		}

		function setLoadingState(value) {
			loading = !!value;
			if (refreshButton) {
				refreshButton.disabled = loading;
			}
			if (searchButton) {
				searchButton.disabled = loading;
			}
		}

		function requestAdminJSON(url) {
			return fetch(url, {
				method: "GET",
				credentials: "same-origin"
			}).then(function (response) {
				var contentType = sanitizeText(response.headers.get("content-type")).toLowerCase();
				if (contentType.indexOf("application/json") === -1) {
					throw new Error("Access login/session is not active for admin APIs. Recheck Cloudflare Access routes.");
				}

				return parseResponseJSON(response).then(function (data) {
					if (!response.ok) {
						throw new Error(sanitizeText(data.error || "Request failed."));
					}
					return data;
				});
			});
		}

		function renderSummary(summary) {
			if (!metricsNode || !summary) {
				return;
			}

			var byStatus = summary.by_status || {};
			if (totalOrdersNode) {
				totalOrdersNode.textContent = String(toInteger(summary.total_orders, 0));
			}
			if (paidOrdersNode) {
				paidOrdersNode.textContent = String(toInteger(byStatus.paid, 0));
			}
			if (paidRevenueNode) {
				paidRevenueNode.textContent = formatPaiseAsCurrency(summary.paid_amount_paise);
			}
			metricsNode.hidden = false;
		}

		function renderOrders(orders) {
			if (!tableBody || !tableWrap || !emptyNode) {
				return;
			}

			if (!Array.isArray(orders) || !orders.length) {
				tableBody.innerHTML = "";
				tableWrap.hidden = true;
				emptyNode.hidden = false;
				return;
			}

			tableBody.innerHTML = orders.map(function (order) {
				var status = sanitizeText(order.status).toLowerCase() || "pending";
				return "<tr data-admin-order-id=\"" + escapeHTML(sanitizeText(order.id)) + "\">" +
					"<td>" + escapeHTML(formatDateTime(order.created_at)) + "</td>" +
					"<td>" + escapeHTML(sanitizeText(order.id)) + "</td>" +
					"<td><span class=\"orders-admin__status-tag orders-admin__status-tag--" + escapeHTML(status) + "\">" + escapeHTML(status) + "</span></td>" +
					"<td>" + escapeHTML(sanitizeText(order.customer_name) || "-") + "</td>" +
					"<td>" + escapeHTML(sanitizeText(order.customer_phone) || "-") + "</td>" +
					"<td>" + escapeHTML(formatPaiseAsCurrency(order.amount_paise)) + "</td>" +
					"<td>" + escapeHTML(sanitizeText(order.razorpay_payment_id) || "-") + "</td>" +
				"</tr>";
			}).join("");
			tableWrap.hidden = false;
			emptyNode.hidden = true;
		}

		function buildListRequestURL() {
			var url = new URL(listURL, window.location.origin);
			var status = sanitizeText(statusFilter && statusFilter.value).toLowerCase() || "all";
			var search = sanitizeText(searchInput && searchInput.value);
			url.searchParams.set("limit", "100");
			if (status && status !== "all") {
				url.searchParams.set("status", status);
			}
			if (search) {
				url.searchParams.set("q", search);
			}
			return url.toString();
		}

		function loadOrders() {
			if (loading) {
				return;
			}

			setLoadingState(true);
			setStatusMessage("Loading orders...", "");
			requestAdminJSON(buildListRequestURL())
				.then(function (payload) {
					setViewer(payload.viewer || {});
					if (controls) {
						controls.hidden = false;
					}
					renderSummary(payload.summary || {});
					renderOrders(payload.orders || []);
					renderAdminOrderDetail(detailNode, null);
					setStatusMessage("Orders updated.", "success");
				})
				.catch(function (error) {
					setStatusMessage((error && error.message) || "Unable to load orders.", "error");
				})
				.then(function () {
					setLoadingState(false);
				});
		}

		function loadOrderDetail(orderID) {
			var normalizedOrderID = sanitizeText(orderID);
			if (!normalizedOrderID || loading) {
				return;
			}

			setLoadingState(true);
			setStatusMessage("Loading order details...", "");
			var url = new URL(detailURL, window.location.origin);
			url.searchParams.set("id", normalizedOrderID);
			requestAdminJSON(url.toString())
				.then(function (payload) {
					renderAdminOrderDetail(detailNode, payload);
					setStatusMessage("Showing order details.", "success");
				})
				.catch(function (error) {
					setStatusMessage((error && error.message) || "Unable to load order details.", "error");
				})
				.then(function () {
					setLoadingState(false);
				});
		}

		if (loadButton) {
			loadButton.addEventListener("click", function (event) {
				event.preventDefault();
				loadOrders();
			});
		}

		if (refreshButton) {
			refreshButton.addEventListener("click", function (event) {
				event.preventDefault();
				loadOrders();
			});
		}

		if (searchButton) {
			searchButton.addEventListener("click", function (event) {
				event.preventDefault();
				loadOrders();
			});
		}

		if (statusFilter) {
			statusFilter.addEventListener("change", function () {
				loadOrders();
			});
		}

		if (searchInput) {
			searchInput.addEventListener("keydown", function (event) {
				if (event.key !== "Enter") {
					return;
				}
				event.preventDefault();
				loadOrders();
			});
		}

		if (tableBody) {
			tableBody.addEventListener("click", function (event) {
				var row = closestElement(event.target, "[data-admin-order-id]");
				if (!row) {
					return;
				}
				event.preventDefault();
				var orderID = row.getAttribute("data-admin-order-id") || "";
				loadOrderDetail(orderID);
			});
		}

		loadOrders();
	}

	initStylePicker();
	initCatalogFilters();
	initCartButtons();
	initCartPage();
	initOrdersAdminPage();
})();
