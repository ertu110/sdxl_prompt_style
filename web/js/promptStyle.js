import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";
import { $el } from "../../../scripts/ui.js";
import { api } from "../../../scripts/api.js";



app.registerExtension({
	name: "pysssss.Combo++",
	init() {
		

		

		// Ensure hook callbacks are available
		const getOrSet = (target, name, create) => {
			if (name in target) return target[name];
			return (target[name] = create());
		};
		const symbol = getOrSet(window, "__pysssss__", () => Symbol("__pysssss__"));
		const store = getOrSet(window, symbol, () => ({}));
		const contextMenuHook = getOrSet(store, "contextMenuHook", () => ({}));
		for (const e of ["ctor", "preAddItem", "addItem"]) {
			if (!contextMenuHook[e]) {
				contextMenuHook[e] = [];
			}
		}
		// // Checks if this is a custom combo item
		const isCustomItem = (value) => value && typeof value === "object" && "image" in value && value.content;
		// Simple check for what separator to split by
		const splitBy = (navigator.platform || navigator.userAgent).includes("Win") ? /\/|\\/ : /\//;

		
		function encodeRFC3986URIComponent(str) {
			return encodeURIComponent(str).replace(
				/[!'()*]/g,
				(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
			);
		}

		// After an element is created for an item, add an image if it has one
		contextMenuHook["addItem"].push(function (el, menu, [name, value, options]) {
			if (el && isCustomItem(value) && value?.image && !value.submenu) {
				el.textContent += " *";
				$el("div.pysssss-combo-image", {
					parent: el,
					style: {
						backgroundImage: `url(/pysssss/view/${encodeRFC3986URIComponent(value.image)})`,
					},
				});
			}
		});

		function buildMenu(widget, values) {
			const lookup = {
				"": { options: [] },
			};

			// Split paths into menu structure
			for (const value of values) {
				const split = value.content.split(splitBy);
				let path = "";
				for (let i = 0; i < split.length; i++) {
					const s = split[i];
					const last = i === split.length - 1;
					if (last) {
						// Leaf node, manually add handler that sets the lora
						lookup[path].options.push({
							...value,
							title: s,
							callback: () => {
								widget.value = value;
								widget.callback(value);
								app.graph.setDirtyCanvas(true);
							},
						});
					} else {
						const prevPath = path;
						path += s + splitBy;
						if (!lookup[path]) {
							const sub = {
								title: s,
								submenu: {
									options: [],
									title: s,
								},
							};

							// Add to tree
							lookup[path] = sub.submenu;
							lookup[prevPath].options.push(sub);
						}
					}
				}
			}

			return lookup[""].options;
		}

		// Override COMBO widgets to patch their values
		const combo = ComfyWidgets["COMBO"];
		ComfyWidgets["COMBO"] = function (node, inputName, inputData) {
			const type = inputData[0];
			const res = combo.apply(this, arguments);
			if (isCustomItem(type[0])) {
				let value = res.widget.value;
				let values = res.widget.options.values;
				let menu = null;

				// Override the option values to check if we should render a menu structure
				Object.defineProperty(res.widget.options, "values", {
					get() {
						let v = values;

						v = buildMenu(res.widget, values);

						const valuesIncludes = v.includes;
						v.includes = function (searchElement) {
							const includesFromMenuItems = function (items) {
								for (const item of items) {
									if (includesFromMenuItem(item)) {
										return true;
									}
								}
								return false;
							}
							const includesFromMenuItem = function (item) {
								if (item.submenu) {
									return includesFromMenuItems(item.submenu.options)
								} else {
									return item.content === searchElement.content;
								}
							}

							const includes = valuesIncludes.apply(this, arguments) || includesFromMenuItems(this);
							return includes;
						}

						return v;
					},
					set(v) {
						// Options are changing (refresh) so reset the menu so it can be rebuilt if required
						values = v;
						menu = null;
					},
				});

				Object.defineProperty(res.widget, "value", {
					get() {
						// HACK: litegraph supports rendering items with "content" in the menu, but not on the widget
						// This detects when its being called by the widget drawing and just returns the text
						// Also uses the content for the same image replacement value
						if (res.widget) {
							const stack = new Error().stack;
							if (stack.includes("drawNodeWidgets") || stack.includes("saveImageExtraOutput")) {
								return (value || type[0]).content;
							}
						}
						return value;
					},
					set(v) {
						if (v?.submenu) {
							// Dont allow selection of submenus
							return;
						}
						value = v;
					},
				});
			}

			return res;
		};
	},
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		const isStyle = nodeType.comfyClass === "SDXLPromptStyler";
		if (isStyle) {
			const onAdded = nodeType.prototype.onAdded;
			nodeType.prototype.onAdded = function () {
				ComfyWidgets["COMBO"](this, "example", [[""]], app);
			}
			
		}
	},
});
