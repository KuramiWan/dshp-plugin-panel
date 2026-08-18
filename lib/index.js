import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
//#region lib/types/pool.js
/**
* DSHP 池读取层（DSHP src/pool.ts 的可运行副本；规范源在 DSHP，本副本供 checkout 插件构建）。
* 目录扫描 / SKILL.md frontmatter 解析 / 信任校验；与 scripts/ecosystem-catalog.ps1 约定一致。
* 注意：Node 26 的 V8 不接受 (?m) 内联标志——逐行匹配，无内联标志。
*/
const NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/;
/**
* 读取 UTF-8 文本并剥离 BOM（真实池文件由 PowerShell 写入、常带 \uFEFF 头；
* 否则 frontmatter 正则匹配 ^--- 失败、JSON.parse 报 Unexpected token）。
*/
function readText(path) {
	try {
		return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
	} catch {
		return;
	}
}
/**
* DSH home 解析优先级（对齐 @deepseek-ai/dsh-home-paths resolveDshHome）：
* 显式配置 > `$DSH_HOME` > `~/.dsh`。空/纯空白的 `$DSH_HOME` 视为未设置。
* home 目录本身默认即 `~/.dsh`（`$DSH_HOME` 让位时直接是 `~/.dsh`），
* 技能池固定位于该 home 下的 `.skill-pool` 子目录。
*/
function defaultPoolRoot(env = process.env) {
	return join(env.DSH_HOME?.trim() || join(homedir(), ".dsh"), ".skill-pool");
}
/** 显式提供的 poolRoot 或默认根。 */
function resolvePoolRoot(poolRoot, env = process.env) {
	return poolRoot ?? defaultPoolRoot(env);
}
function isValidSkillName(name) {
	return NAME_PATTERN.test(name);
}
function parseSkillFile(raw) {
	const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (m === null || m[1] === void 0) return void 0;
	const fmText = m[1];
	const body = raw.slice(m[0].length);
	const lines = fmText.split(/\r?\n/);
	const scalar = (key) => {
		const re = new RegExp("^" + key + ":(\\s)*(.*)$");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === void 0) continue;
			const lm = line.match(re);
			if (lm === null) continue;
			const rest = (lm[2] ?? "").trim();
			if (/^[|>][-+]?$/.test(rest) || rest === "") {
				const parts = [];
				for (let j = i + 1; j < lines.length; j++) {
					const next = lines[j];
					if (next === void 0) continue;
					if (/^\s/.test(next)) parts.push(next.trim());
					else if (next.trim() === "") parts.push("");
					else break;
				}
				return parts.filter((p) => p !== "").join(" ");
			}
			if (/^"(.+)"$/.test(rest) || /^'(.+)'$/.test(rest)) return rest.slice(1, -1);
			return rest;
		}
	};
	const bool = (key) => {
		const re = new RegExp("^" + key + ":(\\s)*(true|false)");
		for (const line of lines) {
			const bm = line.match(re);
			if (bm !== null) return (bm[2] ?? "") === "true";
		}
	};
	return {
		fm: {
			name: scalar("name"),
			description: scalar("description"),
			whenToUse: scalar("whenToUse"),
			disableModel: bool("disable-model-invocation"),
			userInvocable: bool("user-invocable")
		},
		body
	};
}
function readTrust(poolRoot) {
	const path = join(poolRoot, ".trust.json");
	if (!existsSync(path)) return [];
	const text = readText(path);
	if (text === void 0) return [];
	try {
		const confirmed = JSON.parse(text)?.confirmed;
		return Array.isArray(confirmed) ? confirmed : [];
	} catch {
		return [];
	}
}
function readCatalogSources(poolRoot) {
	const path = join(poolRoot, ".catalog.json");
	if (!existsSync(path)) return {};
	const text = readText(path);
	if (text === void 0) return {};
	try {
		return JSON.parse(text)?.sources ?? {};
	} catch {
		return {};
	}
}
function trustedFor(poolRoot, entry) {
	if (entry.origin !== "ecosystem" || entry.source === void 0) return true;
	const repo = readCatalogSources(poolRoot)[entry.source]?.repo;
	return readTrust(poolRoot).some((c) => c.name === entry.name && (repo === void 0 || c.repo === repo));
}
function parseDir(poolRoot, dir, _name, origin, source) {
	const skillPath = join(dir, "SKILL.md");
	if (!existsSync(skillPath)) return void 0;
	const raw = readText(skillPath);
	if (raw === void 0) return void 0;
	const parsed = parseSkillFile(raw);
	if (parsed === void 0 || parsed.fm.name === void 0 || parsed.fm.description === void 0) return void 0;
	const base = {
		name: parsed.fm.name,
		description: parsed.fm.description,
		...parsed.fm.whenToUse === void 0 ? {} : { whenToUse: parsed.fm.whenToUse },
		modelInvocable: parsed.fm.disableModel !== true,
		userInvocable: parsed.fm.userInvocable !== false,
		origin,
		...source === void 0 ? {} : { source },
		directory: dir,
		available: true
	};
	return {
		...base,
		trusted: trustedFor(poolRoot, base)
	};
}
/** 扫描本地池与已订阅生态目录（磁盘真相）。 */
function listPoolEntries(poolRoot) {
	const entries = [];
	const localRoot = join(poolRoot, "local");
	if (existsSync(localRoot)) for (const dirent of readdirSync(localRoot, { withFileTypes: true })) {
		if (!dirent.isDirectory()) continue;
		const parsed = parseDir(poolRoot, join(localRoot, dirent.name), dirent.name, "local");
		if (parsed !== void 0) entries.push(parsed);
	}
	const ecoRoot = join(poolRoot, "ecosystem");
	if (existsSync(ecoRoot)) for (const source of readdirSync(ecoRoot, { withFileTypes: true })) {
		if (!source.isDirectory()) continue;
		const sourceRoot = join(ecoRoot, source.name);
		for (const dirent of readdirSync(sourceRoot, { withFileTypes: true })) {
			if (!dirent.isDirectory()) continue;
			const parsed = parseDir(poolRoot, join(sourceRoot, dirent.name), dirent.name, "ecosystem", source.name);
			if (parsed !== void 0) entries.push(parsed);
		}
	}
	return entries;
}
/** 生态目录（.catalog.json）中尚未订阅的条目：available=false。 */
function listUnsubscribedCatalogEntries(poolRoot) {
	const path = join(poolRoot, ".catalog.json");
	if (!existsSync(path)) return [];
	const text = readText(path);
	if (text === void 0) return [];
	try {
		const entries = JSON.parse(text)?.entries ?? [];
		const onDisk = new Set(listPoolEntries(poolRoot).map((e) => e.source + "/" + e.name));
		const result = [];
		for (const raw of entries) {
			if (raw.name === void 0 || raw.description === void 0) continue;
			if (onDisk.has(raw.source?.id + "/" + raw.name)) continue;
			result.push({
				name: raw.name,
				description: raw.description,
				modelInvocable: true,
				userInvocable: true,
				origin: "ecosystem",
				...raw.source?.id === void 0 ? {} : { source: raw.source.id },
				directory: "",
				available: false,
				trusted: false
			});
		}
		return result;
	} catch {
		return [];
	}
}
function findPoolEntry(poolRoot, name) {
	const all = [...listPoolEntries(poolRoot), ...listUnsubscribedCatalogEntries(poolRoot)];
	const local = all.find((e) => e.origin === "local" && e.name === name);
	if (local !== void 0) return local;
	return all.find((e) => e.origin === "ecosystem" && e.name === name);
}
function readSkillContent(entry) {
	if (!entry.available || entry.directory === "") return void 0;
	const skillPath = join(entry.directory, "SKILL.md");
	if (!existsSync(skillPath)) return void 0;
	const raw = readText(skillPath);
	if (raw === void 0) return void 0;
	const parsed = parseSkillFile(raw);
	if (parsed === void 0 || parsed.fm.name === void 0 || parsed.fm.description === void 0) return void 0;
	return {
		name: parsed.fm.name,
		description: parsed.fm.description,
		...parsed.fm.whenToUse === void 0 ? {} : { whenToUse: parsed.fm.whenToUse },
		modelInvocable: parsed.fm.disableModel !== true,
		userInvocable: parsed.fm.userInvocable !== false,
		content: parsed.body,
		directory: entry.directory
	};
}
//#endregion
//#region lib/types/actions.js
/** 生成池浏览条目列表（本地 + 已订阅生态 + 未订阅目录），标记 introduced 与 blockReason。 */
function browsePool(poolRoot, agent, store) {
	const introduced = new Set(store.names(agent));
	return [...listPoolEntries(poolRoot), ...listUnsubscribedCatalogEntries(poolRoot)].map((entry) => {
		const blockReason = !entry.available ? "未订阅" : entry.origin === "ecosystem" && !entry.trusted ? "生态来源未确认" : void 0;
		return {
			name: entry.name,
			origin: entry.origin,
			...entry.source === void 0 ? {} : { source: entry.source },
			description: entry.description,
			available: entry.available,
			introduced: introduced.has(entry.name),
			...blockReason === void 0 ? {} : { blockReason }
		};
	});
}
/** 关键词/来源过滤（命令与工具共用）。 */
function filterBrowse(items, opts = {}) {
	let result = items;
	if (opts.origin !== void 0) result = result.filter((item) => item.origin === opts.origin);
	if (opts.query !== void 0) {
		const q = opts.query.toLowerCase();
		result = result.filter((item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
	}
	return result;
}
/**
* 从池引入 skill 到当前会话（幂等；同名影子覆盖仅本会话）。
* 统一校验序列：名称 → 幂等 → 存在 → 订阅 → 信任 → 可读 → 注册。
*/
async function introduceSkill(ctx, poolRoot, store, agent, name) {
	if (!isValidSkillName(name)) return {
		ok: false,
		reason: `非法技能名 "${name}"`
	};
	if (store.disposer(agent, name) !== void 0) return {
		ok: true,
		name,
		origin: "local",
		shadowed: false,
		alreadyIntroduced: true
	};
	const entry = findPoolEntry(poolRoot, name);
	if (entry === void 0) return {
		ok: false,
		reason: `池中未找到 "${name}"`
	};
	if (!entry.available) return {
		ok: false,
		reason: "该技能尚未订阅（先运行生态目录构建脚本订阅到本地池）"
	};
	if (entry.origin === "ecosystem" && !entry.trusted) return {
		ok: false,
		reason: "生态来源未确认（重新订阅以记录信任）"
	};
	const def = readSkillContent(entry);
	if (def === void 0) return {
		ok: false,
		reason: `"${name}" 在池中不可读`
	};
	const skills = agent.ctx.get("skills");
	if (skills === void 0) return {
		ok: false,
		reason: "skills 服务不可用"
	};
	const shadowed = (await ctx.skills.list({ scope: agent })).some((skill) => skill.name === name);
	const dispose = skills.register({
		name: def.name,
		description: def.description,
		...def.whenToUse === void 0 ? {} : { whenToUse: def.whenToUse },
		invocation: {
			modelInvocable: def.modelInvocable,
			userInvocable: def.userInvocable
		},
		source: "dshp-session-skill",
		content: def.content,
		resourceBase: {
			kind: "directory",
			path: def.directory
		}
	});
	store.track(agent, name, dispose);
	return {
		ok: true,
		name,
		origin: entry.origin,
		shadowed,
		alreadyIntroduced: false
	};
}
/** 从当前会话移除（幂等；未引入时报错）。 */
function removeSkill(store, agent, name) {
	const dispose = store.disposer(agent, name);
	if (dispose === void 0) return {
		ok: false,
		reason: `"${name}" 未在本会话引入`
	};
	dispose();
	store.drop(agent, name);
	return {
		ok: true,
		name
	};
}
//#endregion
//#region lib/types/tools.js
function renderBrowse$1(items) {
	if (items.length === 0) return "no skills in pool";
	return items.map((item) => {
		const tag = item.origin === "local" ? "local" : "ecosystem:" + (item.source ?? "?");
		const state = item.introduced ? " [introduced]" : item.blockReason !== void 0 ? " [blocked]" : "";
		return "- " + item.name + " (" + tag + ")" + state + ": " + item.description;
	}).join("\n");
}
function applySessionSkillTools(ctx, config) {
	const poolRoot = config.poolRoot;
	const store = config.store;
	const agentOf = (exec) => {
		if (exec.agent === void 0) throw new Error("session_skill tools require a calling agent");
		return exec.agent;
	};
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_browse",
		description: "List skills available to introduce into this session from the local pool and subscribed ecosystem sources. Use this before session_skill_introduce to see what is available; unsubscribed ecosystem skills show as not subscribed.",
		parameters: {
			origin: {
				type: "string",
				enum: ["local", "ecosystem"],
				description: "Filter by origin."
			},
			query: {
				type: "string",
				description: "Optional keyword filter on name/description (case-insensitive)."
			},
			limit: {
				type: "number",
				description: "Maximum results (default 50)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { entries: {
					type: "array",
					items: { type: "json" }
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: renderBrowse$1(value.entries)
			}]
		},
		execute: async (args, exec) => {
			const items = filterBrowse(browsePool(poolRoot, agentOf(exec), store), {
				origin: args.origin,
				query: args.query
			});
			const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : 50;
			return { entries: items.slice(0, limit) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_search",
		description: "Search the pool (local + subscribed ecosystem + ecosystem catalog) for a skill by keyword in name or description.",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "Keyword to search for (case-insensitive)."
			},
			limit: {
				type: "number",
				description: "Maximum results (default 20)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { entries: {
					type: "array",
					items: { type: "json" }
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: renderBrowse$1(value.entries)
			}]
		},
		execute: async (args, exec) => {
			const items = filterBrowse(browsePool(poolRoot, agentOf(exec), store), { query: args.query });
			const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : 20;
			return { entries: items.slice(0, limit) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_list",
		description: "List the skills currently introduced into THIS session by session_skill_introduce. Introduced skills vanish when the session ends.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { skills: {
					type: "array",
					items: { type: "json" }
				} }
			},
			render: (_args, value) => {
				const skills = value.skills;
				if (skills.length === 0) return [{
					type: "text",
					text: "no skills introduced in this session"
				}];
				return [{
					type: "text",
					text: skills.map((s) => "- " + s.name + ": " + s.description).join("\n")
				}];
			}
		},
		execute: async (_args, exec) => {
			const agent = agentOf(exec);
			const names = store.names(agent);
			if (names.length === 0) return { skills: [] };
			const view = await ctx.skills.list({ scope: agent });
			return { skills: names.map((name) => {
				const match = view.find((skill) => skill.name === name);
				return {
					name,
					...match?.description === void 0 ? {} : { description: match.description }
				};
			}) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_introduce",
		description: "Introduce a skill from the pool into THIS session: it appears in this session skill catalog and can be loaded with the skill tool. Other sessions are unaffected; it disappears when the session ends. If the name already exists globally or in a preset, this session uses the introduced version (shadow override).",
		parameters: { name: {
			type: "string",
			required: true,
			description: "Skill name from session_skill_browse."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					introduced: {
						type: "boolean",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					origin: {
						type: "string",
						required: true
					},
					shadowed: { type: "boolean" },
					alreadyIntroduced: { type: "boolean" }
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.alreadyIntroduced) return [{
					type: "text",
					text: "skill \"" + v.name + "\" is already introduced in this session"
				}];
				const shadow = v.shadowed ? " (shadows a same-name skill from another layer for this session only)" : "";
				return [{
					type: "text",
					text: "introduced \"" + v.name + "\" (" + v.origin + ") into this session" + shadow
				}];
			}
		},
		execute: async (args, exec) => {
			const result = await introduceSkill(ctx, poolRoot, store, agentOf(exec), args.name);
			if (!result.ok) throw new Error(result.reason);
			return {
				introduced: true,
				name: result.name,
				origin: result.origin,
				...result.shadowed ? { shadowed: true } : {},
				...result.alreadyIntroduced ? { alreadyIntroduced: true } : {}
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_remove",
		description: "Remove a skill introduced into THIS session by session_skill_introduce: its catalog entry disappears on the next step. The pool file is untouched; other sessions are unaffected.",
		parameters: { name: {
			type: "string",
			required: true,
			description: "Skill name from session_skill_list."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					removed: {
						type: "boolean",
						required: true
					},
					name: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => {
				return [{
					type: "text",
					text: "removed \"" + value.name + "\" from this session"
				}];
			}
		},
		execute: async (args, exec) => {
			const result = removeSkill(store, agentOf(exec), args.name);
			if (!result.ok) throw new Error(result.reason);
			return {
				removed: true,
				name: result.name
			};
		}
	})));
}
//#endregion
//#region lib/types/commands.js
function renderBrowse(items) {
	if (items.length === 0) return "📚 技能池：无技能（先运行生态目录构建脚本填充本地池）";
	const lines = items.map((item) => {
		const tag = item.origin === "local" ? "local" : "ecosystem:" + (item.source ?? "?");
		const state = item.introduced ? " [已引入]" : item.blockReason !== void 0 ? " [不可用]" : "";
		return "  - " + item.name + " (" + tag + ")" + state + ": " + item.description;
	});
	return "📚 技能池（" + items.length + " 条）：\n" + lines.join("\n");
}
/** /skill-browse [local|ecosystem] [query] —— 池浏览。 */
function handlerBrowse(poolRoot, store, invocation) {
	const tokens = invocation.rawInput.trim().split(/\s+/).filter((token) => token.length > 0);
	let origin;
	let query;
	if (tokens[0] === "local" || tokens[0] === "ecosystem") {
		origin = tokens[0];
		if (tokens.length > 1) query = tokens.slice(1).join(" ");
	} else if (tokens.length > 0) query = tokens.join(" ");
	return {
		kind: "success",
		text: renderBrowse(filterBrowse(browsePool(poolRoot, invocation.agent, store), {
			origin,
			query
		}).slice(0, 50))
	};
}
/** /skill-search <query> —— 关键词搜索。 */
function handlerSearch(poolRoot, store, invocation) {
	const query = invocation.rawInput.trim();
	if (query.length === 0) return {
		kind: "error",
		text: "❌ 用法错误：/skill-search <关键词>"
	};
	const items = filterBrowse(browsePool(poolRoot, invocation.agent, store), { query });
	if (items.length === 0) return {
		kind: "success",
		text: "🔍 未找到与 \"" + query + "\" 匹配的技能"
	};
	return {
		kind: "success",
		text: "🔍 搜索结果（" + items.length + " 条）：\n" + renderBrowse(items.slice(0, 20))
	};
}
/** /skill-list —— 当前会话已引入清单。 */
async function handlerList(ctx, store, invocation) {
	const agent = invocation.agent;
	const names = store.names(agent);
	if (names.length === 0) return {
		kind: "success",
		text: "📋 当前会话已引入技能：0 个"
	};
	const view = await ctx.skills.list({ scope: agent });
	const lines = names.map((name) => {
		const match = view.find((skill) => skill.name === name);
		return "  - " + name + (match?.description === void 0 ? "" : ": " + match.description);
	});
	return {
		kind: "success",
		text: "📋 当前会话已引入技能（" + names.length + " 个）：\n" + lines.join("\n")
	};
}
/** /skill-introduce <name> —— 从池引入到当前会话（会话结束自动消失；同名影子覆盖本会话）。 */
async function handlerIntroduce(ctx, poolRoot, store, invocation) {
	const agent = invocation.agent;
	const name = invocation.rawInput.trim();
	if (name.length === 0) return {
		kind: "error",
		text: "❌ 用法错误：/skill-introduce <技能名>"
	};
	const result = await introduceSkill(ctx, poolRoot, store, agent, name);
	if (!result.ok) return {
		kind: "error",
		text: "❌ " + result.reason
	};
	if (result.alreadyIntroduced) return {
		kind: "success",
		text: "✅ \"" + result.name + "\" 已在本会话引入（幂等，无需重复）"
	};
	const shadow = result.shadowed ? "（影子覆盖：本会话使用引入版，其余会话不受影响）" : "";
	return {
		kind: "success",
		text: "✅ 已引入 \"" + result.name + "\"（" + result.origin + "）到当前会话" + shadow
	};
}
/** /skill-remove <name> —— 从当前会话移除（幂等，未引入时报错）。 */
function handlerRemove(store, invocation) {
	const agent = invocation.agent;
	const name = invocation.rawInput.trim();
	if (name.length === 0) return {
		kind: "error",
		text: "❌ 用法错误：/skill-remove <技能名>"
	};
	const result = removeSkill(store, agent, name);
	if (!result.ok) return {
		kind: "error",
		text: "❌ " + result.reason
	};
	return {
		kind: "success",
		text: "🗑 已移除 \"" + result.name + "\"（当前会话）"
	};
}
/** 注册五个 /skill-* 斜杠命令（全局，经 ctx.commands 供所有会话的 `/` 菜单发现）。 */
function applySessionSkillCommands(ctx, config) {
	const poolRoot = config.poolRoot;
	const store = config.store;
	ctx.effect(() => ctx.commands.register({
		name: "skill-browse",
		description: "list skills in the pool (local + subscribed ecosystem + catalog); optional [local|ecosystem] origin and keyword query",
		input: { hint: "[<origin>] [<query>]" },
		handler: (invocation) => handlerBrowse(poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-search",
		description: "search the pool for a skill by keyword in name or description",
		input: { hint: "<query>" },
		handler: (invocation) => handlerSearch(poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-list",
		description: "list skills introduced into this session",
		handler: (invocation) => handlerList(ctx, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-introduce",
		description: "introduce a pool skill into this session (vanishes when the session ends)",
		input: { hint: "<name>" },
		handler: (invocation) => handlerIntroduce(ctx, poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-remove",
		description: "remove a skill introduced into this session",
		input: { hint: "<name>" },
		handler: (invocation) => handlerRemove(store, invocation)
	}));
}
//#endregion
//#region lib/types/skill-panel-service.js
/** 面板 host 服务：只读为主；写操作与命令/工具同路径。 */
var SkillPanelService = class {
	static inject = ["agents", "skills"];
	ctx;
	poolRoot;
	store;
	constructor(ctx, options) {
		this.ctx = ctx;
		this.poolRoot = options.poolRoot;
		this.store = options.store;
		const webServer = ctx.get("webServer");
		if (webServer === void 0) return;
		ctx.effect(() => webServer.register({
			kind: "prefix",
			path: "/skill-panel",
			handler: (req, res) => void this.dispatch(req, res)
		}), "skill-panel: /skill-panel router");
	}
	agentOf(sessionId) {
		const agent = this.ctx.agents.get(sessionId);
		if (agent === void 0) throw new Error(`skillPanel: session "${sessionId}" is not a live agent`);
		return agent;
	}
	/** 路由分发：POST /skill-panel/<method>，body 为 JSON 载荷。 */
	async dispatch(req, res) {
		try {
			if (req.method !== "POST") {
				this.send(res, 405, {
					ok: false,
					reason: "method not allowed, use POST"
				});
				return;
			}
			const url = req.url ?? "/skill-panel/";
			const method = this.pathMethod(url);
			if (method === void 0) {
				this.send(res, 404, {
					ok: false,
					reason: "unknown endpoint"
				});
				return;
			}
			const body = await this.readBody(req);
			const payload = body.length === 0 ? {} : JSON.parse(body);
			let result;
			switch (method) {
				case "browse":
					result = this.browse(payload);
					break;
				case "list":
					result = await this.list(payload);
					break;
				case "detail":
					result = this.detail(payload);
					break;
				case "introduce":
					result = await this.introduce(payload);
					break;
				case "removeSkill":
					result = this.removeSkill(payload);
					break;
				default:
					this.send(res, 404, {
						ok: false,
						reason: `unknown method "${method}"`
					});
					return;
			}
			this.send(res, 200, result);
		} catch (error) {
			this.send(res, 400, {
				ok: false,
				reason: error instanceof Error ? error.message : String(error)
			});
		}
	}
	pathMethod(rawUrl) {
		const m = rawUrl.match(/^\/skill-panel\/([a-zA-Z_]+)\/?$/);
		return m === null ? void 0 : m[1];
	}
	readBody(req) {
		return new Promise((resolve, reject) => {
			const chunks = [];
			req.on("data", (chunk) => {
				chunks.push(chunk);
			});
			req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
			req.on("error", reject);
		});
	}
	send(res, status, data) {
		res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
		res.end(JSON.stringify(data));
	}
	/** 池浏览（本地 + 已订阅生态 + 未订阅目录），支持来源过滤与关键词。 */
	browse(request) {
		const agent = this.agentOf(request.sessionId);
		const items = filterBrowse(browsePool(this.poolRoot, agent, this.store), {
			origin: request.origin,
			query: request.query
		});
		const limit = typeof request.limit === "number" ? Math.max(1, Math.floor(request.limit)) : 100;
		return { entries: items.slice(0, limit) };
	}
	/** 当前会话已引入清单。 */
	async list(request) {
		const agent = this.agentOf(request.sessionId);
		const names = this.store.names(agent);
		if (names.length === 0) return { skills: [] };
		const view = await this.ctx.skills.list({ scope: agent });
		return { skills: names.map((name) => {
			const match = view.find((skill) => skill.name === name);
			return {
				name,
				...match?.description === void 0 ? {} : { description: match.description }
			};
		}) };
	}
	/** 单个技能的完整定义（名称/来源/说明/适用场景/正文）。 */
	detail(request) {
		const entry = findPoolEntry(this.poolRoot, request.name);
		if (entry === void 0) return {
			ok: false,
			reason: `池中未找到 "${request.name}"`
		};
		const def = readSkillContent(entry);
		if (def === void 0) return {
			ok: false,
			reason: `"${request.name}" 在池中不可读`
		};
		return {
			ok: true,
			name: def.name,
			origin: entry.origin,
			...entry.source === void 0 ? {} : { source: entry.source },
			description: def.description,
			...def.whenToUse === void 0 ? {} : { whenToUse: def.whenToUse },
			content: def.content
		};
	}
	/** 从池引入到当前会话（幂等；同名影子覆盖仅本会话）。 */
	async introduce(request) {
		const agent = this.agentOf(request.sessionId);
		const result = await introduceSkill(this.ctx, this.poolRoot, this.store, agent, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name,
			origin: result.origin,
			shadowed: result.shadowed,
			alreadyIntroduced: result.alreadyIntroduced
		};
	}
	/** 从当前会话移除（幂等；未引入时报错）。方法名避开 RemoteNamespaceService 保留名（remove 冲突）。 */
	removeSkill(request) {
		const agent = this.agentOf(request.sessionId);
		const result = removeSkill(this.store, agent, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name
		};
	}
};
//#endregion
//#region lib/types/handles.js
var SessionSkillStore = class {
	introduced = /* @__PURE__ */ new WeakMap();
	/** 当前会话已引入的 skill 名清单。 */
	names(agent) {
		const map = this.introduced.get(agent);
		return map === void 0 ? [] : [...map.keys()];
	}
	/** 获取某 agent+name 的 disposer（未引入返回 undefined）。 */
	disposer(agent, name) {
		return this.introduced.get(agent)?.get(name);
	}
	/** 记录 disposer（幂等：同名覆盖）。 */
	track(agent, name, dispose) {
		let map = this.introduced.get(agent);
		if (map === void 0) {
			map = /* @__PURE__ */ new Map();
			this.introduced.set(agent, map);
		}
		map.set(name, dispose);
	}
	/** 摘除记录（disposer 由调用方先行执行）。 */
	drop(agent, name) {
		this.introduced.get(agent)?.delete(name);
	}
};
//#endregion
//#region lib/types/index.js
/** 纯 host 插件（服务/RPC + 工具 + 命令）：挂载后为所有会话提供三面管理入口，操作维度仍按会话。 */
var SkillControlPlugin = class {
	static inject = [
		"agents",
		"tools",
		"skills",
		"commands"
	];
	static Config = z.object({ poolRoot: z.string() });
	store = new SessionSkillStore();
	constructor(ctx, config = {}) {
		const poolRoot = resolvePoolRoot(config.poolRoot);
		applySessionSkillTools(ctx, {
			poolRoot,
			store: this.store
		});
		applySessionSkillCommands(ctx, {
			poolRoot,
			store: this.store
		});
		ctx.plugin(SkillPanelService, {
			poolRoot,
			store: this.store
		});
	}
};
//#endregion
export { SkillControlPlugin, SkillControlPlugin as default };
