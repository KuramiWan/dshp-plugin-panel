window.__ModuleLoader__.load({
	id: "@super_camel/dsh-skill-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locale.ts
		/** 技能面板（ADR-0007）client 半的 zh/en 文案。面向最终用户，不含实现细节。 */
		const NS = "skill-panel";
		const zh = {
			"nav": "技能面板",
			"page.title": "技能面板",
			"page.subtitle": "技能分三层管理：全局（所有会话自动可见）、可用池（按需引入或设为全局）、本会话（仅当前会话，重启自动恢复）。三层按分组标签统一归类；启用/停用只是移动位置，不复制不删除。",
			"search.placeholder": "搜索技能名称或描述…",
			"global.title": "全局（所有会话自动可见）",
			"global.empty": "还没有全局技能（在下方可用池点「启用」设为全局）",
			"global.active": "全局",
			"action.activate": "启用",
			"action.deactivate": "停用",
			"notice.activated": "已设为全局（所有会话自动可见）",
			"notice.deactivated": "已停用（移回可用池，不再全局可见）",
			"pool.title": "可用池",
			"group.ungrouped": "未分组",
			"introduced.title": "本会话已引入",
			"introduced.empty": "本会话还没有引入任何技能",
			"list.empty": "没有匹配的技能",
			"pool.empty": "技能池为空（把含技能说明文件 SKILL.md 的文件夹放进 ~/.dsh/.skill-pool/local/ 即加入管理）",
			"state.introduced": "已引入",
			"action.introduce": "引入",
			"action.remove": "移除",
			"action.tag": "分组",
			"action.apply": "应用",
			"action.cancel": "取消",
			"tag.edit.label": "分组标签（逗号分隔，三层共享）",
			"tag.edit.placeholder": "如 git, writing（留空 = 未分组）",
			"notice.tagged": "已更新分组标签",
			"detail.when": "适用场景",
			"detail.content": "正文",
			"notice.introduced": "已引入到当前会话",
			"notice.persisted": "（已记录，重启后自动恢复）",
			"notice.removed": "已从当前会话移除（技能本身不受影响）",
			"notice.shadow": "（本会话优先使用引入的版本）",
			"notice.already": "已在本会话引入",
			"notice.failed": "操作失败",
			"no.session": "当前没有会话——先打开一个会话，面板即作用于它。",
			"loading": "加载中…",
			"error": "加载失败",
			"retry": "重试",
			"mcp.tips": "在这里发现 DSH 已配置的 MCP，点「加入管理」后可连接/断开并检查。本面板不负责创建 MCP。",
			"mcp.globalNote": "模型已通过全局实例使用这些 MCP；这里的连接/断开只影响当前会话。",
			"mcp.empty": "还没有管理任何 MCP——在下方「发现」里选择要管理的 MCP。",
			"mcp.discover.title": "可用的 MCP",
			"mcp.discover.empty": "没有已配置的 MCP。",
			"mcp.managed.title": "已管理",
			"mcp.action.manage": "加入管理",
			"mcp.action.check": "检查",
			"mcp.check.running": "检查中…",
			"mcp.check.ok": "检查通过：可用工具数 =",
			"mcp.check.zero": "已连接但未发现工具（服务可能未启动或启动较慢）",
			"mcp.state.managed": "已管理",
			"mcp.badge.secrets": "含私密配置",
			"mcp.badge.global": "全局启用",
			"mcp.notice.selected": "已加入管理",
			"mcp.loading": "加载中…",
			"mcp.state.connected": "已连接",
			"mcp.state.available": "可连接",
			"mcp.action.connect": "连接",
			"mcp.action.disconnect": "断开",
			"mcp.action.remove": "取消管理",
			"mcp.trust.stdio": "警告：该本地程序会以较高权限运行第三方代码（可读写文件、联网）。确定继续？",
			"mcp.notice.connected": "已连接",
			"mcp.notice.disconnected": "已断开",
			"mcp.notice.removed": "已取消管理",
			"mcp.notice.failed": "操作失败",
			"mcp.transport.stdio": "本地程序",
			"mcp.transport.http": "网络服务",
			"plugin.nav": "插件",
			"plugin.subtitle": "插件分四类管理：系统内置（只读）、用户安装 patch（热启停）、用户安装 bundle（需重启，可提升为热插拔）、MCP（会话级连接）。",
			"plugin.tips": "管理 DSH 已加载的插件。系统内置插件与面板自身不可停用；你自己安装的插件可随时启用/停用（bundle 插件需重启）。MCP 视同插件：启用=连接本会话、停用=断开。",
			"plugin.loading": "加载中…",
			"plugin.inventory.title": "已加载的插件",
			"plugin.inventory.empty": "没有可管理的插件。",
			"plugin.core.title": "系统内置插件（不可停用）",
			"plugin.action.install": "新增插件",
			"plugin.action.install.confirm": "安装",
			"plugin.install.title": "新增插件",
			"plugin.install.id": "插件 ID（如 my-plugin）",
			"plugin.install.name": "包名（如 @scope/my-plugin）",
			"plugin.notice.enabled": "已启用",
			"plugin.notice.disabled": "已停用",
			"plugin.notice.installed": "已安装",
			"plugin.source.core": "系统内置",
			"plugin.source.patch": "用户安装",
			"plugin.source.bundle": "用户安装",
			"plugin.source.mcp": "MCP",
			"plugin.state.active": "运行中",
			"plugin.state.stopped": "已停用",
			"plugin.state.failed": "异常",
			"plugin.badge.protected": "不可停用",
			"plugin.action.disable": "停用",
			"plugin.action.enable": "启用",
			"plugin.action.promote": "提升为热插拔",
			"plugin.action.addMcp": "加入管理",
			"plugin.mcp.add.title": "加入管理（从 DSH 已配置的 MCP 中选择）",
			"plugin.mcp.add.hint": "未加入管理的 MCP 默认全局启用（所有会话可见）；加入管理后转为会话级，可在此启用/停用（连接/断开本会话）。",
			"plugin.notice.promoted": "已提升为热插拔（需重启后点「启用」，之后免重启启停）",
			"plugin.badge.restart": "需重启",
			"plugin.mcp.title": "MCP 连接",
			"plugin.mcp.connected": "已连接",
			"plugin.mcp.available": "可连接",
			"plugin.search.placeholder": "搜索插件…",
			"plugin.help": "帮助"
		};
		const en = {
			"nav": "Skill Panel",
			"page.title": "Skill Panel",
			"page.subtitle": "Skills are managed in three layers: Global (visible in all sessions), Available pool (introduce per session or set as global), and This session (current session only, restored on resume). All three layers share grouping via tags; enable/disable only moves a skill between layers — no copies, no deletion.",
			"search.placeholder": "Search skill name or description…",
			"global.title": "Global (visible in all sessions)",
			"global.empty": "No global skills yet (use \"Enable\" on a pool skill below to make it global)",
			"global.active": "Global",
			"action.activate": "Enable",
			"action.deactivate": "Disable",
			"notice.activated": "Set as global (visible in all sessions)",
			"notice.deactivated": "Disabled (moved back to the available pool, no longer global)",
			"pool.title": "Available pool",
			"group.ungrouped": "Ungrouped",
			"introduced.title": "Introduced in this session",
			"introduced.empty": "No skills introduced in this session yet",
			"list.empty": "No matching skills",
			"pool.empty": "The pool is empty (drop a folder containing a SKILL.md file into ~/.dsh/.skill-pool/local/ to manage it)",
			"state.introduced": "Introduced",
			"action.introduce": "Introduce",
			"action.remove": "Remove",
			"action.tag": "Group",
			"action.apply": "Apply",
			"action.cancel": "Cancel",
			"tag.edit.label": "Group tags (comma-separated, shared across layers)",
			"tag.edit.placeholder": "e.g. git, writing (empty = ungrouped)",
			"notice.tagged": "Group tags updated",
			"detail.when": "When to use",
			"detail.content": "Content",
			"notice.introduced": "Introduced into this session",
			"notice.persisted": " (recorded, restored on session resume)",
			"notice.removed": "Removed from this session (the skill itself is untouched)",
			"notice.shadow": " (this session prefers the introduced version)",
			"notice.already": "Already introduced in this session",
			"notice.failed": "Operation failed",
			"no.session": "No current session — open one first; the panel acts on it.",
			"loading": "Loading…",
			"error": "Failed to load",
			"retry": "Retry",
			"mcp.tips": "Discover MCP servers already configured in DSH here; click \"Manage\" to admit one, then connect/disconnect and check it. This panel does not create MCP servers.",
			"mcp.globalNote": "The model already uses these MCPs through global instances; connecting/disconnecting here only affects this session.",
			"mcp.empty": "Nothing is under management yet — pick a configured MCP from the Discovery section below.",
			"mcp.discover.title": "Available MCPs",
			"mcp.discover.empty": "No MCP servers are configured.",
			"mcp.managed.title": "Managed",
			"mcp.action.manage": "Manage",
			"mcp.action.check": "Check",
			"mcp.check.running": "Checking…",
			"mcp.check.ok": "Check passed: usable tools =",
			"mcp.check.zero": "Connected but no tools discovered (the server may not be running or is slow to start)",
			"mcp.state.managed": "Managed",
			"mcp.badge.secrets": "has secrets",
			"mcp.badge.global": "global",
			"mcp.notice.selected": "Now managed",
			"mcp.loading": "Loading…",
			"mcp.state.connected": "Connected",
			"mcp.state.available": "Available",
			"mcp.action.connect": "Connect",
			"mcp.action.disconnect": "Disconnect",
			"mcp.action.remove": "Unmanage",
			"mcp.trust.stdio": "Warning: this local program runs third-party code with elevated privileges (can read/write files and use the network). Continue?",
			"mcp.notice.connected": "Connected",
			"mcp.notice.disconnected": "Disconnected",
			"mcp.notice.removed": "Unmanaged",
			"mcp.notice.failed": "Operation failed",
			"mcp.transport.stdio": "Local program",
			"mcp.transport.http": "Network service",
			"plugin.nav": "Plugins",
			"plugin.subtitle": "Plugins are managed in four groups: built-in (read-only), user-installed patch (hot toggle), user-installed bundle (needs restart, can be promoted to hot-pluggable), and MCP (session-level connections).",
			"plugin.tips": "Manage the plugins DSH has loaded. Built-in plugins and the panel itself cannot be disabled; plugins you installed can be enabled/disabled at any time (bundle plugins require a restart). MCP is treated as a plugin: enable = connect to this session, disable = disconnect.",
			"plugin.loading": "Loading…",
			"plugin.inventory.title": "Loaded plugins",
			"plugin.inventory.empty": "No manageable plugins.",
			"plugin.core.title": "Built-in plugins (cannot be disabled)",
			"plugin.action.install": "Add plugin",
			"plugin.action.install.confirm": "Install",
			"plugin.install.title": "Add plugin",
			"plugin.install.id": "Plugin ID (e.g. my-plugin)",
			"plugin.install.name": "Package (e.g. @scope/my-plugin)",
			"plugin.notice.enabled": "Enabled",
			"plugin.notice.disabled": "Disabled",
			"plugin.notice.installed": "Installed",
			"plugin.source.core": "built-in",
			"plugin.source.patch": "user-installed",
			"plugin.source.bundle": "user-installed",
			"plugin.source.mcp": "MCP",
			"plugin.state.active": "running",
			"plugin.state.stopped": "stopped",
			"plugin.state.failed": "error",
			"plugin.badge.protected": "cannot disable",
			"plugin.action.disable": "Disable",
			"plugin.action.enable": "Enable",
			"plugin.action.promote": "Make hot-pluggable",
			"plugin.action.addMcp": "Manage",
			"plugin.mcp.add.title": "Manage (choose from MCPs already configured in DSH)",
			"plugin.mcp.add.hint": "MCPs not under management are globally enabled by default (visible in all sessions); after adding to management they become session-scoped, and you can enable/disable (connect/disconnect) them here.",
			"plugin.notice.promoted": "Promoted to hot-pluggable (restart, then click \"Enable\"; afterwards enable/disable without restart)",
			"plugin.badge.restart": "restart required",
			"plugin.mcp.title": "MCP connections",
			"plugin.mcp.connected": "connected",
			"plugin.mcp.available": "available",
			"plugin.search.placeholder": "Search plugins…",
			"plugin.help": "Help"
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
.dshp-group{display:flex;flex-direction:column;gap:4px}
.dshp-group-head{display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:transparent;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));border-radius:6px;padding:4px 8px;cursor:pointer;color:var(--dsw-alias-label-primary,#1f2328);font-size:12px;line-height:18px}
.dshp-group-head:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}
.dshp-group-caret{flex:0 0 auto;color:var(--dsw-alias-label-secondary,#4b5563)}
.dshp-group-name{font-weight:600}
.dshp-group-count{color:var(--dsw-alias-label-secondary,#9ca3af)}
.dshp-item{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));border-radius:8px;padding:8px 10px}
.dshp-item-head{display:flex;align-items:center;gap:8px}
.dshp-item-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dshp-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);flex:0 0 auto}
.dshp-tag{font-size:11px;line-height:16px;padding:0 6px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 14%,transparent);color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-tag-eco{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshp-tag-intro{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706)}
.dshp-tag-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 14%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshp-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dshp-move{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dshp-move-new{flex:1;min-width:0}
.dshp-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.dshp-btn{font-size:12px;line-height:18px;padding:2px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:transparent;color:var(--dsw-alias-label-primary,#1f2328);cursor:pointer}
.dshp-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}
.dshp-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#2563eb);color:var(--dsw-alias-bg-base,#fff)}
.dshp-btn-primary:hover{opacity:.9}
.dshp-btn-danger{border-color:transparent;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 14%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshp-btn[disabled]{opacity:.45;cursor:not-allowed;pointer-events:none}
.dshp-help{flex:0 0 auto;width:24px;padding:2px 0;text-align:center;font-weight:700}
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
.dshp-tabs{display:flex;align-items:center;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));padding-bottom:6px}
.dshp-tab{font-size:13px;line-height:20px;padding:4px 12px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#4b5563);cursor:pointer}
.dshp-tab:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}
.dshp-tab-active{border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1f2328)}
.dshp-form{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:8px;padding:12px}
.dshp-form-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328)}
.dshp-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dshp-input{background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}
.dshp-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-textarea{background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-primary,#1f2328);font-size:12px;line-height:18px;font-family:inherit;resize:vertical;min-height:52px}
.dshp-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#9ca3af)}
.dshp-section-title{font-size:13px;font-weight:700;line-height:20px;color:var(--dsw-alias-label-primary,#1f2328);margin:16px 0 4px}
.dshp-section-title:first-of-type{margin-top:6px}
.dshp-tips{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary,#9ca3af);border-left:3px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));padding-left:8px;margin-bottom:2px}
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
		* 技能面板共享视图：三区布局——
		* 「全局激活（user-dsh 层，进程级自动可见：停用 / 打 tag）」
		* 「可用池（用户自管内容：启用 / 引入 / 打 tag / 详情）」
		* 「本会话已引入（移除）」。
		* 分组统一用技能 frontmatter `tags`，三池共享：全局激活 / 可用池 / 会话引入
		* 都按 tags 折叠展示（无 tags 归「未分组」）；tag 编辑写 SKILL.md，技能移到
		* 任何一层 tag 都跟着。启用/停用 = 目录在全局层与可用池间移动（不复制不删除）。
		* 数据走 HTTP 客户端（api.ts，相对路径 fetch）。
		*/
		function SkillPanelView(props) {
			const { sessionId, client, t } = props;
			const [entries, setEntries] = (0, react.useState)(null);
			const [globals, setGlobals] = (0, react.useState)(null);
			const [introduced, setIntroduced] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const [collapsed, setCollapsed] = (0, react.useState)(/* @__PURE__ */ new Set());
			/** 打 tag 行：name → 当前 tags 文本。 */
			const [tagFor, setTagFor] = (0, react.useState)(null);
			const [tagText, setTagText] = (0, react.useState)("");
			const refresh = () => {
				if (client === void 0) return;
				setBusy(true);
				setError(false);
				Promise.all([
					client.browse({
						sessionId,
						...query.trim().length === 0 ? {} : { query: query.trim() },
						limit: 200
					}).then((r) => setEntries([...r.entries ?? []])),
					client.globalList({ sessionId }).then((r) => setGlobals([...r.entries ?? []])),
					client.list({ sessionId }).then((r) => setIntroduced([...r.skills ?? []]))
				]).then(() => {
					setBusy(false);
				}).catch(() => {
					setError(true);
					setBusy(false);
				});
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [sessionId, query]);
			const visible = (0, react.useMemo)(() => entries ?? [], [entries]);
			const globalsList = (0, react.useMemo)(() => globals ?? [], [globals]);
			const introducedList = (0, react.useMemo)(() => introduced ?? [], [introduced]);
			/** 三区合并为 SkillItem[]（可用池条目为主，附 introduced 标记）。 */
			const poolItems = (0, react.useMemo)(() => visible.map((e) => ({
				name: e.name,
				description: e.description,
				tags: e.tags,
				...e.introduced ? { badge: "introduced" } : {}
			})), [visible]);
			const globalItems = (0, react.useMemo)(() => globalsList.map((g) => ({
				name: g.name,
				description: g.description,
				tags: g.tags,
				badge: "global"
			})), [globalsList]);
			const introducedItems = (0, react.useMemo)(() => introducedList.map((s) => ({
				name: s.name,
				description: s.description ?? "",
				tags: s.tags ?? [],
				badge: "introduced"
			})), [introducedList]);
			/**
			* 按 tags 分组（跨池统一）：一个技能有多个 tag 出现在多个组；无 tag 归「未分组」。
			* 返回 [tagKey, items][]，tagKey 为空串 = 未分组。
			*/
			const groupByTags = (items) => {
				const map = /* @__PURE__ */ new Map();
				for (const item of items) {
					const keys = item.tags.length === 0 ? [""] : [...item.tags];
					for (const key of keys) {
						const list = map.get(key);
						if (list === void 0) map.set(key, [item]);
						else if (!list.some((x) => x.name === item.name)) list.push(item);
					}
				}
				const groups = [...map.entries()].sort((a, b) => a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0]));
				for (const [, list] of groups) list.sort((a, b) => a.name.localeCompare(b.name));
				return groups;
			};
			const groupedPool = (0, react.useMemo)(() => groupByTags(poolItems), [poolItems, query]);
			const groupedGlobal = (0, react.useMemo)(() => groupByTags(globalItems), [globalItems]);
			const groupedIntroduced = (0, react.useMemo)(() => groupByTags(introducedItems), [introducedItems]);
			const toggleGroup = (key) => {
				setCollapsed((prev) => {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			};
			const openTag = (item) => {
				setTagFor(item.name);
				setTagText(item.tags.join(", "));
			};
			const closeTag = () => {
				setTagFor(null);
			};
			/** 统一执行面板写操作：busy 守卫 + 成功/失败提示 + 刷新。onOk 在 result.ok 时返回成功文案；afterOk 为可选成功副作用。 */
			const runAction = (action, onOk, afterOk) => {
				if (busy || client === void 0) return;
				setBusy(true);
				action().then((result) => {
					setBusy(false);
					if (result.ok) {
						setNotice({
							kind: "ok",
							text: onOk(result)
						});
						afterOk?.();
					} else setNotice({
						kind: "error",
						text: `${t("notice.failed")}: ${result.reason ?? ""}`
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
			const runSetTags = (name) => {
				const tags = tagText.split(",").map((s) => s.trim()).filter((s) => s !== "");
				runAction(() => client.setTags({
					sessionId,
					name,
					tags
				}), () => `${t("notice.tagged")}: ${name}`, closeTag);
			};
			const runIntroduce = (name) => {
				runAction(() => client.introduce({
					sessionId,
					name
				}), (result) => {
					const persist = result.persisted ? t("notice.persisted") : "";
					return result.alreadyIntroduced ? t("notice.already") : t("notice.introduced") + persist + (result.shadowed ? t("notice.shadow") : "");
				});
			};
			const runRemove = (name) => {
				runAction(() => client.removeSkill({
					sessionId,
					name
				}), () => t("notice.removed"));
			};
			/** 启用：可用池 → 全局激活池。 */
			const runActivate = (name) => {
				runAction(() => client.globalActivate({
					sessionId,
					name
				}), (result) => `${t("notice.activated")}: ${result.name}`);
			};
			/** 停用：全局激活池 → 可用池。 */
			const runDeactivate = (name) => {
				runAction(() => client.globalDeactivate({
					sessionId,
					name
				}), (result) => `${t("notice.deactivated")}: ${result.name}`);
			};
			const renderTagRow = (item) => {
				if (tagFor !== item.name) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshp-move",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dshp-detail-label",
							children: [t("tag.edit.label"), "："]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dshp-input dshp-move-new",
							placeholder: t("tag.edit.placeholder"),
							value: tagText,
							onChange: (event) => setTagText(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn dshp-btn-primary",
							disabled: busy,
							onClick: () => runSetTags(item.name),
							children: t("action.apply")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn",
							onClick: closeTag,
							children: t("action.cancel")
						})
					]
				});
			};
			/** 渲染一组（分组折叠 + 条目）。scope 用于隔离折叠状态：不同作用域的同名分组各自独立开关。 */
			const renderGroup = (scope, groups, actions) => {
				if (groups.length === 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshp-list",
					children: groups.map(([group, list]) => {
						const key = `${scope}:${group === "" ? "ungrouped" : group}`;
						const isCollapsed = collapsed.has(key);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshp-group",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "dshp-group-head",
								onClick: () => toggleGroup(key),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-group-caret",
										children: isCollapsed ? "▸" : "▾"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-group-name",
										children: group === "" ? t("group.ungrouped") : group
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dshp-group-count",
										children: [
											"（",
											list.length,
											"）"
										]
									})
								]
							}), !isCollapsed && list.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-item",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshp-item-head",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-name",
												children: item.name
											}),
											item.badge === "global" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-intro",
												children: t("global.active")
											}),
											item.badge === "introduced" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-intro",
												children: t("state.introduced")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "dshp-actions",
												children: [actions(item), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn",
													onClick: () => tagFor === item.name ? closeTag() : openTag(item),
													children: tagFor === item.name ? t("action.cancel") : t("action.tag")
												})]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dshp-desc",
										children: item.description
									}),
									renderTagRow(item)
								]
							}, item.name))]
						}, key);
					})
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshp-root",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-toolbar",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dshp-search",
							placeholder: t("search.placeholder"),
							value: query,
							onChange: (event) => setQuery(event.target.value)
						})
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
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-section-title",
							children: t("global.title")
						}),
						busy && globals === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("loading")
						}) : globalItems.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("global.empty")
						}) : renderGroup("global", groupedGlobal, (item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn dshp-btn-danger",
							onClick: () => runDeactivate(item.name),
							children: t("action.deactivate")
						})),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-section-title",
							children: t("pool.title")
						}),
						busy && entries === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("loading")
						}) : poolItems.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: query.trim().length > 0 ? t("list.empty") : t("pool.empty")
						}) : renderGroup("pool", groupedPool, (item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [item.badge === "introduced" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn dshp-btn-primary",
							onClick: () => runIntroduce(item.name),
							children: t("action.introduce")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn",
							onClick: () => runActivate(item.name),
							children: t("action.activate")
						})] })),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-section-title",
							children: t("introduced.title")
						}),
						busy && introduced === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("loading")
						}) : introducedItems.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("introduced.empty")
						}) : renderGroup("introduced", groupedIntroduced, (item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn dshp-btn-danger",
							onClick: () => runRemove(item.name),
							children: t("action.remove")
						}))
					] })
				]
			});
		}
		//#endregion
		//#region src/client/plugin-view.tsx
		/**
		* 面板「插件」页签（ADR-0008）：宿主组合层（进程级）管理，MCP 视同插件统一管理。
		* - 插件盘点：registry 组合行（core / patch / bundle）+ 白名单（会话 MCP），标注来源、运行状态、是否可启停。
		* - 统一启停：patch 行写 cordis.patch.yml（热）；bundle 行写 dsh.profile.bundles（冷，需重启）；
		*   mcp 行连接/断开会话（会话级）。核心与面板自身只读，禁止停。
		* - 新增插件：id + 包名表单（写一条 insert 行）。
		* - 新增 MCP：发现 DSH 已配置的 MCP，选中即加入管理（进白名单，成为会话 MCP 行）。
		* - MCP 行额外动作：检查（真连一次数工具）、删除（移出白名单、恢复全局）。
		* 数据走 HTTP 客户端（api.ts）。
		*/
		const SOURCE_LABEL = {
			core: "plugin.source.core",
			patch: "plugin.source.patch",
			bundle: "plugin.source.bundle",
			mcp: "plugin.source.mcp"
		};
		/** 用户可见状态收敛为 3 个：运行中 / 已停用 / 异常。 */
		const STATE_LABEL = {
			active: "plugin.state.active",
			stopped: "plugin.state.stopped",
			failed: "plugin.state.failed"
		};
		function stateKey(state) {
			if (state === 2) return "active";
			if (state === 3) return "failed";
			return "stopped";
		}
		/** stdio = 沙箱外受信代码，连接/检查前需显式确认（信任闸）。 */
		function confirmStdio(transport, t) {
			if (transport !== "stdio") return true;
			return window.confirm(t("mcp.trust.stdio"));
		}
		function SkillPanelPluginView(props) {
			const { sessionId, client, t } = props;
			const [plugins, setPlugins] = (0, react.useState)(null);
			const [discovered, setDiscovered] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [checking, setChecking] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [installOpen, setInstallOpen] = (0, react.useState)(false);
			const [installId, setInstallId] = (0, react.useState)("");
			const [installName, setInstallName] = (0, react.useState)("");
			const [mcpOpen, setMcpOpen] = (0, react.useState)(false);
			const [coreOpen, setCoreOpen] = (0, react.useState)(false);
			const [helpOpen, setHelpOpen] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const refresh = () => {
				if (client === void 0) return;
				setBusy(true);
				setError(false);
				client.pluginList({ sessionId }).then((r) => {
					setPlugins([...r.plugins ?? []]);
				}).catch(() => setError(true)).finally(() => setBusy(false));
			};
			const refreshDiscover = () => {
				if (client === void 0) return;
				client.mcpDiscover({ sessionId }).then((r) => {
					setDiscovered([...r.entries ?? []]);
				}).catch(() => {});
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [sessionId]);
			/** 统一执行面板写操作：busy 守卫 + 成功/失败提示 + 刷新。onOk 返回成功文案；afterOk 为成功副作用；failText 覆盖失败前缀（MCP 用 mcp.notice.failed）。 */
			const runAction = (action, onOk, opts) => {
				const failText = opts?.failText ?? t("notice.failed");
				if (busy || client === void 0) return;
				setBusy(true);
				action().then((result) => {
					setBusy(false);
					if (result.ok) {
						setNotice({
							kind: "ok",
							text: onOk(result)
						});
						opts?.afterOk?.();
					} else setNotice({
						kind: "error",
						text: `${failText}: ${result.reason ?? ""}`
					});
					refresh();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: `${failText}: ${String(e)}`
					});
				});
			};
			const runToggle = (entry, enabled) => {
				runAction(() => client.pluginToggle({
					sessionId,
					id: entry.id,
					enabled
				}), (r) => `${enabled ? t("plugin.notice.enabled") : t("plugin.notice.disabled")}: ${r.id}`);
			};
			const runInstall = () => {
				if (installId.trim() === "" || installName.trim() === "") return;
				runAction(() => client.pluginInstall({
					sessionId,
					id: installId.trim(),
					name: installName.trim()
				}), (r) => `${t("plugin.notice.installed")}: ${r.id}`, { afterOk: () => {
					setInstallOpen(false);
					setInstallId("");
					setInstallName("");
				} });
			};
			const runPromote = (entry) => {
				runAction(() => client.pluginPromote({
					sessionId,
					id: entry.id
				}), (r) => `${t("plugin.notice.promoted")}: ${r.id}`);
			};
			const runSelectMcp = (name) => {
				runAction(() => client.mcpSelect({
					sessionId,
					name
				}), (r) => `${t("mcp.notice.selected")}: ${r.entry.name}`, {
					afterOk: refreshDiscover,
					failText: t("mcp.notice.failed")
				});
			};
			const runCheck = (entry) => {
				if (busy || checking !== null || client === void 0) return;
				if (entry.mcp !== void 0 && !confirmStdio(entry.mcp.transport, t)) return;
				setChecking(entry.id);
				client.mcpCheck({
					sessionId,
					name: entry.id
				}).then((r) => {
					setChecking(null);
					if (r.ok) {
						if (r.toolCount > 0) setNotice({
							kind: "ok",
							text: `${t("mcp.check.ok")} ${r.toolCount}`
						});
						else setNotice({
							kind: "error",
							text: t("mcp.check.zero")
						});
					} else setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${r.reason}`
					});
					refresh();
				}).catch((e) => {
					setChecking(null);
					setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${String(e)}`
					});
				});
			};
			const runRemoveMcp = (entry) => {
				runAction(() => client.mcpRemove({
					sessionId,
					name: entry.id
				}), () => `${t("mcp.notice.removed")}: ${entry.id}`, {
					afterOk: refreshDiscover,
					failText: t("mcp.notice.failed")
				});
			};
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshp-root",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshp-empty",
					children: [
						t("error"),
						" ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn",
							onClick: refresh,
							children: t("retry")
						})
					]
				})
			});
			if (busy && plugins === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshp-root",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshp-empty",
					children: t("plugin.loading")
				})
			});
			const list = plugins ?? [];
			const core = list.filter((p) => p.source === "core");
			const managed = list.filter((p) => p.source !== "core");
			const q = query.trim().toLowerCase();
			const visibleManaged = q === "" ? managed : managed.filter((p) => p.id.toLowerCase().includes(q) || (p.packageName ?? "").toLowerCase().includes(q));
			const disc = discovered ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshp-root",
				children: [
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: notice.kind === "ok" ? "dshp-notice" : "dshp-notice dshp-notice-error",
						children: notice.text
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-toolbar",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dshp-search",
							placeholder: t("plugin.search.placeholder"),
							value: query,
							onChange: (event) => setQuery(event.target.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dshp-btn dshp-help",
							title: t("plugin.help"),
							onClick: () => setHelpOpen((o) => !o),
							children: helpOpen ? "×" : "?"
						})]
					}),
					helpOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-tips",
						children: t("plugin.tips")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-section-title",
						children: [t("plugin.inventory.title"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dshp-actions",
							style: { marginLeft: "auto" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dshp-btn",
								onClick: () => setInstallOpen((o) => !o),
								children: t("plugin.action.install")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dshp-btn",
								onClick: () => {
									setMcpOpen((o) => !o);
									if (!mcpOpen) refreshDiscover();
								},
								children: t("plugin.action.addMcp")
							})]
						})]
					}),
					installOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-form",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-form-title",
								children: t("plugin.install.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-field",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dshp-input",
									placeholder: t("plugin.install.id"),
									value: installId,
									onChange: (event) => setInstallId(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-field",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dshp-input",
									placeholder: t("plugin.install.name"),
									value: installName,
									onChange: (event) => setInstallName(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dshp-btn dshp-btn-primary",
									disabled: busy || installId.trim() === "" || installName.trim() === "",
									onClick: runInstall,
									children: t("plugin.action.install.confirm")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "dshp-btn",
									onClick: () => setInstallOpen(false),
									children: t("action.cancel")
								})]
							})
						]
					}),
					mcpOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-form",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-form-title",
								children: t("plugin.mcp.add.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-tips",
								children: t("plugin.mcp.add.hint")
							}),
							disc.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-empty",
								children: t("mcp.discover.empty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-list",
								children: disc.map((d) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshp-item-head",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-name",
												children: d.name
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag",
												children: d.transport === "stdio" ? t("mcp.transport.stdio") : t("mcp.transport.http")
											}),
											d.hasSecrets && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag",
												children: t("mcp.badge.secrets")
											}),
											d.globallyActive && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-eco",
												children: t("mcp.badge.global")
											}),
											d.managed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-intro",
												children: t("mcp.state.managed")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-actions",
												children: d.managed ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn dshp-btn-primary",
													onClick: () => runSelectMcp(d.name),
													disabled: busy,
													children: t("mcp.action.manage")
												})
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshp-desc",
										children: [d.transport === "stdio" ? d.command ?? "" : d.url ?? "", d.args !== void 0 && d.args.length > 0 ? ` ${JSON.stringify(d.args)}` : ""]
									})]
								}, d.name))
							})
						]
					}),
					visibleManaged.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: q !== "" ? t("list.empty") : t("plugin.inventory.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-list",
						children: visibleManaged.map((p) => {
							const sKey = stateKey(p.state);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-item",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-name",
											children: p.id
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sKey === "active" ? "dshp-tag dshp-tag-intro" : sKey === "failed" ? "dshp-tag dshp-tag-error" : "dshp-tag",
											children: t(STATE_LABEL[sKey])
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-actions",
											children: p.pendingRestart ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-eco",
												children: t("plugin.badge.restart")
											}) : p.manageable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
												p.source === "bundle" && p.active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn",
													onClick: () => runPromote(p),
													disabled: busy,
													children: t("plugin.action.promote")
												}),
												p.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn dshp-btn-danger",
													onClick: () => runToggle(p, false),
													disabled: busy,
													children: t("plugin.action.disable")
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn dshp-btn-primary",
													onClick: () => runToggle(p, true),
													disabled: busy,
													children: t("plugin.action.enable")
												}),
												p.source === "mcp" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn",
													onClick: () => runCheck(p),
													disabled: checking !== null,
													children: checking === p.id ? t("mcp.check.running") : t("mcp.action.check")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "dshp-btn dshp-btn-danger",
													onClick: () => runRemoveMcp(p),
													disabled: busy,
													children: t("mcp.action.remove")
												})] })
											] }) : null
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item-meta",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag",
											children: t(SOURCE_LABEL[p.source])
										}),
										p.mcp !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag dshp-tag-eco",
												children: p.mcp.serverName
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dshp-tag",
												children: p.mcp.transport === "stdio" ? t("mcp.transport.stdio") : t("mcp.transport.http")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: p.mcp.connected ? "dshp-tag dshp-tag-intro" : "dshp-tag",
												children: p.mcp.connected ? t("plugin.mcp.connected") : t("plugin.mcp.available")
											})
										] }) : p.packageName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag",
											children: p.packageName
										}),
										p.protected && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag dshp-tag-eco",
											children: t("plugin.badge.protected")
										})
									]
								})]
							}, `${p.id}:${p.state}`);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "dshp-group-head",
						onClick: () => setCoreOpen((o) => !o),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshp-group-caret",
								children: coreOpen ? "▾" : "▸"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshp-group-name",
								children: t("plugin.core.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dshp-group-count",
								children: [
									"（",
									core.length,
									"）"
								]
							})
						]
					}),
					coreOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-list",
						children: core.map((p) => {
							const sKey = stateKey(p.state);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dshp-item",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-name",
											children: p.id
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sKey === "active" ? "dshp-tag dshp-tag-intro" : "dshp-tag",
											children: t(STATE_LABEL[sKey])
										}),
										p.packageName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag",
											children: p.packageName
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dshp-tag dshp-tag-eco",
											children: t("plugin.badge.protected")
										})
									]
								})
							}, `core:${p.id}`);
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/sections.tsx
		/** 设置页「技能面板」节（settings.section，ADR-0007）：全功能管理页，作用于当前会话。
		*  ADR-0008：页签从「技能 / MCP」变为「技能 / 插件」——MCP 折叠进插件页签。 */
		function SkillPanelSettingsSection(props) {
			const { useSessions, client, t } = props;
			const [tab, setTab] = (0, react.useState)("skills");
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
						children: tab === "skills" ? t("page.subtitle") : t("plugin.subtitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-tabs",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: tab === "skills" ? "dshp-tab dshp-tab-active" : "dshp-tab",
							onClick: () => setTab("skills"),
							children: t("nav")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: tab === "plugins" ? "dshp-tab dshp-tab-active" : "dshp-tab",
							onClick: () => setTab("plugins"),
							children: t("plugin.nav")
						})]
					}),
					sessionId === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: t("no.session")
					}) : tab === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillPanelView, {
						sessionId,
						client,
						t
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillPanelPluginView, {
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
		/** 把传输层异常 fold 成统一业务失败形状。 */
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
				},
				setTags: async (request) => {
					try {
						return await post("setTags", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				globalList: (request) => post("globalList", request),
				globalActivate: async (request) => {
					try {
						return await post("globalActivate", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				globalDeactivate: async (request) => {
					try {
						return await post("globalDeactivate", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpList: (request) => post("mcpList", request),
				mcpConnect: async (request) => {
					try {
						return await post("mcpConnect", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpDisconnect: async (request) => {
					try {
						return await post("mcpDisconnect", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpWhitelist: (request) => post("mcpWhitelist", request),
				mcpUpsert: async (request) => {
					try {
						return await post("mcpUpsert", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpRemove: async (request) => {
					try {
						return await post("mcpRemove", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpDiscover: (request) => post("mcpDiscover", request),
				mcpSelect: async (request) => {
					try {
						return await post("mcpSelect", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				mcpCheck: async (request) => {
					try {
						return await post("mcpCheck", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				pluginList: (request) => post("pluginList", request),
				pluginToggle: async (request) => {
					try {
						return await post("pluginToggle", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				pluginInstall: async (request) => {
					try {
						return await post("pluginInstall", request);
					} catch (error) {
						return foldFail(error);
					}
				},
				pluginPromote: async (request) => {
					try {
						return await post("pluginPromote", request);
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
