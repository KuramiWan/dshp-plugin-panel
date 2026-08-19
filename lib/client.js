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
			"page.subtitle": "池 = 你自管的唯一内容源（~/.dsh/.skill-pool/local/，放文件即加入管理）。从池引入/移除到当前会话；会话引入集持久，宿主重启后自动恢复。与 /skill-* 命令、session_skill_* 工具共享同一份状态。",
			"search.placeholder": "搜索技能名称或描述…",
			"pool.title": "池（用户自管内容）",
			"group.ungrouped": "未分组",
			"introduced.title": "本会话已引入",
			"introduced.empty": "本会话还没有引入任何技能",
			"list.empty": "没有匹配的技能",
			"pool.empty": "技能池为空（把含 SKILL.md 的目录放进 ~/.dsh/.skill-pool/local/ 即加入管理）",
			"state.introduced": "已引入",
			"action.introduce": "引入",
			"action.remove": "移除",
			"action.detail": "详情",
			"action.collapse": "收起",
			"action.group": "分组",
			"action.apply": "应用",
			"action.cancel": "取消",
			"group.move.label": "移动到分组",
			"group.move.none": "（无分组）",
			"group.move.new": "新建分组…",
			"group.move.newPlaceholder": "新分组名",
			"group.move.needName": "请输入新分组名",
			"notice.moved": "已移动到分组",
			"notice.moved.out": "已移出分组（顶层）",
			"detail.when": "适用场景",
			"detail.content": "正文",
			"notice.introduced": "已引入到当前会话",
			"notice.persisted": "（会话引入集已记录，重启后自动恢复）",
			"notice.removed": "已从当前会话移除（池文件与全局技能不受影响）",
			"notice.shadow": "（影子覆盖：本会话使用引入版）",
			"notice.already": "已在本会话引入",
			"notice.failed": "操作失败",
			"no.session": "当前没有会话——先打开一个会话，面板即作用于它。",
			"loading": "加载中…",
			"error": "加载失败",
			"retry": "重试",
			"mcp.nav": "MCP",
			"mcp.subtitle": "会话级临时 MCP：从白名单连接/断开 server，其工具仅对当前会话可见（会话结束即断）。与 session_mcp_* 工具共享同一状态。",
			"mcp.tips": "这里【发现】DSH 组合里已配置的 MCP；点「加入管理」把它纳入会话级白名单，之后可对本会话连接/断开、并做兼容检查。本面板不创建/配置 MCP——配置由创造模式或你自己完成。",
			"mcp.empty": "尚未把任何 MCP 加入管理——在下方「发现」里选择要管理的已配置 MCP。",
			"mcp.discover.title": "发现（DSH 已配置的 MCP）",
			"mcp.discover.empty": "组合中没有已配置的 MCP 插件。",
			"mcp.managed.title": "已管理（会话级白名单）",
			"mcp.action.manage": "加入管理",
			"mcp.action.check": "检查",
			"mcp.check.running": "检查中…",
			"mcp.check.ok": "兼容 ✓：可用工具数 =",
			"mcp.state.managed": "已管理",
			"mcp.badge.secrets": "含私密配置",
			"mcp.badge.global": "全局启用",
			"mcp.notice.selected": "已加入管理",
			"mcp.loading": "加载中…",
			"mcp.state.connected": "已连接",
			"mcp.state.available": "可连接",
			"mcp.action.connect": "连接",
			"mcp.action.disconnect": "断开",
			"mcp.action.add": "添加候选",
			"mcp.action.save": "保存",
			"mcp.action.cancel": "取消",
			"mcp.action.remove": "删除",
			"mcp.form.name": "名称",
			"mcp.form.transport": "传输",
			"mcp.form.command": "命令",
			"mcp.form.args": "参数（JSON 数组）",
			"mcp.form.url": "URL",
			"mcp.form.description": "说明",
			"mcp.form.env": "环境变量（每行 KEY=value，只写不回显）",
			"mcp.form.headers": "请求头（每行 KEY=value，只写不回显）",
			"mcp.form.env.keep": "留空 = 保持已保存值不变；输入新行 = 整体覆盖。",
			"mcp.trust.stdio": "警告：该 stdio server 会在沙箱外以宿主权限运行第三方代码（可读文件 / 联网）。确定继续？",
			"mcp.notice.connected": "已连接",
			"mcp.notice.disconnected": "已断开",
			"mcp.notice.saved": "白名单已更新",
			"mcp.notice.removed": "候选已删除",
			"mcp.notice.failed": "操作失败",
			"mcp.transport.stdio": "stdio",
			"mcp.transport.http": "Streamable HTTP"
		};
		const en = {
			"nav": "Skill Panel",
			"page.title": "Skill Panel",
			"page.subtitle": "The pool is your only self-managed content source (~/.dsh/.skill-pool/local/ — drop files in to add a skill). Introduce/remove skills for the current session; the session introduce-set is persisted and restored automatically when this session resumes after a host restart. Shares one state with /skill-* commands and session_skill_* tools.",
			"search.placeholder": "Search skill name or description…",
			"pool.title": "Pool (self-managed content)",
			"group.ungrouped": "Ungrouped",
			"introduced.title": "Introduced in this session",
			"introduced.empty": "No skills introduced in this session yet",
			"list.empty": "No matching skills",
			"pool.empty": "The pool is empty (drop a directory with SKILL.md into ~/.dsh/.skill-pool/local/ to manage it)",
			"state.introduced": "Introduced",
			"action.introduce": "Introduce",
			"action.remove": "Remove",
			"action.detail": "Details",
			"action.collapse": "Collapse",
			"action.group": "Group",
			"action.apply": "Apply",
			"action.cancel": "Cancel",
			"group.move.label": "Move to group",
			"group.move.none": "(no group)",
			"group.move.new": "New group…",
			"group.move.newPlaceholder": "new group name",
			"group.move.needName": "Enter a name for the new group",
			"notice.moved": "Moved to group",
			"notice.moved.out": "Moved out of groups (top level)",
			"detail.when": "When to use",
			"detail.content": "Content",
			"notice.introduced": "Introduced into this session",
			"notice.persisted": " (introduce-set recorded, restored on session resume)",
			"notice.removed": "Removed from this session (pool file and global skills untouched)",
			"notice.shadow": " (shadows a same-name skill for this session only)",
			"notice.already": "Already introduced in this session",
			"notice.failed": "Operation failed",
			"no.session": "No current session — open one first; the panel acts on it.",
			"loading": "Loading…",
			"error": "Failed to load",
			"retry": "Retry",
			"mcp.nav": "MCP",
			"mcp.subtitle": "Session-scoped temporary MCP: connect/disconnect servers from the whitelist; their tools are visible only to this session (disconnected when the session ends). Shares one state with session_mcp_* tools.",
			"mcp.tips": "DISCOVER MCP servers already configured in the DSH composition here; click \"Manage\" to admit one into the session-scoped whitelist, then connect/disconnect it for this session and run compatibility checks. This panel does not create/configure MCP — configuration is done by the creative mode or by you.",
			"mcp.empty": "Nothing is under management yet — pick a configured MCP from the Discovery section below.",
			"mcp.discover.title": "Discovery (configured MCPs in DSH)",
			"mcp.discover.empty": "No MCP plugins are configured in the composition.",
			"mcp.managed.title": "Managed (session-scoped whitelist)",
			"mcp.action.manage": "Manage",
			"mcp.action.check": "Check",
			"mcp.check.running": "Checking…",
			"mcp.check.ok": "Compatible ✓: usable tools =",
			"mcp.state.managed": "Managed",
			"mcp.badge.secrets": "has secrets",
			"mcp.badge.global": "global",
			"mcp.notice.selected": "Now managed",
			"mcp.loading": "Loading…",
			"mcp.state.connected": "Connected",
			"mcp.state.available": "Available",
			"mcp.action.connect": "Connect",
			"mcp.action.disconnect": "Disconnect",
			"mcp.action.add": "Add candidate",
			"mcp.action.save": "Save",
			"mcp.action.cancel": "Cancel",
			"mcp.action.remove": "Remove",
			"mcp.form.name": "Name",
			"mcp.form.transport": "Transport",
			"mcp.form.command": "Command",
			"mcp.form.args": "Args (JSON array)",
			"mcp.form.url": "URL",
			"mcp.form.description": "Description",
			"mcp.form.env": "Environment (one KEY=value per line, write-only, never echoed back)",
			"mcp.form.headers": "Headers (one KEY=value per line, write-only, never echoed back)",
			"mcp.form.env.keep": "Leave empty to keep the saved value; enter new lines to replace it entirely.",
			"mcp.trust.stdio": "Warning: this stdio server runs third-party code as trusted host-level process (can read files / use the network), outside the agent sandbox. Continue?",
			"mcp.notice.connected": "Connected",
			"mcp.notice.disconnected": "Disconnected",
			"mcp.notice.saved": "Whitelist updated",
			"mcp.notice.removed": "Candidate removed",
			"mcp.notice.failed": "Operation failed",
			"mcp.transport.stdio": "stdio",
			"mcp.transport.http": "Streamable HTTP"
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
.dshp-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);flex:0 0 auto}
.dshp-tag{font-size:11px;line-height:16px;padding:0 6px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 14%,transparent);color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-tag-eco{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshp-tag-intro{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706)}
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
		* 技能面板共享视图：两区布局（对齐 MCP 页签「发现 + 已管理」）——
		* 「池（用户自管内容：引入 / 详情）」+「本会话已引入（移除）」。
		* 池 = local 全量，按分组折叠展示（local/<group>/<skill>/ 归组，顶层技能归「未分组」）；
		* 分组只影响展示，不影响引入的会话语义；引入集持久，重启后自动恢复。
		* 数据走 HTTP 客户端（api.ts，相对路径 fetch）。
		*/
		/** 展示分组键：有分组用其名，无分组用空串（渲染为「未分组」）。 */
		function groupKey(entry) {
			return entry.group ?? "";
		}
		function SkillPanelView(props) {
			const { sessionId, client, t } = props;
			const [entries, setEntries] = (0, react.useState)(null);
			const [introduced, setIntroduced] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const [openDetail, setOpenDetail] = (0, react.useState)(null);
			const [detail, setDetail] = (0, react.useState)(null);
			const [collapsed, setCollapsed] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [moveFor, setMoveFor] = (0, react.useState)(null);
			const [moveGroup, setMoveGroup] = (0, react.useState)("");
			const [moveNew, setMoveNew] = (0, react.useState)("");
			const [moveIsNew, setMoveIsNew] = (0, react.useState)(false);
			const refresh = () => {
				if (client === void 0) return;
				setBusy(true);
				setError(false);
				Promise.all([client.browse({
					sessionId,
					...query.trim().length === 0 ? {} : { query: query.trim() },
					limit: 200
				}).then((r) => setEntries([...r.entries ?? []])), client.list({ sessionId }).then((r) => setIntroduced([...r.skills ?? []]))]).then(() => {
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
			const introducedList = (0, react.useMemo)(() => introduced ?? [], [introduced]);
			/** 按分组键排序后的 [group, entries[]] 列表（组间按组名，组内按技能名）。 */
			const grouped = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const entry of visible) {
					const key = groupKey(entry);
					const list = map.get(key);
					if (list === void 0) map.set(key, [entry]);
					else list.push(entry);
				}
				const groups = [...map.entries()].sort((a, b) => a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0]));
				for (const [, list] of groups) list.sort((a, b) => a.name.localeCompare(b.name));
				return groups;
			}, [visible]);
			const toggleGroup = (key) => {
				setCollapsed((prev) => {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			};
			/** 已有分组名（去重、含未分组以外的全部命名组）。 */
			const existingGroups = (0, react.useMemo)(() => {
				const set = /* @__PURE__ */ new Set();
				for (const entry of visible) if (entry.group !== void 0 && entry.group !== "") set.add(entry.group);
				return [...set].sort((a, b) => a.localeCompare(b));
			}, [visible]);
			const openMove = (entry) => {
				setMoveFor(entry.name);
				setMoveGroup(entry.group ?? "");
				setMoveNew("");
				setMoveIsNew(false);
			};
			const closeMove = () => {
				setMoveFor(null);
				setMoveIsNew(false);
			};
			const runMove = (name) => {
				if (busy || client === void 0) return;
				const target = moveIsNew ? moveNew.trim() : moveGroup;
				if (moveIsNew && target === "") {
					setNotice({
						kind: "error",
						text: t("group.move.needName")
					});
					return;
				}
				setBusy(true);
				client.moveSkill({
					sessionId,
					name,
					...target === "" ? {} : { group: target }
				}).then((result) => {
					setBusy(false);
					if (result.ok) {
						setNotice({
							kind: "ok",
							text: target === "" ? t("notice.moved.out") : `${t("notice.moved")}: ${result.group ?? target}`
						});
						closeMove();
					} else setNotice({
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
			const runIntroduce = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.introduce({
					sessionId,
					name
				}).then((result) => {
					setBusy(false);
					if (result.ok) {
						const persist = result.persisted ? t("notice.persisted") : "";
						setNotice({
							kind: "ok",
							text: result.alreadyIntroduced ? t("notice.already") : t("notice.introduced") + persist + (result.shadowed ? t("notice.shadow") : "")
						});
					} else setNotice({
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
							children: t("pool.title")
						}),
						busy && entries === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("loading")
						}) : visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: query.trim().length > 0 ? t("list.empty") : t("pool.empty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-list",
							children: grouped.map(([group, list]) => {
								const key = group === "" ? "ungrouped" : group;
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
									}), !isCollapsed && list.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dshp-item",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dshp-item-head",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dshp-name",
														children: entry.name
													}),
													entry.introduced && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "dshp-tag dshp-tag-intro",
														children: t("state.introduced")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "dshp-actions",
														children: [
															entry.introduced ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																className: "dshp-btn dshp-btn-primary",
																onClick: () => runIntroduce(entry.name),
																children: t("action.introduce")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																className: "dshp-btn",
																onClick: () => toggleDetail(entry.name),
																children: openDetail === entry.name ? t("action.collapse") : t("action.detail")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																className: "dshp-btn",
																onClick: () => moveFor === entry.name ? closeMove() : openMove(entry),
																children: moveFor === entry.name ? t("action.cancel") : t("action.group")
															})
														]
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "dshp-desc",
												children: entry.description
											}),
											moveFor === entry.name && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "dshp-move",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "dshp-detail-label",
														children: [t("group.move.label"), "："]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
														className: "dshp-select",
														value: moveIsNew ? "__new__" : moveGroup,
														onChange: (event) => {
															const value = event.target.value;
															if (value === "__new__") {
																setMoveIsNew(true);
																setMoveNew("");
															} else {
																setMoveIsNew(false);
																setMoveNew("");
																setMoveGroup(value);
															}
														},
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "",
																children: t("group.move.none")
															}),
															existingGroups.map((g) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: g,
																children: g
															}, g)),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "__new__",
																children: t("group.move.new")
															})
														]
													}),
													moveIsNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														className: "dshp-input dshp-move-new",
														placeholder: t("group.move.newPlaceholder"),
														value: moveNew,
														onChange: (event) => setMoveNew(event.target.value)
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														className: "dshp-btn dshp-btn-primary",
														disabled: busy,
														onClick: () => runMove(entry.name),
														children: t("action.apply")
													})
												]
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
									}, entry.name))]
								}, key);
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-section-title",
							children: t("introduced.title")
						}),
						busy && introduced === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("loading")
						}) : introducedList.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-empty",
							children: t("introduced.empty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshp-list",
							children: introducedList.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-item",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dshp-item-head",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-name",
										children: skill.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-actions",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dshp-btn dshp-btn-danger",
											onClick: () => runRemove(skill.name),
											children: t("action.remove")
										})
									})]
								}), skill.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dshp-desc",
									children: skill.description
								})]
							}, skill.name))
						})
					] })
				]
			});
		}
		//#endregion
		//#region src/client/mcp-view.tsx
		/**
		* 面板 MCP 页签（发现与兼容；会话级临时 MCP 管理）。
		* 本插件不创建/配置 MCP：只【发现】DSH 组合里已配置好的 MCP，用户【选择】把哪些
		* 加入我们的管理白名单，然后对已管理的做【会话级连接/断开】与【兼容检查】。
		* - 发现：从 cordis registry 枚举 mcp-client 插件（脱敏，env/headers 只揭示存在性）。
		* - 选择：把某个已配置 MCP 复制进白名单（服务端含 secrets，不经前端）。
		* - 管理：连接（agent.ctx，仅本会话可见）/ 断开 / 检查（真连一次数工具）。
		* 数据走 HTTP 客户端（api.ts），无任何 authoring 表单。
		*/
		/** stdio = 沙箱外受信代码，连接/检查前需显式确认（信任闸）。 */
		function confirmStdio(transport, t) {
			if (transport !== "stdio") return true;
			return window.confirm(t("mcp.trust.stdio"));
		}
		function SkillPanelMcpView(props) {
			const { sessionId, client, t } = props;
			const [discovered, setDiscovered] = (0, react.useState)(null);
			const [managed, setManaged] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [checking, setChecking] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const refresh = () => {
				if (client === void 0) return;
				setBusy(true);
				setError(false);
				Promise.all([client.mcpDiscover({ sessionId }).then((r) => setDiscovered([...r.entries ?? []])), client.mcpList({ sessionId }).then((r) => setManaged([...r.entries ?? []]))]).catch(() => setError(true)).finally(() => setBusy(false));
			};
			(0, react.useEffect)(() => {
				refresh();
			}, [sessionId]);
			const runSelect = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.mcpSelect({
					sessionId,
					name
				}).then((r) => {
					setBusy(false);
					if (r.ok) setNotice({
						kind: "ok",
						text: `${t("mcp.notice.selected")}: ${r.entry.name}`
					});
					else setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${r.reason}`
					});
					refresh();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${String(e)}`
					});
				});
			};
			const runConnect = (name, transport) => {
				if (busy || client === void 0) return;
				if (!confirmStdio(transport, t)) return;
				setBusy(true);
				client.mcpConnect({
					sessionId,
					name
				}).then((r) => {
					setBusy(false);
					if (r.ok) setNotice({
						kind: "ok",
						text: r.alreadyConnected ? `${t("mcp.state.connected")}: ${name}` : `${t("mcp.notice.connected")}: ${name}`
					});
					else setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${r.reason}`
					});
					refresh();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${String(e)}`
					});
				});
			};
			const runDisconnect = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.mcpDisconnect({
					sessionId,
					name
				}).then((r) => {
					setBusy(false);
					if (r.ok) setNotice({
						kind: "ok",
						text: `${t("mcp.notice.disconnected")}: ${name}`
					});
					else setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${r.reason}`
					});
					refresh();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${String(e)}`
					});
				});
			};
			const runRemove = (name) => {
				if (busy || client === void 0) return;
				setBusy(true);
				client.mcpRemove({
					sessionId,
					name
				}).then((r) => {
					setBusy(false);
					if (r.ok) setNotice({
						kind: "ok",
						text: `${t("mcp.notice.removed")}: ${name}`
					});
					else setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${r.reason}`
					});
					refresh();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "error",
						text: `${t("mcp.notice.failed")}: ${String(e)}`
					});
				});
			};
			const runCheck = (name, transport) => {
				if (busy || checking !== null || client === void 0) return;
				if (!confirmStdio(transport, t)) return;
				setChecking(name);
				client.mcpCheck({
					sessionId,
					name
				}).then((r) => {
					setChecking(null);
					if (r.ok) setNotice({
						kind: "ok",
						text: `${t("mcp.check.ok")} ${r.toolCount}`
					});
					else setNotice({
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
			if (busy && discovered === null && managed === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshp-root",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshp-empty",
					children: t("mcp.loading")
				})
			});
			const disc = discovered ?? [];
			const man = managed ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshp-root",
				children: [
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: notice.kind === "ok" ? "dshp-notice" : "dshp-notice dshp-notice-error",
						children: notice.text
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-tips",
						children: t("mcp.tips")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-section-title",
						children: t("mcp.discover.title")
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
											onClick: () => runSelect(d.name),
											children: t("mcp.action.manage")
										})
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-desc",
								children: [d.transport === "stdio" ? d.command ?? "" : d.url ?? "", d.args !== void 0 && d.args.length > 0 ? ` ${JSON.stringify(d.args)}` : ""]
							})]
						}, d.name))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-section-title",
						children: t("mcp.managed.title")
					}),
					man.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: t("mcp.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-list",
						children: man.map((e) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dshp-item",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-item-head",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-name",
										children: e.name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: e.connected ? "dshp-tag dshp-tag-intro" : "dshp-tag",
										children: e.connected ? t("mcp.state.connected") : t("mcp.state.available")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dshp-tag dshp-tag-eco",
										children: e.transport === "stdio" ? t("mcp.transport.stdio") : t("mcp.transport.http")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dshp-actions",
										children: [
											e.connected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn dshp-btn-danger",
												onClick: () => runDisconnect(e.name),
												children: t("mcp.action.disconnect")
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn dshp-btn-primary",
												onClick: () => runConnect(e.name, e.transport),
												disabled: busy,
												children: t("mcp.action.connect")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn",
												onClick: () => runCheck(e.name, e.transport),
												disabled: checking !== null,
												children: checking === e.name ? t("mcp.check.running") : t("mcp.action.check")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dshp-btn dshp-btn-danger",
												onClick: () => runRemove(e.name),
												children: t("mcp.action.remove")
											})
										]
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dshp-desc",
								children: [e.transport === "stdio" ? e.command ?? "" : e.url ?? "", e.args !== void 0 && e.args.length > 0 ? ` ${JSON.stringify(e.args)}` : ""]
							})]
						}, e.name))
					})
				]
			});
		}
		//#endregion
		//#region src/client/sections.tsx
		/** 设置页「技能面板」节（settings.section，ADR-0007）：全功能管理页，作用于当前会话。 */
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
						children: t("page.subtitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshp-tabs",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: tab === "skills" ? "dshp-tab dshp-tab-active" : "dshp-tab",
							onClick: () => setTab("skills"),
							children: t("nav")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: tab === "mcp" ? "dshp-tab dshp-tab-active" : "dshp-tab",
							onClick: () => setTab("mcp"),
							children: t("mcp.nav")
						})]
					}),
					sessionId === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshp-empty",
						children: t("no.session")
					}) : tab === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillPanelView, {
						sessionId,
						client,
						t
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillPanelMcpView, {
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
				moveSkill: async (request) => {
					try {
						return await post("moveSkill", request);
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
