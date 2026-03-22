(function () {
	"use strict";

	function initStylePicker() {
		document.addEventListener("click", function (event) {
			var button = event.target.closest(".style-picker button");
			if (!button) {
				return;
			}

			event.preventDefault();

			var stylesContainer = button.closest(".styles");
			if (!stylesContainer) {
				return;
			}

			var id = String(button.getAttribute("data-item-id") || "");
			stylesContainer.querySelectorAll(".style").forEach(function (style) {
				style.style.display = style.getAttribute("data-item-id") === id ? "" : "none";
			});

			var picker = button.closest(".style-picker");
			if (!picker) {
				return;
			}

			picker.querySelectorAll("button").forEach(function (pickerButton) {
				pickerButton.classList.toggle("is-active", pickerButton === button);
			});
		});
	}

	function initCatalogFilters() {
		document.querySelectorAll("[data-catalog]").forEach(function (catalog) {
			var cards = Array.from(catalog.querySelectorAll("[data-product-card]"));
			var buttons = Array.from(catalog.querySelectorAll("[data-category-filter]"));
			var search = catalog.querySelector("[data-product-search]");
			var hint = catalog.querySelector("[data-category-hint]");
			var empty = catalog.querySelector("[data-catalog-empty]");
			var activeCategory = "all";
			var searchTerm = "";

			if (!cards.length || !buttons.length) {
				return;
			}

			function getCategoryLabel() {
				for (var i = 0; i < buttons.length; i += 1) {
					if (buttons[i].getAttribute("data-category-filter") === activeCategory) {
						return buttons[i].textContent.trim();
					}
				}
				return "filtered";
			}

			function updateHint() {
				if (!hint) {
					return;
				}

				var label = activeCategory === "all"
					? "Showing all products"
					: "Showing " + getCategoryLabel() + " products";

				if (searchTerm) {
					label += ' matching "' + searchTerm + '"';
				}

				hint.textContent = label;
			}

			function applyFilters() {
				var visibleCount = 0;

				cards.forEach(function (card) {
					var matchesCategory = activeCategory === "all" || card.getAttribute("data-category") === activeCategory;
					var searchValue = String(card.getAttribute("data-search") || "").toLowerCase();
					var matchesSearch = !searchTerm || searchValue.indexOf(searchTerm) !== -1;
					var isVisible = matchesCategory && matchesSearch;

					card.hidden = !isVisible;

					if (isVisible) {
						visibleCount += 1;
					}
				});

				if (empty) {
					empty.hidden = visibleCount !== 0;
				}

				updateHint();
			}

			buttons.forEach(function (button) {
				button.addEventListener("click", function () {
					activeCategory = String(button.getAttribute("data-category-filter") || "all");
					buttons.forEach(function (tabButton) {
						var isActive = tabButton === button;
						tabButton.classList.toggle("is-active", isActive);
						tabButton.setAttribute("aria-pressed", isActive ? "true" : "false");
					});

					applyFilters();
				});
			});

			if (search) {
				search.addEventListener("input", function () {
					searchTerm = String(search.value || "").trim().toLowerCase();
					applyFilters();
				});
			}

			applyFilters();
		});
	}

	initStylePicker();
	initCatalogFilters();
})();
