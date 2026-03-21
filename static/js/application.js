(function () {
	"use strict";

	$(".style-picker").on("click", "button", function (event) {
		event.preventDefault();

		var $button = $(event.currentTarget),
			id = $button.data("itemId"),
			$parent = $button.closest(".styles");

		$parent.children(".style").hide();
		$parent.children('.style[data-item-id="' + id + '"]').show();
		$button.siblings().removeClass("is-active");
		$button.addClass("is-active");
	});
})();
