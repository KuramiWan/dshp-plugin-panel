window.__ModuleLoader__.load({
	id: "@kuramiwan/dsh-skill-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locale.ts
		/** 技能面板（ADR-0007）client 半的 zh/en 文案。 */
		const NS = "skill-panel";
		const zh = {
			"nav": "技能面板",
			"page.title": "技能面板",
			"page.subtitle": "浏览技能池，按需引入/移除到当前会话（会话结束自动消失）。与 /skill-* 命令、session_skill_* 工具共享同一份状态。",
			"search.placeholder": "搜索技能名称或描述…",
			"origin.all": "全部",
			"origin.local": "本地",
			"origin.ecosystem": "生态",
			"list.empty": "没有匹配的技能",
			"pool.empty": "技能池为空",
			"state.introduced": "已引入",
			"state.blocked": "不可引入",
			"action.introduce": "引入",
			"action.remove": "移除",
			"action.detail": "详情",
			"action.collapse": "收起",
			"detail.when": "适用场景",
			"detail.content": "正文",
			"notice.introduced": "已引入到当前会话",
			"notice.removed": "已从当前会话移除",
			"notice.shadow": "（影子覆盖：本会话使用引入版）",
			"notice.already": "已在本会话引入",
			"notice.failed": "操作失败",
			"no.session": "当前没有会话——先打开一个会话，面板即作用于它。",
			"loading": "加载中…",
			"error": "加载失败",
			"retry": "重试"
		};
		const en = {
			"nav": "Skill Panel",
			"page.title": "Skill Panel",
			"page.subtitle": "Browse the skill pool and introduce/remove skills for the current session (they vanish when the session ends). Shares one state with /skill-* commands and session_skill_* tools.",
			"search.placeholder": "Search skill name or description…",
			"origin.all": "All",
			"origin.local": "Local",
			"origin.ecosystem": "Ecosystem",
			"list.empty": "No matching skills",
			"pool.empty": "The pool is empty",
			"state.introduced": "Introduced",
			"state.blocked": "Unavailable",
			"action.introduce": "Introduce",
			"action.remove": "Remove",
			"action.detail": "Details",
			"action.collapse": "Collapse",
			"detail.when": "When to use",
			"detail.content": "Content",
			"notice.introduced": "Introduced into this session",
			"notice.removed": "Removed from this session",
			"notice.shadow": " (shadows a same-name skill for this session only)",
			"notice.already": "Already introduced in this session",
			"notice.failed": "Operation failed",
			"no.session": "No current session — open one first; the panel acts on it.",
			"loading": "Loading…",
			"error": "Failed to load",
			"retry": "Retry"
		};
		//#endregion
		//#region src/client/styles.ts
		const STYLE_ID = "dshp-skill-panel-css";
		const CSS = `
.dshp-root{display:flex;flex-direction:column;gap:10px;font-family:inherit}
.dshp-toolbar{display:flex;align-items:center;gap:8px}
.dshp-search{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}
.dshp-search:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-select{background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 6px;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px}
.dshp-list{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto}
.dshp-item{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));border-radius:8px;padding:8px 10px}
.dshp-item-head{display:flex;align-items:center;gap:8px}
.dshp-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);flex:0 0 auto}
.dshp-tag{font-size:11px;line-height:16px;padding:0 6px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 14%,transparent);color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-tag-eco{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshp-tag-intro{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706)}
.dshp-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dshp-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.dshp-btn{font-size:12px;line-height:18px;padding:2px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer}
.dshp-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}
.dshp-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#2563eb);color:var(--dsw-alias-bg-base,#fff)}
.dshp-btn-primary:hover{opacity:.9}
.dshp-btn-danger{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 14%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshp-btn[disabled]{opacity:.45;cursor:not-allowed;pointer-events:none}
.dshp-reason{font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshp-shadow{font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-primary,#d97706)}
.dshp-detail{margin-top:4px;padding-top:6px;border-top:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.25));font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563);white-space:pre-wrap;word-break:break-word}
.dshp-detail-label{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328)}
.dshp-empty{font-size:12px;color:var(--dsw-alias-label-secondary,#9ca3af);padding:8px 2px}
.dshp-notice{font-size:12px;line-height:18px;padding:4px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshp-notice-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 14%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshp-page{display:flex;flex-direction:column;gap:12px;padding:2px 0 20px}
.dshp-title{font-size:18px;font-weight:600;line-height:28px;color:var(--dsw-alias-label-primary,#1f2328)}
.dshp-subtitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#9ca3af)}
`;
		function ensureStyle(ctx) {
			ctx.effect(() => {
				if (typeof document !== "undefined" && document.getElementById("dshp-skill-panel-css") === null) {
					const tag = document.createElement("style");
					tag.id = STYLE_ID;
					tag.dataset.plugin = "skill-panel";
					tag.textContent = CSS;
					document.head.appendChild(tag);
				}
				return () => {
					if (typeof document !== "undefined") document.getElementById(STYLE_ID)?.remove();
				};
			}, "skill-panel: styles");
		}
		//#endregion
		//#region src/client/view.tsx
		/**
		* 技能面板共享视图：池浏览/搜索 + 当前会话引入/移除（Q9 前置置灰 + 悬停原因 + 影子覆盖标注）。
		* 被设置节复用（会话头 popover 已移除）；数据走 HTTP 客户端（api.ts，相对路径 fetch）。
		*/
		function SkillPanelView(props) {
			const { sessionId, client, t } = props;
			const [entries, setEntries] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [origin, setOrigin] = (0, react.useState)("all");
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const [openDetail, setOpenDetail] = (0, react.useState)(null);
			const [detail, setDetail] = (0, react.useState)(null);
			const refresh = () => {
				if (client === void 0) return;
				setBusy(true);
				setError(false);
				client.browse({
					sessionId,
					...origin === "all" ? {} : { origin },
					...query.trim().length === 0 ? {} : { query: query.trim() },
					limit: 200
				}).then((result) => {
					setEntries([...result.entries ?? []]);
					setBusy(false);
				}).catch(() => {
					setError(true);
					setBusy(false);
				});
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [
				sessionId,
				origin,
				query
			]);
			const visible = (0, react.useMemo)(() => entries ?? [], [entries]);
			const runIntroduce = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.introduce({
					sessionId,
					name
				}).then((result) => {
					setBusy(false);
					if (result.ok) setNotice({
						kind: "ok",
						text: result.alreadyIntroduced ? t("notice.already") : t("notice.introduced") + (result.shadowed ? t("notice.shadow") : "")
					});
					else setNotice({
						kind: "error",
						text: `${t("notice.failed")}: ${result.reason}`
					});
					refresh();
				}).catch(() => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: t("notice.failed")
					});
				});
			};
			const runRemove = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.removeSkill({
					sessionId,
					name
				}).then((result) => {
					setBusy(false);
					setNotice(result.ok ? {
						kind: "ok",
						text: t("notice.removed")
					} : {
						kind: "error",
						text: `${t("notice.failed")}: ${result.reason}`
					});
					refresh();
				}).catch(() => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: t("notice.failed")
					});
				});
			};
			const toggleDetail = (name) => {
				if (client === void 0) return;
				if (openDetail === name) {
					setOpenDetail(null);
					setDetail(null);
					return;
				}
				setOpenDetail(name);
				setDetail(null);
				client.detail({
					sessionId,
					name
				}).then((result) => {
					if (result.ok) setDetail({
						whenToUse: result.whenToUse,
						content: result.content
					});
					else setDetail({ content: result.reason ?? "" });
				}).catch(() => setDetail({ content: t("error") }));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshp-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-toolbar",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dshp-search",
							placeholder: t("search.placeholder"),
							value: query,
							onChange: (event) => setQuery(event.target.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: "dshp-select",
							value: origin,
							onChange: (event) => setOrigin(event.target.value),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: t("origin.all")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "local",
									children: t("origin.local")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "ecosystem",
									children: t("origin.ecosystem")
								})
							]
						})]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: notice.kind === "ok" ? "dshp-notice" : "dshp-notice dshp-notice-error",
						children: notice.text
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-empty",
						children: [t("error"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn",
							onClick: refresh,
							children: t("retry")
						})]
					}) : busy && entries === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: t("loading")
					}) : visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: query.trim().length > 0 ? t("list.empty") : t("pool.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-list",
						children: visible.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshp-item",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-name",
											children: entry.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: entry.origin === "local" ? "dshp-tag" : "dshp-tag dshp-tag-eco",
											children: entry.origin === "local" ? t("origin.local") : entry.source ?? t("origin.ecosystem")
										}),
										entry.introduced && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag dshp-tag-intro",
											children: t("state.introduced")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dshp-actions",
											children: [entry.introduced ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn dshp-btn-danger",
												onClick: () => runRemove(entry.name),
												children: t("action.remove")
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn dshp-btn-primary",
												disabled: !entry.available || entry.blockReason !== void 0,
												title: entry.blockReason,
												onClick: () => runIntroduce(entry.name),
												children: t("action.introduce")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn",
												onClick: () => toggleDetail(entry.name),
												children: openDetail === entry.name ? t("action.collapse") : t("action.detail")
											})]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dshp-desc",
									children: entry.description
								}),
								entry.blockReason !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-reason",
									children: ["⛔ ", entry.blockReason]
								}),
								openDetail === entry.name && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dshp-detail",
									children: detail === null ? t("loading") : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [detail.whenToUse !== void 0 && detail.whenToUse.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dshp-detail-label",
										children: [t("detail.when"), "："]
									}), detail.whenToUse] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dshp-detail-label",
										children: [t("detail.content"), "："]
									}), detail.content] })] })
								})
							]
						}, entry.name))
					})
				]
			});
		}
		//#endregion
		//#region src/client/sections.tsx
		function SkillPanelSettingsSection(props) {
			const { useSessions, client, t } = props;
			const sessionId = typeof useSessions === "function" ? useSessions((state) => state.current) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshp-page",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-title",
						children: t("page.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-subtitle",
						children: t("page.subtitle")
					}),
					sessionId === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: t("no.session")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillPanelView, {
						sessionId,
						client,
						t
					})
				]
			});
		}
		//#endregion
		//#region src/client/api.ts
		/** POST 一个面板方法；HTTP 非 2xx 时抛出（优先取 body 的 reason）。 */
		async function post(method, body) {
			const response = await fetch(`/skill-panel/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			let data;
			try {
				data = await response.json();
			} catch {
				data = void 0;
			}
			if (!response.ok) {
				const reason = data?.reason ?? `HTTP ${response.status}`;
				throw new Error(reason);
			}
			return data;
		}
		/** 把传输层异常 fold 成统一业务失败形状（匹配各结果联合的 ok:false 分支）。 */
		function foldFail(error) {
			return {
				ok: false,
				reason: error instanceof Error ? error.message : String(error)
			};
		}
		/** 创建 HTTP 客户端：实例化后无需等待 remote 就绪，可直接调用。 */
		function createSkillPanelClient() {
			return {
				browse: (request) => post("browse", request),
				list: (request) => post("list", request),
				detail: async (request) => {
					try {
						return await post("detail", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				introduce: async (request) => {
					try {
						return await post("introduce", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				removeSkill: async (request) => {
					try {
						return await post("removeSkill", request);
					} catch (error) {
						return foldFail(error);
					}
				}
			};
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* 技能面板 client 半（ADR-0007）：注册一个加性槽位入口。
		* - settings.section「技能面板」节（order 30，全功能管理页）
		* （会话头「技能」popover 入口已按用户要求移除，仅在设置页管理。）
		* 数据走 HTTP 客户端（api.ts，相对路径 fetch /skill-panel/<method>，发布方案一）：
		* host webServer 路由随 host 半同步注册，client 半无需等待 remote 就绪，
		* 实例化后直接可用，故此处不再需要旧的 remote 轮询包装。
		*/
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "skill-panel: dictionaries");
			ensureStyle(ctx);
			const t = ctx.locale.bind(NS);
			const client = createSkillPanelClient();
			function SkillPanelSectionEntry(props) {
				return (0, react.createElement)(SkillPanelSettingsSection, {
					...props,
					client,
					t
				});
			}
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skill-panel",
				order: 30,
				label: () => t("nav"),
				locale: NS
			}, SkillPanelSectionEntry));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
