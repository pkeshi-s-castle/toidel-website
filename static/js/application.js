(function () {
	"use strict";
	var CART_STORAGE_KEY = "toidel.cart.v1";
	var currencyFormatter = null;
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

			function applyFilters() {
				var visibleCount = 0;

				cards.forEach(function (card) {
					var searchValue = String(card.getAttribute("data-search") || "").toLowerCase();
					var matchesSearch = !searchTerm || searchValue.indexOf(searchTerm) !== -1;
					var isVisible = matchesSearch;

					card.hidden = !isVisible;
					card.style.display = isVisible ? "" : "none";

					if (isVisible) {
						visibleCount += 1;
					}
				});

				if (empty) {
					empty.hidden = visibleCount !== 0;
				}

				groups.forEach(function (group) {
					var groupCards = Array.from(group.querySelectorAll("[data-product-card]"));
					var groupVisibleCount = 0;

					groupCards.forEach(function (card) {
						if (!card.hidden) {
							groupVisibleCount += 1;
						}
					});

					var groupEmpty = group.querySelector("[data-category-empty]");
					if (groupEmpty) {
						groupEmpty.hidden = groupVisibleCount !== 0;
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
			}

			if (search) {
				search.addEventListener("input", function () {
					searchTerm = String(search.value || "").trim().toLowerCase();
					applyFilters();
				});
			}

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

	function buildCartMessage(items, prefill) {
		var heading = sanitizeText(prefill) || "Hi, I would like to place this order:";
		var lines = [heading, "", "Order details:"];

		items.forEach(function (item, index) {
			var lineTotal = item.quantity * item.price;
			lines.push((index + 1) + ". " + sanitizeText(item.name) + " x" + item.quantity + " @ " + formatCurrency(item.price) + " = " + formatCurrency(lineTotal));
		});

		lines.push("");
		lines.push("Total: " + formatCurrency(calculateCartTotal(items)));
		lines.push("");
		lines.push("Please confirm availability and delivery details.");

		return lines.join("\n");
	}

	function buildWhatsAppOrderURL(phone, prefill, items) {
		var normalizedPhone = String(phone || "").replace(/[^\d]/g, "");
		if (!normalizedPhone || !items.length) {
			return "#";
		}

		var message = buildCartMessage(items, prefill);
		return "https://wa.me/" + normalizedPhone + "?text=" + encodeURIComponent(message);
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
		var cartList = cartPage.querySelector("[data-cart-items]");
		var emptyState = cartPage.querySelector("[data-cart-empty]");
		var summary = cartPage.querySelector("[data-cart-summary]");
		var total = cartPage.querySelector("[data-cart-total]");
		var whatsappButton = cartPage.querySelector("[data-cart-whatsapp]");
		var clearButton = cartPage.querySelector("[data-cart-clear]");

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
				if (summary) {
					summary.hidden = true;
				}
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

						return '<li class="cart-item">' +
							'<div class="cart-item__info">' +
								'<a href="' + escapedURL + '" class="cart-item__name">' + escapedName + '</a>' +
								'<p class="cart-item__price">' + formatCurrency(item.price) + ' each</p>' +
							'</div>' +
							'<div class="cart-item__qty">' +
								'<button type="button" class="cart-qty-button" data-cart-decrement data-cart-item-id="' + escapedID + '" aria-label="Decrease quantity">-</button>' +
								'<input type="number" min="1" step="1" class="cart-qty-input" value="' + item.quantity + '" data-cart-quantity data-cart-item-id="' + escapedID + '" aria-label="Item quantity" />' +
								'<button type="button" class="cart-qty-button" data-cart-increment data-cart-item-id="' + escapedID + '" aria-label="Increase quantity">+</button>' +
							'</div>' +
							'<p class="cart-item__line-total">' + formatCurrency(lineTotal) + '</p>' +
							'<button type="button" class="cart-item__remove" data-cart-remove data-cart-item-id="' + escapedID + '">Remove</button>' +
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

			if (total) {
				total.textContent = formatCurrency(calculateCartTotal(cartItems));
			}

			if (whatsappButton) {
				var orderURL = buildWhatsAppOrderURL(phone, prefill, cartItems);
				whatsappButton.href = orderURL;
				var disabled = orderURL === "#";
				whatsappButton.classList.toggle("is-disabled", disabled);
				if (disabled) {
					whatsappButton.setAttribute("aria-disabled", "true");
				} else {
					whatsappButton.removeAttribute("aria-disabled");
				}
			}
		}

		cartPage.addEventListener("click", function (event) {
			var actionButton = closestElement(event.target, "[data-cart-increment], [data-cart-decrement], [data-cart-remove]");
			if (actionButton) {
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

				renderCartPage();
				return;
			}

			if (!clearButton || event.target !== clearButton) {
				return;
			}

			event.preventDefault();
			if (window.confirm("Clear all items from the cart?")) {
				clearCart();
				renderCartPage();
			}
		});

		cartPage.addEventListener("change", function (event) {
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
			renderCartPage();
		});

		renderCartPage();
	}

	initStylePicker();
	initCatalogFilters();
	initCartButtons();
	initCartPage();
})();
