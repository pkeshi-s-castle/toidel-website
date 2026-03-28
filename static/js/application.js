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

	initStylePicker();
	initCatalogFilters();
})();
