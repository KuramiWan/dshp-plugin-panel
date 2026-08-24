import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { dump, load } from "js-yaml";
import { apply, inject } from "@deepseek-ai/dsh-mcp-client";
//#region src/pool.ts
/**
* DSHP 池读取层（规范源 standalone src/pool.ts；DSHP 的 plugin/dshp-skill-panel/src 为只读镜像）。
* 目录扫描 / SKILL.md frontmatter 解析。池 = 用户自管的唯一内容源：`local/` 下每个含 SKILL.md
* 的目录即一份技能（放文件 = 加入管理），无订阅/生态/目录缓存/信任概念。
* 分组（2026-08-19）：统一用技能自身 frontmatter 的 `tags` 字段，三池（全局激活 / 可用池 /
* 会话引入）共享；目录结构只作存放位置（兼容 `local/<group>/<skill>/` 旧布局，但不作分组展示）。
* 注意：Node 26 的 V8 不接受 (?m) 内联标志——逐行匹配，无内联标志。
*/
const NAME_PATTERN = /^[a-z0-9][a-z0-9-_.]*$/;
const GROUP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_. ]{0,31}$/;
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
	const home = env.DSH_HOME?.trim() || join(homedir(), ".dsh");
	return join(home, ".skill-pool");
}
/** 显式提供的 poolRoot 或默认根。 */
function resolvePoolRoot(poolRoot, env = process.env) {
	return poolRoot ?? defaultPoolRoot(env);
}
/**
* user-dsh 全局技能根（默认 ~/.dsh/skills，$DSH_HOME 优先）：DSH 官方 skill-filesystem
* 启动时扫描的进程级层，所有会话自动可见。本插件把它作为「全局激活池」——可管理
* （启用/停用 = 与池 local/ 之间移动目录），但默认只扫描展示、不动现有内容。
*/
function defaultGlobalSkillsRoot(env = process.env) {
	const home = env.DSH_HOME?.trim() || join(homedir(), ".dsh");
	return join(home, "skills");
}
/**
* 扫描 user-dsh 全局激活池（磁盘真相）：`~/.dsh/skills/` 下每个含 SKILL.md 的目录。
* 不递归（官方层无子目录布局）；目录名即技能名（无 frontmatter 也返回，靠目录名兜底）。
*/
function listGlobalEntries(root) {
	const entries = [];
	if (!existsSync(root)) return entries;
	for (const dirent of readdirSync(root, { withFileTypes: true })) {
		if (!dirent.isDirectory()) continue;
		const dir = join(root, dirent.name);
		const skillPath = join(dir, "SKILL.md");
		if (!existsSync(skillPath)) continue;
		const raw = readText(skillPath);
		const parsed = raw === void 0 ? void 0 : parseSkillFile(raw);
		const name = parsed?.fm.name ?? dirent.name;
		entries.push({
			name,
			description: parsed?.fm.description ?? "(无 frontmatter 描述)",
			directory: dir,
			tags: parsed?.fm.tags ?? []
		});
	}
	return entries;
}
function isValidSkillName(name) {
	return NAME_PATTERN.test(name);
}
/** 分组 tag：1-32 位字母/数字/连字符/下划线/点/空格；不可含路径分隔符，不可为空。 */
function isValidTagName(tag) {
	return GROUP_PATTERN.test(tag) && !tag.includes("/") && !tag.includes("\\");
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
	/** tags：支持 `tags: [a, b]`、`tags: a, b` 与块列表 `tags:\n  - a`。 */
	const list = (key) => {
		const re = new RegExp("^" + key + ":(\\s)*(.*)$");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line === void 0) continue;
			const lm = line.match(re);
			if (lm === null) continue;
			const rest = (lm[2] ?? "").trim();
			if (rest === "") {
				const parts = [];
				for (let j = i + 1; j < lines.length; j++) {
					const next = lines[j];
					if (next === void 0) continue;
					const bm = next.match(/^\s*-\s*(.+)$/);
					if (bm !== null) parts.push(bm[1]?.trim() ?? "");
					else if (next.trim() === "") continue;
					else break;
				}
				return parts.length > 0 ? parts : void 0;
			}
			const parts = (rest.startsWith("[") && rest.endsWith("]") ? rest.slice(1, -1) : rest).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s !== "");
			return parts.length > 0 ? parts : void 0;
		}
	};
	return {
		fm: {
			name: scalar("name"),
			description: scalar("description"),
			whenToUse: scalar("whenToUse"),
			disableModel: bool("disable-model-invocation"),
			userInvocable: bool("user-invocable"),
			tags: list("tags")
		},
		body
	};
}
function parseDir(dir) {
	const skillPath = join(dir, "SKILL.md");
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
		directory: dir,
		tags: parsed.fm.tags ?? []
	};
}
/**
* 扫描本地池（磁盘真相）。目录结构只作存放位置：递归兼容 `local/<skill>/` 与
* 旧 `local/<group>/<skill>/` 布局；分组展示一律走 frontmatter tags，不看目录层级。
*/
function listPoolEntries(poolRoot) {
	const entries = [];
	const localRoot = join(poolRoot, "local");
	if (!existsSync(localRoot)) return entries;
	for (const dirent of readdirSync(localRoot, { withFileTypes: true })) {
		if (!dirent.isDirectory()) continue;
		const dir = join(localRoot, dirent.name);
		const direct = parseDir(dir);
		if (direct !== void 0) {
			entries.push(direct);
			continue;
		}
		for (const child of readdirSync(dir, { withFileTypes: true })) {
			if (!child.isDirectory()) continue;
			const parsed = parseDir(join(dir, child.name));
			if (parsed !== void 0) entries.push(parsed);
		}
	}
	return entries;
}
function findPoolEntry(poolRoot, name) {
	return listPoolEntries(poolRoot).find((e) => e.name === name);
}
function readSkillContent(entry) {
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
		directory: entry.directory,
		tags: parsed.fm.tags ?? []
	};
}
/**
* 写操作：替换/新增 SKILL.md frontmatter 的 `tags:` 行（跨池共享分组维度）。
* 仅改 tags 行，其余 frontmatter 与正文逐字保留；无 frontmatter 或不可解析时拒绝。
*/
function setSkillTags$1(directory, tags) {
	const skillPath = join(directory, "SKILL.md");
	if (!existsSync(skillPath)) return {
		ok: false,
		reason: "SKILL.md 不存在"
	};
	const raw = readText(skillPath);
	if (raw === void 0) return {
		ok: false,
		reason: "SKILL.md 不可读"
	};
	const m = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
	if (m === null || m[2] === void 0) return {
		ok: false,
		reason: "无 frontmatter，无法写 tags"
	};
	const fmText = m[2];
	const lineSep = fmText.includes("\r\n") ? "\r\n" : "\n";
	const lines = fmText.split(/\r?\n/);
	const tagLine = tags.length === 0 ? "tags: []" : `tags: [${tags.join(", ")}]`;
	const idx = lines.findIndex((line) => /^tags:/.test(line));
	if (idx >= 0) lines[idx] = tagLine;
	else lines.push(tagLine);
	const next = m[1] + lines.join(lineSep) + m[3] + raw.slice(m[0].length);
	try {
		writeFileSync(skillPath, next, "utf8");
	} catch (error) {
		return {
			ok: false,
			reason: `写入失败：${error instanceof Error ? error.message : String(error)}`
		};
	}
	return { ok: true };
}
//#endregion
//#region src/actions.ts
/** 生成池浏览条目列表（local 全量），标记 introduced 与 tags。 */
function browsePool(poolRoot, agent, store) {
	const introduced = new Set(store.names(agent));
	return listPoolEntries(poolRoot).map((entry) => ({
		name: entry.name,
		description: entry.description,
		introduced: introduced.has(entry.name),
		tags: entry.tags
	}));
}
/** 关键词过滤（命令与工具共用）。 */
function filterBrowse(items, opts = {}) {
	if (opts.query === void 0) return items;
	const q = opts.query.toLowerCase();
	return items.filter((item) => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
}
/**
* 从池引入 skill 到当前会话（幂等；同名影子覆盖仅本会话）。
* 纯会话注册：不复制任何磁盘文件；注册资源目录指回池内原目录。
* 统一校验序列：名称 → 幂等 → 存在 → 可读 → 注册 → 记录会话引入集。
*/
async function introduceSkill(ctx, poolRoot, store, agent, name) {
	if (!isValidSkillName(name)) return {
		ok: false,
		reason: `非法技能名 "${name}"`
	};
	if (store.disposer(agent, name) !== void 0) return {
		ok: true,
		name,
		shadowed: false,
		alreadyIntroduced: true,
		persisted: true
	};
	const entry = findPoolEntry(poolRoot, name);
	if (entry === void 0) return {
		ok: false,
		reason: `池中未找到 "${name}"`
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
		shadowed,
		alreadyIntroduced: false,
		persisted: true
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
/**
* 宿主重启后的会话重放（§3.2）：把某会话落盘的引入名集重新注册进新 Agent 的会话层。
* 复用引入动作的完整校验/注册/跟踪路径（同名/已引入则幂等跳过）；fire-and-forget 调用。
*/
async function replaySession(ctx, poolRoot, store, agent) {
	const id = agent.session?.id ?? agent.id;
	const names = store.readPersisted(id);
	if (names.length === 0) return;
	for (const name of names) try {
		await introduceSkill(ctx, poolRoot, store, agent, name);
	} catch (error) {
		console.warn(`[skill-panel] replay "${name}" for session "${id}" failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* 打 tag（2026-08-19，跨池共享分组）：写技能 SKILL.md frontmatter 的 `tags` 字段。
* 技能在池 local/ 或全局层（~/.dsh/skills）均可——先查可用池，未找到再查全局激活池；
* 只改 tags 行，其余内容逐字保留。
* 分组是技能自身元数据，移动到任何一层 tag 都跟着——三池（全局激活/可用池/会话引入）共享。
*/
function setSkillTags(poolRoot, name, tags) {
	if (!isValidSkillName(name)) return {
		ok: false,
		reason: `非法技能名 "${name}"`
	};
	for (const tag of tags) if (!isValidTagName(tag)) return {
		ok: false,
		reason: `非法 tag "${tag}"`
	};
	const directory = findPoolEntry(poolRoot, name)?.directory ?? listGlobalEntries(defaultGlobalSkillsRoot()).find((e) => e.name === name)?.directory;
	if (directory === void 0) return {
		ok: false,
		reason: `未找到 "${name}"（可用池与全局激活池均无）`
	};
	const result = setSkillTags$1(directory, tags);
	if (!result.ok) return {
		ok: false,
		reason: result.reason
	};
	return {
		ok: true,
		name,
		tags
	};
}
/**
* 启用：把池内技能（可用池）移动到 user-dsh 全局层（~/.dsh/skills/<name>），
* 使其进程级自动可见（全局激活池）。只移动目录（rename），不复制。
* 已在全局同名 → 拒绝（避免覆盖官方/现有内容）；目标为 global。
*/
function activateGlobal(poolRoot, name, env = process.env) {
	if (!isValidSkillName(name)) return {
		ok: false,
		reason: `非法技能名 "${name}"`
	};
	const entry = findPoolEntry(poolRoot, name);
	if (entry === void 0) return {
		ok: false,
		reason: `可用池中未找到 "${name}"`
	};
	const globalRoot = defaultGlobalSkillsRoot(env);
	const target = join(globalRoot, name);
	if (existsSync(target)) return {
		ok: false,
		reason: `全局已存在 "${name}"（停用/删除后重试）`
	};
	try {
		mkdirSync(globalRoot, { recursive: true });
		renameSync(entry.directory, target);
	} catch (error) {
		return {
			ok: false,
			reason: `启用失败：${error instanceof Error ? error.message : String(error)}`
		};
	}
	return {
		ok: true,
		name,
		target: "global"
	};
}
/**
* 停用：把 user-dsh 全局层技能（全局激活池）移动到池 local/ 顶层（可用池），
* 使其不再进程级自动可见。只移动目录（rename），不复制、不删除内容。
* 池内同名 → 拒绝；目标为 pool。
*/
function deactivateGlobal(poolRoot, name, env = process.env) {
	if (!isValidSkillName(name)) return {
		ok: false,
		reason: `非法技能名 "${name}"`
	};
	const globalEntry = listGlobalEntries(defaultGlobalSkillsRoot(env)).find((e) => e.name === name);
	if (globalEntry === void 0) return {
		ok: false,
		reason: `全局激活池中未找到 "${name}"`
	};
	const localRoot = join(poolRoot, "local");
	const target = join(localRoot, name);
	if (existsSync(target)) return {
		ok: false,
		reason: `可用池已存在 "${name}"（启用/删除后重试）`
	};
	try {
		mkdirSync(localRoot, { recursive: true });
		renameSync(globalEntry.directory, target);
	} catch (error) {
		return {
			ok: false,
			reason: `停用失败：${error instanceof Error ? error.message : String(error)}`
		};
	}
	return {
		ok: true,
		name,
		target: "pool"
	};
}
//#endregion
//#region src/tools.ts
/** 按 tags 渲染浏览结果（分组标题 + 组内条目；无 tag 技能归「ungrouped」，行尾附全部 tags）。 */
function renderBrowse$1(items) {
	if (items.length === 0) return "no skills in pool";
	const groups = /* @__PURE__ */ new Map();
	for (const item of items) {
		const key = item.tags.length === 0 ? "ungrouped" : item.tags[0];
		const list = groups.get(key);
		if (list === void 0) groups.set(key, [item]);
		else list.push(item);
	}
	const blocks = [];
	for (const [group, entries] of groups) {
		const lines = entries.map((item) => {
			const state = item.introduced ? " [introduced]" : "";
			const tags = item.tags.length === 0 ? "" : ` (tags: ${item.tags.join(", ")})`;
			return "- " + item.name + state + tags + ": " + item.description;
		});
		blocks.push(`[${group}]\n` + lines.join("\n"));
	}
	return blocks.join("\n");
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
		description: "List skills in the user-managed pool (local/) that can be introduced into this session. Use this before session_skill_introduce to see what is available.",
		parameters: {
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
			const agent = agentOf(exec);
			const items = filterBrowse(browsePool(poolRoot, agent, store), { query: args.query });
			const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : 50;
			return { entries: items.slice(0, limit) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_search",
		description: "Search the user-managed pool (local/) for a skill by keyword in name or description.",
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
			const agent = agentOf(exec);
			const items = filterBrowse(browsePool(poolRoot, agent, store), { query: args.query });
			const limit = typeof args.limit === "number" ? Math.max(1, Math.floor(args.limit)) : 20;
			return { entries: items.slice(0, limit) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_list",
		description: "List the skills currently introduced into THIS session by session_skill_introduce. The introduce-set is persisted and restored automatically when this session resumes after a host restart.",
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
		description: "Introduce a skill from the pool into THIS session: it appears in this session skill catalog and can be loaded with the skill tool. The session introduce-set is persisted so it is restored automatically when this session resumes after a host restart. If the name already exists globally or in a preset, this session uses the introduced version (shadow override).",
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
					shadowed: { type: "boolean" },
					alreadyIntroduced: { type: "boolean" },
					persisted: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.alreadyIntroduced) return [{
					type: "text",
					text: "skill \"" + v.name + "\" is already introduced in this session"
				}];
				const persist = v.persisted === true ? " (introduce-set recorded, restored on session resume)" : " (introduce-set not recorded)";
				const shadow = v.shadowed ? " (shadows a same-name skill from another layer for this session only)" : "";
				return [{
					type: "text",
					text: "introduced \"" + v.name + "\" into this session" + persist + shadow
				}];
			}
		},
		execute: async (args, exec) => {
			const agent = agentOf(exec);
			const result = await introduceSkill(ctx, poolRoot, store, agent, args.name);
			if (!result.ok) throw new Error(result.reason);
			return {
				introduced: true,
				name: result.name,
				...result.shadowed ? { shadowed: true } : {},
				...result.alreadyIntroduced ? { alreadyIntroduced: true } : {},
				persisted: result.persisted
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_skill_remove",
		description: "Remove a skill introduced into THIS session by session_skill_introduce: its catalog entry disappears on the next step. The pool file is untouched; other sessions are unaffected. The introduce-set record is updated so the skill is not restored on resume.",
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
			const agent = agentOf(exec);
			const result = removeSkill(store, agent, args.name);
			if (!result.ok) throw new Error(result.reason);
			return {
				removed: true,
				name: result.name
			};
		}
	})));
}
//#endregion
//#region src/commands.ts
/** 按 tags 渲染浏览结果（分组标题 + 组内条目；无 tag 技能归「未分组」，行尾附全部 tags）。 */
function renderBrowse(items) {
	if (items.length === 0) return "📚 技能池：无技能（把含 SKILL.md 的目录放进 ~/.dsh/.skill-pool/local/ 即加入管理）";
	const groups = /* @__PURE__ */ new Map();
	for (const item of items) {
		const key = item.tags.length === 0 ? "未分组" : item.tags[0];
		const list = groups.get(key);
		if (list === void 0) groups.set(key, [item]);
		else list.push(item);
	}
	const blocks = [];
	for (const [group, entries] of groups) {
		const lines = entries.map((item) => {
			const state = item.introduced ? " [已引入]" : "";
			const tags = item.tags.length === 0 ? "" : ` (tags: ${item.tags.join(", ")})`;
			return "  - " + item.name + state + tags + ": " + item.description;
		});
		blocks.push(`【${group}】\n` + lines.join("\n"));
	}
	return "📚 技能池（" + items.length + " 条，" + groups.size + " 组）：\n" + blocks.join("\n");
}
/** /skill-browse [query] —— 池浏览。 */
function handlerBrowse(poolRoot, store, invocation) {
	const query = invocation.rawInput.trim();
	return {
		kind: "success",
		text: renderBrowse(filterBrowse(browsePool(poolRoot, invocation.agent, store), { query: query.length === 0 ? void 0 : query }).slice(0, 50))
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
/** /skill-introduce <name> —— 从池引入到当前会话（会话引入集持久，宿主重启后自动恢复；同名影子覆盖本会话）。 */
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
	const persist = result.persisted ? "（会话引入集已记录，重启后自动恢复）" : "";
	const shadow = result.shadowed ? "（影子覆盖：本会话使用引入版，其余会话不受影响）" : "";
	return {
		kind: "success",
		text: "✅ 已引入 \"" + result.name + "\" 到当前会话" + persist + shadow
	};
}
/** /skill-remove <name> —— 从当前会话移除（幂等，未引入时报错；池文件与全局技能不受影响）。 */
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
		text: "🗑 已从当前会话移除 \"" + result.name + "\""
	};
}
/** 注册五个 /skill-* 斜杠命令（全局，经 ctx.commands 供所有会话的 `/` 菜单发现）。 */
function applySessionSkillCommands(ctx, config) {
	const poolRoot = config.poolRoot;
	const store = config.store;
	ctx.effect(() => ctx.commands.register({
		name: "skill-browse",
		description: "list skills in the user-managed pool (local/); optional keyword query",
		input: { hint: "[<query>]" },
		handler: (invocation) => handlerBrowse(poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-search",
		description: "search the user-managed pool (local/) for a skill by keyword in name or description",
		input: { hint: "<query>" },
		handler: (invocation) => handlerSearch(poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-list",
		description: "list skills introduced into this session (introduce-set persisted, restored on resume)",
		handler: (invocation) => handlerList(ctx, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-introduce",
		description: "introduce a pool skill into this session (introduce-set persisted, restored on resume)",
		input: { hint: "<name>" },
		handler: (invocation) => handlerIntroduce(ctx, poolRoot, store, invocation)
	}));
	ctx.effect(() => ctx.commands.register({
		name: "skill-remove",
		description: "remove a skill introduced into this session (pool file and global skills untouched)",
		input: { hint: "<name>" },
		handler: (invocation) => handlerRemove(store, invocation)
	}));
}
//#endregion
//#region src/mcp-tools.ts
function applySessionMcpTools(ctx, config) {
	const manager = config.manager;
	const agentOf = (exec) => {
		if (exec.agent === void 0) throw new Error("session_mcp tools require a calling agent");
		return exec.agent;
	};
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_mcp_list",
		description: "List the session-scoped MCP servers available from the whitelist and which are currently connected in THIS session. Use this before session_mcp_connect to see connectable servers; only whitelisted servers can be connected.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { servers: {
					type: "array",
					items: { type: "json" }
				} }
			},
			render: (_args, value) => {
				const servers = value.servers;
				if (servers.length === 0) return [{
					type: "text",
					text: "no MCP servers in whitelist"
				}];
				return [{
					type: "text",
					text: servers.map((s) => {
						const state = s.connected ? " [connected]" : " [available]";
						return "- " + s.name + " (" + s.transport + ")" + state;
					}).join("\n")
				}];
			}
		},
		execute: async (_args, exec) => {
			const agent = agentOf(exec);
			const connected = new Set(manager.connectedNames(agent));
			return { servers: manager.whitelist().map((s) => ({
				name: s.name,
				transport: s.transport,
				...s.description === void 0 ? {} : { description: s.description },
				connected: connected.has(s.name)
			})) };
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_mcp_connect",
		description: "Connect a whitelisted MCP server into THIS session. Its tools become available only to this session (session-scoped); they vanish when the session ends or you disconnect. Only servers listed by session_mcp_list can be connected.",
		parameters: { name: {
			type: "string",
			required: true,
			description: "Whitelisted server name from session_mcp_list."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					connected: {
						type: "boolean",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					alreadyConnected: { type: "boolean" }
				}
			},
			render: (_args, value) => {
				const v = value;
				if (v.alreadyConnected) return [{
					type: "text",
					text: "MCP server \"" + v.name + "\" is already connected in this session"
				}];
				return [{
					type: "text",
					text: "connected MCP server \"" + v.name + "\" into this session"
				}];
			}
		},
		execute: async (args, exec) => {
			const agent = agentOf(exec);
			const result = await manager.connect(agent, args.name, exec.signal);
			if (!result.ok) throw new Error(result.reason);
			return {
				connected: true,
				name: result.name,
				...result.alreadyConnected ? { alreadyConnected: true } : {}
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "session_mcp_disconnect",
		description: "Disconnect a session-scoped MCP server from THIS session. Its tools are unregistered and no longer visible; other sessions are unaffected.",
		parameters: { name: {
			type: "string",
			required: true,
			description: "Server name from session_mcp_list (must be connected)."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					disconnected: {
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
					text: "disconnected MCP server \"" + value.name + "\" from this session"
				}];
			}
		},
		execute: async (args, exec) => {
			const agent = agentOf(exec);
			const result = manager.disconnect(agent, args.name);
			if (!result.ok) throw new Error(result.reason);
			return {
				disconnected: true,
				name: result.name
			};
		}
	})));
}
//#endregion
//#region src/skill-panel-service.ts
/** 面板 host 服务：只读为主；写操作与命令/工具同路径。 */
var SkillPanelService = class {
	static inject = [
		"agents",
		"skills",
		"webServer"
	];
	ctx;
	poolRoot;
	store;
	mcp;
	plugins;
	constructor(ctx, options) {
		this.ctx = ctx;
		this.poolRoot = options.poolRoot;
		this.store = options.store;
		this.mcp = options.mcp;
		this.plugins = options.plugins;
		ctx.effect(() => ctx.webServer.register({
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
				case "setTags":
					result = this.setTags(payload);
					break;
				case "globalList":
					result = this.globalList(payload);
					break;
				case "globalActivate":
					result = this.globalActivate(payload);
					break;
				case "globalDeactivate":
					result = this.globalDeactivate(payload);
					break;
				case "mcpList":
					result = this.mcpList(payload);
					break;
				case "mcpConnect":
					result = await this.mcpConnect(payload);
					break;
				case "mcpDisconnect":
					result = this.mcpDisconnect(payload);
					break;
				case "mcpWhitelist":
					result = this.mcpWhitelist(payload);
					break;
				case "mcpUpsert":
					result = this.mcpUpsert(payload);
					break;
				case "mcpRemove":
					result = this.mcpRemove(payload);
					break;
				case "mcpDiscover":
					result = this.mcpDiscover(payload);
					break;
				case "mcpSelect":
					result = this.mcpSelect(payload);
					break;
				case "mcpCheck":
					result = await this.mcpCheck(payload);
					break;
				case "pluginList":
					result = this.pluginList(payload);
					break;
				case "pluginToggle":
					result = this.pluginToggle(payload);
					break;
				case "pluginInstall":
					result = this.pluginInstall(payload);
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
	/** 池浏览（local 全量），支持关键词过滤。 */
	browse(request) {
		const agent = this.agentOf(request.sessionId);
		const items = filterBrowse(browsePool(this.poolRoot, agent, this.store), { query: request.query });
		const limit = typeof request.limit === "number" ? Math.max(1, Math.floor(request.limit)) : 100;
		return { entries: items.slice(0, limit) };
	}
	/** 当前会话已引入清单（含 tags 视图：从池/全局 SKILL.md 读取）。 */
	async list(request) {
		const agent = this.agentOf(request.sessionId);
		const names = this.store.names(agent);
		if (names.length === 0) return { skills: [] };
		const view = await this.ctx.skills.list({ scope: agent });
		return { skills: names.map((name) => {
			const match = view.find((skill) => skill.name === name);
			const pool = findPoolEntry(this.poolRoot, name);
			const tags = pool !== void 0 ? pool.tags : this.globalTagsOf(name);
			return {
				name,
				...match?.description === void 0 ? {} : { description: match.description },
				...tags.length === 0 ? {} : { tags }
			};
		}) };
	}
	/** 从 user-dsh 全局层读某技能 tags（会话引入可能来自全局层）。 */
	globalTagsOf(name) {
		return listGlobalEntries(defaultGlobalSkillsRoot()).find((e) => e.name === name)?.tags ?? [];
	}
	/** 单个技能的完整定义（名称/说明/适用场景/正文）。 */
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
			description: def.description,
			...def.whenToUse === void 0 ? {} : { whenToUse: def.whenToUse },
			content: def.content
		};
	}
	/** 从池引入到当前会话（幂等；纯会话注册，会话引入集已记录；同名影子覆盖仅本会话）。 */
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
			shadowed: result.shadowed,
			alreadyIntroduced: result.alreadyIntroduced,
			persisted: result.persisted
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
	/** 打 tag（跨池共享分组）：写技能 SKILL.md frontmatter 的 tags 字段（整体替换）。 */
	setTags(request) {
		this.agentOf(request.sessionId);
		const result = setSkillTags(this.poolRoot, request.name, request.tags);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name,
			tags: result.tags
		};
	}
	/** 全局激活池（user-dsh 层）清单：进程级自动可见的技能（含 tags）。 */
	globalList(request) {
		this.agentOf(request.sessionId);
		return { entries: listGlobalEntries(defaultGlobalSkillsRoot()).map((e) => ({
			name: e.name,
			description: e.description,
			tags: e.tags
		})) };
	}
	/** 启用：可用池 → 全局激活池（user-dsh 层，进程级自动可见）。 */
	globalActivate(request) {
		this.agentOf(request.sessionId);
		const result = activateGlobal(this.poolRoot, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name,
			target: "global"
		};
	}
	/** 停用：全局激活池 → 可用池 local/（不再进程级自动可见，内容保留）。 */
	globalDeactivate(request) {
		this.agentOf(request.sessionId);
		const result = deactivateGlobal(this.poolRoot, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name,
			target: "pool"
		};
	}
	/** 会话 MCP：当前会话已连 server + 白名单候选视图。 */
	mcpList(request) {
		const agent = this.agentOf(request.sessionId);
		return { entries: this.mcp.views(agent) };
	}
	/** 会话 MCP：从白名单连一个 server 到当前会话（幂等）。 */
	async mcpConnect(request) {
		const agent = this.agentOf(request.sessionId);
		const result = await this.mcp.connect(agent, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name,
			alreadyConnected: result.alreadyConnected
		};
	}
	/** 会话 MCP：断开当前会话的一个 server（幂等）。 */
	mcpDisconnect(request) {
		const agent = this.agentOf(request.sessionId);
		const result = this.mcp.disconnect(agent, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			name: result.name
		};
	}
	/** 会话 MCP：白名单全文（候选模板，非会话维度；不透出 env/headers 等敏感字段）。 */
	mcpWhitelist(_request) {
		return { servers: this.mcp.whitelist().map((s) => ({
			name: s.name,
			...s.description === void 0 ? {} : { description: s.description },
			transport: s.transport,
			...s.command === void 0 ? {} : { command: s.command },
			...s.args === void 0 ? {} : { args: s.args },
			...s.url === void 0 ? {} : { url: s.url }
		})) };
	}
	/** 会话 MCP：新增/覆盖一条白名单候选（8b）。 */
	mcpUpsert(request) {
		const result = this.mcp.upsertTemplate(request.server);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return { ok: true };
	}
	/** 会话 MCP：删除一条白名单候选（8b）。 */
	mcpRemove(request) {
		const result = this.mcp.removeTemplate(request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return { ok: true };
	}
	/** 发现：从 DSH 组合枚举已配置的 MCP 插件（不创建/配置，只读发现）。 */
	mcpDiscover(request) {
		this.agentOf(request.sessionId);
		return { entries: this.mcp.discover() };
	}
	/** 管理范围：把发现的某个已配置 MCP 加入白名单（服务端整体复制配置，含 secrets，不回显）。 */
	mcpSelect(request) {
		this.agentOf(request.sessionId);
		const result = this.mcp.select(request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			entry: result.entry
		};
	}
	/** 兼容检查：真连一次该 server + 拉工具清单 + 断开，报工具数与列出的原因。 */
	async mcpCheck(request) {
		const agent = this.agentOf(request.sessionId);
		const result = await this.mcp.check(agent, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			serverName: result.serverName,
			toolCount: result.toolCount
		};
	}
	/** 插件盘点（宿主组合层；MCP 折叠并入，标注会话连接状态）。 */
	pluginList(request) {
		const agent = this.agentOf(request.sessionId);
		return { plugins: this.plugins.list(agent).map((p) => ({
			id: p.id,
			source: p.source,
			state: p.state,
			stateLabel: p.stateLabel,
			active: p.active,
			protected: p.protected,
			manageable: p.manageable,
			isSelf: p.isSelf,
			...p.packageName === void 0 ? {} : { packageName: p.packageName },
			...p.mcp === void 0 ? {} : { mcp: p.mcp }
		})) };
	}
	/** 启停一个用户插件行（写活动 profile cordis.patch.yml，热重载免重启）。 */
	pluginToggle(request) {
		this.agentOf(request.sessionId);
		const result = request.enabled ? this.plugins.enable(request.id) : this.plugins.disable(request.id);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			id: result.id,
			enabled: result.enabled
		};
	}
	/** 新增/启用一个用户插件（写一条 insert 行，id + 包名）。 */
	pluginInstall(request) {
		this.agentOf(request.sessionId);
		const result = this.plugins.install(request.id, request.name);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			id: result.id
		};
	}
};
//#endregion
//#region src/mcp-manager.ts
/**
* 会话级临时 MCP 管理核心（DSHP dshp-skill-panel 扩展）。
*
* 设计（Q3a/Q5a/Q6a/Q8b/Q9 定稿）：
* - 范围：会话级。连接挂到发起 agent 的 `agent.ctx`（Agent-scoped context），
*   mcp-client 在 agent.ctx 下 `ctx.get('tools').register()` 自动落进该 agent 的
*   scope layer → 该 server 的 tools 只对该 agent 可见（dsh-tools 官方 "register
*   through that agent's agent.ctx" 契约）。
* - 配置：白名单（6a）。模型不能填任意 command/url，只能从白名单候选按名连接。
* - 白名单可编辑（8b）：一份 JSON 文件（poolRoot 旁 .mcp-whitelist.json），
*   面板/管理端点可增删候选；候选本身仍是受控的（不放任意 command 的编辑自由度上限）。
* - serverName：mcp-client 的 serverName 全进程去重（activeServerNames 弱表）。
*   同一白名单 server 被不同 agent 同时连接会产生冲突，故每个 (agent, whitelistName)
*   派生出唯一 serverName（短哈希），保证全局唯一且模型可见名字稳定。
* - 清理（9）：连接以 effect/disposer 挂在 agent.ctx，agent 销毁时 agent.ctx 展开
*   自动断开并注销；同时本管理器显式持有 disposer 供主动断开与插件 stop 时清理。
*/
const WHITELIST_FILE = ".mcp-whitelist.json";
/** 已禁用全局 MCP 的原始行 sidecar（select 时存、deselect 时取回）。 */
const DISABLED_FILE = ".mcp-disabled.json";
/** serverName 合法字符段（与 mcp-client SERVER_NAME_PATTERN 对齐）。 */
const SERVER_NAME_PREFIX = "dshp";
/**
* 会话级临时 MCP 管理器（插件实例共享一份）。
* 白名单读写文件；连接跟踪用 WeakMap（Agent 被回收即释放，不泄漏跨会话）。
*/
var SessionMcpManager = class {
	context;
	/** 白名单存储目录（poolRoot）。 */
	whitelistFile;
	/** 已禁用全局 MCP 原始行 sidecar（poolRoot）。 */
	disabledFile;
	/** agent → (whitelistName → Connection)。 */
	connections = /* @__PURE__ */ new WeakMap();
	/** 每个白名单名当前被多少 agent 连接（便于 removeTemplate 检查，WeakMap 不可枚举）。 */
	usedCount = /* @__PURE__ */ new Map();
	/**
	* 本管理器在会话里创建的派生 serverName（`dshp-<name>-<hash>`）。
	* convention registry 是全进程共享、按插件函数为 key 的，会话实例与全局行同用一个
	* mcp-client Runtime（fibers 合并）；discover() 借此把"我们自己刚连的会话实例"排除，
	* 只露出"组合里已配置的 MCP"，避免出现 dshp-chrome-devtools-xxxx 这类派生噪点。
	*/
	ownedServerNames = /* @__PURE__ */ new Set();
	/** 缓存白名单（上次读取）；写时同步磁盘。 */
	cached;
	constructor(ctx, root) {
		this.context = ctx;
		this.whitelistFile = join(root, WHITELIST_FILE);
		this.disabledFile = join(root, DISABLED_FILE);
		this.cached = this.readFile();
	}
	readFile() {
		if (!existsSync(this.whitelistFile)) return [];
		try {
			const text = readFileSync(this.whitelistFile, "utf8").replace(/^\uFEFF/, "");
			const data = JSON.parse(text);
			return (Array.isArray(data?.servers) ? data.servers : []).filter((s) => typeof s?.name === "string" && s.name !== "");
		} catch {
			return [];
		}
	}
	persist() {
		mkdirSync(dirname(this.whitelistFile), { recursive: true });
		writeFileSync(this.whitelistFile, JSON.stringify({ servers: this.cached }, null, 2), "utf8");
	}
	/** 当前白名单候选。 */
	whitelist() {
		return this.cached.map((s) => ({ ...s }));
	}
	/** 面板视图：白名单候选 + 各候选的会话内连接状态（按 agent）。 */
	views(agent) {
		const connected = this.mapOf(agent);
		return this.cached.map((template) => ({
			name: template.name,
			...template.description === void 0 ? {} : { description: template.description },
			transport: template.transport,
			...template.command === void 0 ? {} : { command: template.command },
			...template.args === void 0 ? {} : { args: [...template.args] },
			...template.url === void 0 ? {} : { url: template.url },
			connected: connected.has(template.name)
		}));
	}
	/**
	* 从 ordis.registry 拍平所有已加载插件 Fiber（含 mcp-client）。registry 是
	* Map<unknown, { fibers }>，Fiber 携带 name/state/config。
	*/
	registryFibers() {
		const registry = this.context.registry;
		const out = [];
		for (const runtime of registry.values()) for (const fiber of runtime.fibers ?? []) out.push(fiber);
		return out;
	}
	/**
	* mcp-client 插件配置签名：`serverName`（string）+ `transport`（stdio/streamable-http）。
	* Cordis `fiber.name` 是插件显示名/行 id（如 `mcp-chrome-devtools`），不是包名，
	* 故不能按包名过滤，须按该配置形状识别"这是一个 mcp-client 桥接的 server"。
	*/
	isMcpClientConfig(config) {
		const c = config;
		return typeof c?.serverName === "string" && c.serverName !== "" && (c.transport === "stdio" || c.transport === "streamable-http");
	}
	/**
	* 从 DSH 组合(cordis.registry)枚举的 mcp-client 插件原始模板（含 env/headers secrets）。
	* 内部仅在本类使用；对外只暴露脱敏视图（discover）与"按名选择复制"（select）。
	*/
	discoveredTemplates() {
		const out = [];
		for (const fiber of this.registryFibers()) {
			if (!this.isMcpClientConfig(fiber.config)) continue;
			const cfg = fiber.config;
			if (typeof cfg.command === "string") out.push({
				name: cfg.serverName,
				transport: cfg.transport,
				command: cfg.command
			});
			else if (typeof cfg.url === "string") out.push({
				name: cfg.serverName,
				transport: cfg.transport,
				url: cfg.url
			});
			else out.push({
				name: cfg.serverName,
				transport: cfg.transport
			});
		}
		const byName = /* @__PURE__ */ new Map();
		for (const fiber of this.registryFibers()) {
			if (!this.isMcpClientConfig(fiber.config)) continue;
			const cfg = fiber.config;
			const base = byName.get(cfg.serverName) ?? {
				name: cfg.serverName,
				transport: cfg.transport
			};
			if (typeof cfg.command === "string") base.command = cfg.command;
			if (typeof cfg.url === "string") base.url = cfg.url;
			if (Array.isArray(cfg.args)) base.args = cfg.args.filter((a) => typeof a === "string");
			if (cfg.env !== void 0 && typeof cfg.env === "object") base.env = { ...cfg.env };
			if (cfg.headers !== void 0 && typeof cfg.headers === "object") base.headers = { ...cfg.headers };
			byName.set(cfg.serverName, base);
		}
		return [...byName.values()];
	}
	/**
	* 发现（发现与兼容）：从 DSH 组合(cordis.registry)枚举已配置的 mcp-client 插件。
	* 本插件不创建/配置，只读其配置以呈现"已配置好的 MCP"；用户再把其中想管理的
	* 加入白名单（管理范围）。env/headers 只揭示存在性，不透出值。
	*/
	discover() {
		const managed = new Set(this.cached.map((s) => s.name));
		const actives = /* @__PURE__ */ new Set();
		for (const fiber of this.registryFibers()) if (this.isMcpClientConfig(fiber.config) && fiber.state === 2) actives.add(fiber.config.serverName);
		return this.discoveredTemplates().filter((t) => !this.ownedServerNames.has(t.name)).map((t) => ({
			name: t.name,
			transport: t.transport,
			...t.command === void 0 ? {} : { command: t.command },
			...t.args === void 0 ? {} : { args: [...t.args] },
			...t.url === void 0 ? {} : { url: t.url },
			hasSecrets: t.env !== void 0 && Object.keys(t.env).length > 0 || t.headers !== void 0 && Object.keys(t.headers).length > 0,
			globallyActive: actives.has(t.name),
			managed: managed.has(t.name)
		}));
	}
	/**
	* 用户选择（管理范围）：把组合里发现的某个已配置 MCP 复制进白名单（含 env/headers
	* secrets，不向客户端回显）。返回其脱敏视图供刷新。
	*/
	select(name) {
		const template = this.discoveredTemplates().find((t) => t.name === name);
		if (template === void 0) return {
			ok: false,
			reason: `组合中未发现已配置的 MCP "${name}"`
		};
		const disabled = this.disableGlobalMcp(name);
		if (!disabled.ok) return {
			ok: false,
			reason: disabled.reason
		};
		const saved = this.upsertTemplate(template);
		if (!saved.ok) {
			this.restoreGlobalMcp(name);
			return {
				ok: false,
				reason: saved.reason
			};
		}
		const hasSecrets = template.env !== void 0 && Object.keys(template.env).length > 0 || template.headers !== void 0 && Object.keys(template.headers).length > 0;
		const managed = new Set(this.cached.map((s) => s.name));
		return {
			ok: true,
			entry: {
				name: template.name,
				transport: template.transport,
				...template.command === void 0 ? {} : { command: template.command },
				...template.args === void 0 ? {} : { args: [...template.args] },
				...template.url === void 0 ? {} : { url: template.url },
				hasSecrets,
				globallyActive: false,
				managed: managed.has(template.name)
			}
		};
	}
	/** 新增或整体替换一条候选（name 相同则覆盖）。 */
	upsertTemplate(template) {
		if (typeof template.name !== "string" || template.name.trim() === "" || !/^[A-Za-z0-9_-]{1,64}$/.test(template.name)) return {
			ok: false,
			reason: "name must be 1-64 chars of [A-Za-z0-9_-]"
		};
		if (template.transport === "stdio") {
			if (typeof template.command !== "string" || template.command === "") return {
				ok: false,
				reason: "stdio template requires a command"
			};
		} else if (template.transport === "streamable-http") {
			if (typeof template.url !== "string" || template.url === "") return {
				ok: false,
				reason: "streamable-http template requires a url"
			};
		} else return {
			ok: false,
			reason: "unknown transport"
		};
		const normalized = {
			name: template.name,
			...template.description === void 0 ? {} : { description: template.description },
			transport: template.transport,
			...template.transport === "stdio" ? {
				command: template.command,
				...template.args === void 0 ? {} : { args: [...template.args] },
				...template.env === void 0 ? {} : { env: { ...template.env } }
			} : {
				url: template.url,
				...template.headers === void 0 ? {} : { headers: { ...template.headers } }
			}
		};
		const idx = this.cached.findIndex((s) => s.name === template.name);
		if (idx >= 0) this.cached[idx] = normalized;
		else this.cached.push(normalized);
		this.persist();
		return { ok: true };
	}
	/** 删除一条候选；若已有 agent 连着它，先拒绝（避免悬空）。 */
	removeTemplate(name) {
		if ((this.usedCount.get(name) ?? 0) > 0) return {
			ok: false,
			reason: `"${name}" is currently connected; disconnect first`
		};
		const idx = this.cached.findIndex((s) => s.name === name);
		if (idx < 0) return {
			ok: false,
			reason: `whitelist has no "${name}"`
		};
		this.cached.splice(idx, 1);
		this.persist();
		const restored = this.restoreGlobalMcp(name);
		if (!restored.ok) console.error(`[dshp-skill-panel] restore global MCP "${name}" failed: ${restored.reason}`);
		return { ok: true };
	}
	/** home 级 patch 路径（$DSH_HOME/cordis.patch.yml，跨 profile 共享）。 */
	homePatchFile() {
		const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? ".", ".dsh");
		return join(home, "cordis.patch.yml");
	}
	/** 读 home 级 patch 为顶层选项数组（非法/空 → 空数组）。 */
	readHomePatchOptions() {
		const file = this.homePatchFile();
		if (!existsSync(file)) return [];
		try {
			const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
			const parsed = load(text);
			if (Array.isArray(parsed)) return parsed;
			return [];
		} catch {
			return [];
		}
	}
	/** 写回 home 级 patch：备份 + 解析校验 + 原子写。 */
	writeHomePatchOptions(options) {
		const file = this.homePatchFile();
		let nextText;
		try {
			nextText = dump(options, {
				noRefs: true,
				lineWidth: 120
			});
		} catch (error) {
			return {
				ok: false,
				reason: `serialize home patch failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		try {
			const reparsed = load(nextText);
			if (!Array.isArray(reparsed)) return {
				ok: false,
				reason: "generated home patch is not a top-level array"
			};
		} catch (error) {
			return {
				ok: false,
				reason: `generated home patch failed to parse: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		try {
			if (existsSync(file)) writeFileSync(file + ".bak", readFileSync(file, "utf8"), "utf8");
			const tmp = file + ".tmp";
			writeFileSync(tmp, nextText, "utf8");
			renameSync(tmp, file);
		} catch (error) {
			return {
				ok: false,
				reason: `write home patch failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		return { ok: true };
	}
	/** 读已禁用全局 MCP 的原始行（sidecar，供恢复）。 */
	readDisabledRows() {
		if (!existsSync(this.disabledFile)) return {};
		try {
			const text = readFileSync(this.disabledFile, "utf8").replace(/^\uFEFF/, "");
			const data = JSON.parse(text);
			return typeof data === "object" && data !== null ? data : {};
		} catch {
			return {};
		}
	}
	/** 写已禁用全局 MCP 的原始行（sidecar）。 */
	writeDisabledRows(rows) {
		try {
			mkdirSync(dirname(this.disabledFile), { recursive: true });
			writeFileSync(this.disabledFile, JSON.stringify(rows, null, 2), "utf8");
		} catch {}
	}
	/** 禁用全局 MCP：从 home 级 patch 移除该 serverName 的行，原始行存 sidecar。 */
	disableGlobalMcp(serverName) {
		const options = this.readHomePatchOptions();
		let removed;
		const next = options.map((opt) => {
			if (opt === null || typeof opt !== "object" || !Array.isArray(opt.insert)) return opt;
			const insert = opt.insert.filter((row) => {
				const cfg = row?.config;
				const isTarget = typeof cfg?.serverName === "string" && cfg.serverName === serverName;
				if (isTarget) removed = row;
				return !isTarget;
			});
			return {
				...opt,
				insert
			};
		});
		if (removed === void 0) return { ok: true };
		const result = this.writeHomePatchOptions(next);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		const disabled = this.readDisabledRows();
		disabled[serverName] = removed;
		this.writeDisabledRows(disabled);
		return { ok: true };
	}
	/** 恢复全局 MCP：从 sidecar 取原始行，加回 home 级 patch。 */
	restoreGlobalMcp(serverName) {
		const disabled = this.readDisabledRows();
		const row = disabled[serverName];
		if (row === void 0) return { ok: true };
		const options = this.readHomePatchOptions();
		let insertOpt = options.find((opt) => opt !== null && typeof opt === "object" && Array.isArray(opt.insert));
		if (insertOpt === void 0) {
			insertOpt = { insert: [] };
			options.push(insertOpt);
		}
		const insert = insertOpt.insert;
		if (!insert.some((r) => {
			const cfg = r?.config;
			return typeof cfg?.serverName === "string" && cfg.serverName === serverName;
		})) insert.push(row);
		const result = this.writeHomePatchOptions(options);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		delete disabled[serverName];
		this.writeDisabledRows(disabled);
		return { ok: true };
	}
	mapOf(agent) {
		let map = this.connections.get(agent);
		if (map === void 0) {
			map = /* @__PURE__ */ new Map();
			this.connections.set(agent, map);
		}
		return map;
	}
	bumpUse(name, delta) {
		const next = (this.usedCount.get(name) ?? 0) + delta;
		if (next <= 0) this.usedCount.delete(name);
		else this.usedCount.set(name, next);
	}
	/** 派生唯一 serverName：前缀 + agent 标识哈希 + 白名单名哈希（≤32，合法字符）。 */
	deriveServerName(agent, whitelistName) {
		const agentKey = agent.session?.id ?? String(agent);
		const hash = createHash("sha1").update(`${agentKey}\0${whitelistName}`).digest("hex").slice(0, 20);
		return `${`${SERVER_NAME_PREFIX}-${whitelistName}`}-${hash}`.slice(0, 32);
	}
	/** 某 agent 当前已连的白名单名。 */
	connectedNames(agent) {
		return [...this.mapOf(agent).keys()];
	}
	/** 连接一个白名单候选到发起 agent 的会话（幂等；已连则返回现状）。 */
	async connect(agent, name, _signal) {
		const template = this.cached.find((s) => s.name === name);
		if (template === void 0) return {
			ok: false,
			reason: `whitelist has no "${name}"`
		};
		const map = this.mapOf(agent);
		const existing = map.get(name);
		if (existing !== void 0) return {
			ok: true,
			name,
			serverName: existing.serverName,
			alreadyConnected: true
		};
		const serverName = this.deriveServerName(agent, name);
		const config = this.toMcpConfig(template, serverName);
		this.ownedServerNames.add(serverName);
		const fiber = agent.ctx.plugin({
			name: apply.name,
			inject,
			apply
		}, config);
		const dispose = () => {
			fiber.dispose();
		};
		map.set(name, {
			serverName,
			dispose
		});
		this.bumpUse(name, 1);
		return {
			ok: true,
			name,
			serverName,
			alreadyConnected: false
		};
	}
	/** 断开某 agent 的一个会话 MCP（幂等）。 */
	disconnect(agent, name) {
		const map = this.mapOf(agent);
		const conn = map.get(name);
		if (conn === void 0) return {
			ok: false,
			reason: `"${name}" is not connected in this session`
		};
		conn.dispose();
		map.delete(name);
		this.ownedServerNames.delete(conn.serverName);
		this.bumpUse(name, -1);
		return {
			ok: true,
			name
		};
	}
	/** 断开某 agent 所有会话 MCP（会话结束/插件 stop 时调用）。 */
	disconnectAll(agent) {
		const map = this.connections.get(agent);
		if (map === void 0) return;
		for (const [name, conn] of map) {
			conn.dispose();
			this.ownedServerNames.delete(conn.serverName);
			this.bumpUse(name, -1);
		}
		map.clear();
	}
	/**
	* 兼容检查（发现与兼容）：数**全局实例**（模型实际使用的那个）在 host 工具注册表里
	* 已注册的工具数。不再另起会话实例——那会与全局实例抢连接、且并非模型所用，导致误报 0 工具。
	*/
	async check(_agent, name) {
		const template = this.cached.find((s) => s.name === name);
		if (template === void 0) return {
			ok: false,
			reason: `白名单没有 "${name}"`
		};
		const toolCount = this.countGlobalTools(template.name);
		return {
			ok: true,
			serverName: template.name,
			toolCount
		};
	}
	/** 数全局实例已注册的工具数（mcp__<serverName>__ 前缀，host 工具注册表）。 */
	countGlobalTools(serverName) {
		try {
			const tools = this.context.get.call(this.context, "tools");
			const prefix = `mcp__${serverName}__`;
			return (tools?.schemas?.() ?? []).filter((s) => typeof s?.name === "string" && s.name.startsWith(prefix)).length;
		} catch {
			return 0;
		}
	}
	/** 白名单模板 → mcp-client Config。 */
	toMcpConfig(template, serverName) {
		if (template.transport === "stdio") return {
			transport: "stdio",
			serverName,
			command: template.command,
			args: template.args ?? [],
			env: template.env ?? {},
			cwd: "",
			toolCallTimeoutMs: 6e4,
			failOnStartupError: false
		};
		return {
			transport: "streamable-http",
			serverName,
			url: template.url,
			headers: template.headers ?? {},
			toolCallTimeoutMs: 6e4,
			failOnStartupError: false
		};
	}
};
//#endregion
//#region src/plugin-manager.ts
/**
* 插件管理核心（ADR-0008）：宿主组合层（进程级）管理，并入 MCP。
*
* 领域模型：插件 = 宿主组合层的总概念——所有组合行（DSH 核心 / 用户插件 / MCP 桥接）。
* skill 与 MCP 是插件的能力子类；本页签管理进程级组合行，技能页签管理会话级文档能力。
*
* 范围（进程级，热挂载）：
* - 盘点：从 `ctx.registry` 拍平所有已加载 Fiber（与 mcp-manager 同款遍历），结合活动
*   profile 的 `cordis.patch.yml`，标注来源（core / patch / mcp）与运行状态（FiberState）。
* - 启停：写活动 profile 的 `cordis.patch.yml` `- insert:` 行 → DSH 对该文件设 watcher
*   （`watchUserPatches`），改即实时重组、免重启（profile-boot.ts 的 composeLive 热路径）。
* - 保护：核心内置（bundle / host 服务）只读不可停；**禁止停面板自身**；写前备份 + 校验
*   YAML + 原子写 + 失败回滚（热重载写坏会中断宿主）。
* - MCP 折叠：MCP 桥接行在插件页里是带会话连接动作的普通插件行；会话级连接/断开/白名单/
*   检查复用 SessionMcpManager（本类只做组合行盘点与 patch 行启停，不复制其逻辑）。
*
* 写保护约定：
* - 只改活动 profile 的 `cordis.patch.yml`（当前只管 web profile，ADR-0008 Consequences）。
* - 备份到 `<profileDir>/.dshp-cordis.patch.yml.bak`（固定一份，覆盖式），写坏可手工还原。
* - 写前用 js-yaml 解析校验新内容必须是「顶层数组、可含 insert 块」，失败则不落盘。
* - 原子写：先写临时文件再 rename 覆盖，避免半截文件被 watcher 读到。
*
* 状态文件：`<profileDir>/.dshp-plugins.json`，记录面板管理过的用户插件行规格
* （{id,name}），使「停用后再启用」能跨会话还原（与 mcp-manager 白名单文件同模式）。
*/
/** 面板自身包名与行 id（禁止停）。 */
const PANEL_PACKAGE = "@super_camel/dsh-skill-panel";
const PANEL_ROW_ID = "dshp-skill-panel";
/** FiberState 中文标签（Cordis：PENDING=0 LOADING=1 ACTIVE=2 FAILED=3 DISPOSED=4 UNLOADING=5）。 */
const FIBER_LABELS = [
	"pending",
	"loading",
	"active",
	"failed",
	"disposed",
	"unloading"
];
/** 活动 profile 解析失败时退回的默认 profile 名（ADR：当前只管 web profile）。 */
const DEFAULT_PROFILE = "web";
/**
* 解析活动 profile 目录：优先「其 cordis.patch.yml 引用了本面板包」的那个 profile
* （即正在挂载本插件、且面板要管理的组合所在），否则退回 web。
*/
function resolveProfileDir() {
	const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? ".", ".dsh");
	const profilesDir = join(home, "profiles");
	if (existsSync(profilesDir)) for (const name of readdirSync(profilesDir)) {
		const patch = join(profilesDir, name, "cordis.patch.yml");
		if (!existsSync(patch)) continue;
		try {
			if (readFileSync(patch, "utf8").includes("@super_camel/dsh-skill-panel")) return join(profilesDir, name);
		} catch {}
	}
	return join(profilesDir, DEFAULT_PROFILE);
}
var PluginManager = class {
	ctx;
	profileDir;
	patchFile;
	stateFile;
	mcp;
	constructor(ctx, mcp, profileDir) {
		this.ctx = ctx;
		this.profileDir = profileDir ?? resolveProfileDir();
		this.patchFile = join(this.profileDir, "cordis.patch.yml");
		this.stateFile = join(this.profileDir, ".dshp-plugins.json");
		this.mcp = mcp;
	}
	registryFibers() {
		const registry = this.ctx.registry;
		const out = [];
		for (const runtime of registry.values()) for (const fiber of runtime.fibers ?? []) out.push(fiber);
		return out;
	}
	/** mcp-client 桥接识别：config 带 serverName + transport。 */
	isMcpClientConfig(config) {
		const c = config;
		return typeof c?.serverName === "string" && c.serverName !== "" && (c.transport === "stdio" || c.transport === "streamable-http");
	}
	/** 面板自身 fiber 的 runtime 名（fiber.name 是插件类名，如 SkillControlPlugin）。 */
	selfFiberName() {
		const name = this.ctx.fiber?.name;
		return typeof name === "string" && name !== "" ? name : void 0;
	}
	/** 面板自身 patch 行的 id（fiber.entry.id，如 dshp-skill-panel）。 */
	selfRowId() {
		const id = this.ctx.fiber?.entry?.id;
		return typeof id === "string" && id !== "" ? id : void 0;
	}
	/** 面板自身的所有身份标识（fiber 名 / 行 id / 包名），用于 isSelf 与去重。 */
	selfNames() {
		const names = /* @__PURE__ */ new Set([PANEL_ROW_ID, PANEL_PACKAGE]);
		const fiberName = this.selfFiberName();
		if (fiberName !== void 0) names.add(fiberName);
		const rowId = this.selfRowId();
		if (rowId !== void 0) names.add(rowId);
		return names;
	}
	isSelf(id) {
		return this.selfNames().has(id);
	}
	/**
	* 盘点：registry 所有 Fiber + 活动 profile patch 行规格 + 状态文件里已停用的用户插件
	* 规格，合并为面板视图。source 优先级：mcp > patch > core。
	* @param agent - 可选；用于标注 mcp 桥接行的会话级连接状态。
	*/
	list(agent) {
		this.syncSpecs();
		const patchRows = this.readPatchRows();
		const patchIds = new Set(patchRows.map((r) => String(r.id)));
		const specs = this.readSpecs();
		const bundleNames = this.readBundleNames();
		const userBundleNames = new Set(bundleNames.filter((n) => !n.startsWith("@deepseek-ai/")));
		const connected = /* @__PURE__ */ new Set();
		if (agent !== void 0) for (const n of this.mcp.connectedNames(agent)) connected.add(n);
		const fibers = this.registryFibers();
		const seenIds = /* @__PURE__ */ new Set();
		const views = [];
		for (const fiber of fibers) {
			const rawId = typeof fiber.name === "string" && fiber.name !== "" ? fiber.name : "(unnamed)";
			const isSelfFiber = rawId === this.selfFiberName();
			const id = isSelfFiber ? this.selfRowId() ?? rawId : rawId;
			seenIds.add(id);
			const state = typeof fiber.state === "number" ? fiber.state : 0;
			const stateLabel = FIBER_LABELS[state] ?? `state:${state}`;
			const isMcp = this.isMcpClientConfig(fiber.config);
			const isSelf = this.isSelf(id) || isSelfFiber;
			const packageName = patchRows.find((r) => String(r.id) === id)?.name ?? specs.find((s) => s.id === id)?.name;
			const isUserBundle = typeof packageName === "string" && userBundleNames.has(packageName);
			const source = isSelf ? "patch" : isMcp ? "mcp" : patchIds.has(id) ? "patch" : isUserBundle ? "bundle" : "core";
			const manageable = (source === "patch" || source === "bundle") && !isSelf;
			const protected_ = !manageable || isSelf;
			let serverName;
			let transport;
			if (isMcp) {
				const cfg = fiber.config;
				serverName = cfg.serverName;
				transport = cfg.transport;
			}
			views.push({
				id,
				source,
				state,
				stateLabel,
				active: state === 2,
				protected: protected_,
				manageable,
				isSelf,
				...typeof packageName === "string" ? { packageName } : {},
				...isMcp && serverName !== void 0 && transport !== void 0 ? { mcp: {
					serverName,
					transport,
					connected: connected.has(serverName)
				} } : {}
			});
		}
		for (const spec of specs) {
			if (seenIds.has(spec.id)) continue;
			if (this.isSelf(spec.id)) continue;
			const specSource = spec.source ?? "patch";
			views.push({
				id: spec.id,
				source: specSource,
				state: -1,
				stateLabel: "stopped",
				active: false,
				protected: false,
				manageable: specSource === "patch" || specSource === "bundle",
				isSelf: this.isSelf(spec.id),
				packageName: spec.name
			});
		}
		return views.sort((a, b) => a.active === b.active ? a.id.localeCompare(b.id) : a.active ? -1 : 1);
	}
	readPatchText() {
		if (!existsSync(this.patchFile)) return "";
		return readFileSync(this.patchFile, "utf8").replace(/^\uFEFF/, "");
	}
	/** 解析 patch 文件为顶层 PatchOption[]（非法/空 → 空数组）。 */
	readPatchOptions() {
		const text = this.readPatchText();
		if (text.trim() === "") return [];
		try {
			const parsed = load(text);
			if (parsed === null || parsed === void 0) return [];
			if (Array.isArray(parsed)) return parsed;
			return [];
		} catch {
			return [];
		}
	}
	/** 从所有 insert 块里汇总 patch 行。 */
	readPatchRows() {
		const rows = [];
		for (const opt of this.readPatchOptions()) if (opt !== null && typeof opt === "object" && Array.isArray(opt.insert)) {
			for (const row of opt.insert) if (row !== null && typeof row === "object" && typeof row.id === "string") rows.push(row);
		}
		return rows;
	}
	/** 读活动 profile 的 dsh.profile.bundles（package.json），区分核心 bundle 与用户 bundle。 */
	readBundleNames() {
		const pkgFile = join(this.profileDir, "package.json");
		if (!existsSync(pkgFile)) return [];
		try {
			const bundles = JSON.parse(readFileSync(pkgFile, "utf8"))?.dsh?.profile?.bundles;
			return Array.isArray(bundles) ? bundles.filter((b) => typeof b === "string") : [];
		} catch {
			return [];
		}
	}
	/** 写回 dsh.profile.bundles（package.json）：备份 + 原子写。 */
	writeBundleNames(bundleNames) {
		const pkgFile = join(this.profileDir, "package.json");
		if (!existsSync(pkgFile)) return {
			ok: false,
			reason: "profile package.json not found"
		};
		try {
			const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
			if (pkg.dsh === void 0) pkg.dsh = {};
			if (pkg.dsh.profile === void 0) pkg.dsh.profile = {};
			pkg.dsh.profile.bundles = bundleNames;
			writeFileSync(pkgFile + ".bak", readFileSync(pkgFile, "utf8"), "utf8");
			const tmp = pkgFile + ".tmp";
			writeFileSync(tmp, JSON.stringify(pkg, null, 2) + "\n", "utf8");
			renameSync(tmp, pkgFile);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				reason: `write package.json failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	/**
	* 写回 patch 文件：保证用户插件行都在单个 insert 块里。
	* 写保护：备份 + 解析校验 + 原子写。
	*/
	writePatch(rows) {
		let options = this.readPatchOptions();
		const kept = [];
		let hasInsert = false;
		for (const opt of options) {
			if (opt !== null && typeof opt === "object" && Array.isArray(opt.insert)) {
				hasInsert = true;
				continue;
			}
			kept.push(opt);
		}
		const insertOption = { insert: rows };
		const nextOptions = hasInsert ? [insertOption, ...kept] : [insertOption, ...kept];
		let nextText;
		try {
			nextText = dump(nextOptions, {
				noRefs: true,
				lineWidth: 120
			});
		} catch (error) {
			return {
				ok: false,
				reason: `serialize patch failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		try {
			const reparsed = load(nextText);
			if (!Array.isArray(reparsed)) return {
				ok: false,
				reason: "generated patch is not a top-level array"
			};
		} catch (error) {
			return {
				ok: false,
				reason: `generated patch failed to parse: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		try {
			if (existsSync(this.patchFile)) writeFileSync(this.patchFile + ".bak", this.readPatchText(), "utf8");
			const tmp = this.patchFile + ".tmp";
			writeFileSync(tmp, nextText, "utf8");
			renameSync(tmp, this.patchFile);
		} catch (error) {
			return {
				ok: false,
				reason: `write patch failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
		return { ok: true };
	}
	/** 停用：patch 行从 cordis.patch.yml 移除（热重载）；bundle 行从 dsh.profile.bundles 移除（冷挂载，需重启）。 */
	disable(id) {
		const view = this.list().find((v) => v.id === id);
		if (view === void 0) return {
			ok: false,
			reason: `未找到插件行 "${id}"`
		};
		if (view.isSelf) return {
			ok: false,
			reason: "禁止停用面板自身"
		};
		if (!view.active) return {
			ok: false,
			reason: `"${id}" 已处于停用状态`
		};
		if (view.source === "bundle") {
			const name = view.packageName;
			if (typeof name !== "string" || name === "") return {
				ok: false,
				reason: `缺少 "${id}" 的包名，无法移除 bundle`
			};
			const bundles = this.readBundleNames().filter((n) => n !== name);
			const result = this.writeBundleNames(bundles);
			if (!result.ok) return {
				ok: false,
				reason: result.reason
			};
			this.setSpecSource(id, "bundle");
			return {
				ok: true,
				id,
				enabled: false
			};
		}
		if (view.source !== "patch") return {
			ok: false,
			reason: `"${id}" 不是活动 profile 的 patch 行，不可在此停用`
		};
		const rows = this.readPatchRows().filter((r) => String(r.id) !== id);
		const result = this.writePatch(rows);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			id,
			enabled: false
		};
	}
	/** 启用：patch 行加回 cordis.patch.yml（热重载）；bundle 行加回 dsh.profile.bundles（冷挂载，需重启）。 */
	enable(id) {
		const view = this.list().find((v) => v.id === id);
		if (view === void 0) return {
			ok: false,
			reason: `未找到插件行 "${id}"`
		};
		if (view.active) return {
			ok: false,
			reason: `"${id}" 已处于运行状态`
		};
		const name = view.packageName;
		if (typeof name !== "string" || name === "") return {
			ok: false,
			reason: `缺少 "${id}" 的包名，无法重建（请在状态文件/手动补 name）`
		};
		if (view.source === "bundle") {
			const bundles = this.readBundleNames();
			if (bundles.includes(name)) return {
				ok: false,
				reason: `"${name}" 已在 bundles 中`
			};
			bundles.push(name);
			const result = this.writeBundleNames(bundles);
			if (!result.ok) return {
				ok: false,
				reason: result.reason
			};
			return {
				ok: true,
				id,
				enabled: true
			};
		}
		const rows = this.readPatchRows();
		if (rows.some((r) => String(r.id) === id)) return {
			ok: false,
			reason: `"${id}" 已在 patch 中`
		};
		rows.push({
			id,
			name
		});
		const result = this.writePatch(rows);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			id,
			enabled: true
		};
	}
	/** 新增/启用一个用户插件：写一条 insert 行（id + 包名）。 */
	install(id, name) {
		if (typeof id !== "string" || id.trim() === "" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return {
			ok: false,
			reason: "id 需为 1-64 位 [A-Za-z0-9_-]"
		};
		if (typeof name !== "string" || name.trim() === "") return {
			ok: false,
			reason: "name（包名）不能为空"
		};
		if (this.isSelf(id)) return {
			ok: false,
			reason: "禁止对面板自身执行安装"
		};
		const rows = this.readPatchRows();
		if (rows.some((r) => String(r.id) === id)) return {
			ok: false,
			reason: `"${id}" 已在 patch 中`
		};
		rows.push({
			id: id.trim(),
			name: name.trim()
		});
		const result = this.writePatch(rows);
		if (!result.ok) return {
			ok: false,
			reason: result.reason
		};
		return {
			ok: true,
			id: id.trim()
		};
	}
	readSpecs() {
		if (!existsSync(this.stateFile)) return [];
		try {
			const text = readFileSync(this.stateFile, "utf8").replace(/^\uFEFF/, "");
			const data = JSON.parse(text);
			return (Array.isArray(data?.plugins) ? data.plugins : []).filter((s) => {
				const p = s;
				return typeof p?.id === "string" && typeof p?.name === "string";
			});
		} catch {
			return [];
		}
	}
	persistSpecs(specs) {
		try {
			mkdirSync(dirname(this.stateFile), { recursive: true });
			writeFileSync(this.stateFile, JSON.stringify({ plugins: specs }, null, 2), "utf8");
		} catch {}
	}
	/** 把当前 patch 行规格并入状态文件（并集，不删除已停用的，保证停用后可还原）。 */
	syncSpecs() {
		const rows = this.readPatchRows();
		const map = /* @__PURE__ */ new Map();
		for (const spec of this.readSpecs()) map.set(spec.id, spec);
		for (const r of rows) {
			if (typeof r.id !== "string" || typeof r.name !== "string" || r.name === "") continue;
			map.set(r.id, {
				id: r.id,
				name: r.name,
				source: "patch"
			});
		}
		this.persistSpecs([...map.values()]);
	}
	/** 更新某规格的挂载来源（bundle 停用时记录，供重新启用走对路径）。 */
	setSpecSource(id, source) {
		const specs = this.readSpecs();
		const spec = specs.find((s) => s.id === id);
		if (spec === void 0) return;
		spec.source = source;
		this.persistSpecs(specs);
	}
};
//#endregion
//#region src/handles.ts
/**
* 按 agent+name 的引入句柄跟踪（模型工具与斜杠命令共用同一份，幂等语义）。
* 实例化：由插件持有（SkillControlPlugin 构造时创建），随插件实例生命周期存在；
* 底层 WeakMap：Agent 对象被回收即释放，不泄漏、不跨会话。
* 2026-08 重写：移除面板专用 appendAudit（审计是面板语义，已随面板下线）。
* 2026-08 会话引入集持久化（§3.2）：track/drop 后把「本会话引入了哪些池技能」落盘到
* <poolRoot>/.session-skills/<sessionId>.json；宿主重启后 resume 事件触发重放（见 replay）。
* 键用 agent.session.id（持久字符串，跨重启稳定；WeakMap 的 Agent 对象键跨重启失效）。
*/
const SESSION_SKILLS_DIR = ".session-skills";
var SessionSkillStore = class {
	introduced = /* @__PURE__ */ new WeakMap();
	/** 会话引入集落盘目录（poolRoot/.session-skills）；undefined = 不持久化（测试等）。 */
	persistDir;
	constructor(poolRoot) {
		this.persistDir = poolRoot === void 0 ? void 0 : join(poolRoot, SESSION_SKILLS_DIR);
	}
	/** 当前会话已引入的 skill 名清单。 */
	names(agent) {
		const map = this.introduced.get(agent);
		return map === void 0 ? [] : [...map.keys()];
	}
	/** 获取某 agent+name 的 disposer（未引入返回 undefined）。 */
	disposer(agent, name) {
		return this.introduced.get(agent)?.get(name);
	}
	/** 记录 disposer（幂等：同名覆盖）；随后把会话引入集落盘。 */
	track(agent, name, dispose) {
		let map = this.introduced.get(agent);
		if (map === void 0) {
			map = /* @__PURE__ */ new Map();
			this.introduced.set(agent, map);
		}
		map.set(name, dispose);
		this.persist(agent);
	}
	/** 摘除记录（disposer 由调用方先行执行）；随后把会话引入集落盘。 */
	drop(agent, name) {
		this.introduced.get(agent)?.delete(name);
		this.persist(agent);
	}
	/** 会话持久键：agent.session.id（与 agent.id 相同，跨重启稳定）。 */
	sessionId(agent) {
		return agent.session?.id ?? void 0;
	}
	/** 把当前会话引入名集写入 <persistDir>/<sessionId>.json（失败仅告警，不阻断引入）。 */
	persist(agent) {
		const dir = this.persistDir;
		const id = this.sessionId(agent);
		if (dir === void 0 || id === void 0) return;
		try {
			mkdirSync(dir, { recursive: true });
			const payload = {
				sessionId: id,
				skills: this.names(agent)
			};
			writeFileSync(join(dir, `${id}.json`), JSON.stringify(payload, null, 2), "utf8");
		} catch (error) {
			console.warn(`[skill-panel] persist session introduce-set for "${id}" failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/** 读取某会话上次落盘的引入名集（宿主重启后重放用）。 */
	readPersisted(sessionId) {
		const dir = this.persistDir;
		if (dir === void 0) return [];
		const path = join(dir, `${sessionId}.json`);
		if (!existsSync(path)) return [];
		try {
			const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
			const data = JSON.parse(text);
			return Array.isArray(data?.skills) ? data.skills.filter((s) => typeof s === "string") : [];
		} catch {
			return [];
		}
	}
};
//#endregion
//#region src/index.ts
/** 纯 host 插件（服务/RPC + 工具 + 命令）：挂载后为所有会话提供三面管理入口，操作维度仍按会话。 */
var SkillControlPlugin = class {
	static inject = [
		"agents",
		"tools",
		"skills",
		"commands"
	];
	static Config = z.object({
		poolRoot: z.string(),
		profileDir: z.string()
	});
	store;
	mcp;
	plugins;
	constructor(ctx, config = {}) {
		try {
			this.init(ctx, config);
		} catch (error) {
			console.error("[dshp-skill-panel] initialization failed; plugin disabled:", error);
		}
	}
	init(ctx, config) {
		const poolRoot = resolvePoolRoot(config.poolRoot);
		this.store = new SessionSkillStore(poolRoot);
		this.mcp = new SessionMcpManager(ctx, poolRoot);
		this.plugins = new PluginManager(ctx, this.mcp, config.profileDir);
		applySessionSkillTools(ctx, {
			poolRoot,
			store: this.store
		});
		applySessionSkillCommands(ctx, {
			poolRoot,
			store: this.store
		});
		applySessionMcpTools(ctx, { manager: this.mcp });
		ctx.effect(() => ctx.on("agent/session-start", (payload) => {
			if (payload.source !== "resume") return;
			replaySession(ctx, poolRoot, this.store, payload.agent);
		}), "skill-panel: session introduce-set replay");
		ctx.plugin(SkillPanelService, {
			poolRoot,
			store: this.store,
			mcp: this.mcp,
			plugins: this.plugins
		});
	}
};
//#endregion
export { SkillControlPlugin, SkillControlPlugin as default };
