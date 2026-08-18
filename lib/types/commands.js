import { browsePool, filterBrowse, introduceSkill, removeSkill } from "./actions.js";
function renderBrowse(items) {
    if (items.length === 0)
        return '📚 技能池：无技能（先运行生态目录构建脚本填充本地池）';
    const lines = items.map(item => {
        const tag = item.origin === 'local' ? 'local' : 'ecosystem:' + (item.source ?? '?');
        const state = item.introduced ? ' [已引入]' : item.blockReason !== undefined ? ' [不可用]' : '';
        return '  - ' + item.name + ' (' + tag + ')' + state + ': ' + item.description;
    });
    return '📚 技能池（' + items.length + ' 条）：\n' + lines.join('\n');
}
/** /skill-browse [local|ecosystem] [query] —— 池浏览。 */
function handlerBrowse(poolRoot, store, invocation) {
    const tokens = invocation.rawInput.trim().split(/\s+/).filter(token => token.length > 0);
    let origin;
    let query;
    if (tokens[0] === 'local' || tokens[0] === 'ecosystem') {
        origin = tokens[0];
        if (tokens.length > 1)
            query = tokens.slice(1).join(' ');
    }
    else if (tokens.length > 0) {
        query = tokens.join(' ');
    }
    const items = filterBrowse(browsePool(poolRoot, invocation.agent, store), { origin, query });
    return { kind: 'success', text: renderBrowse(items.slice(0, 50)) };
}
/** /skill-search <query> —— 关键词搜索。 */
function handlerSearch(poolRoot, store, invocation) {
    const query = invocation.rawInput.trim();
    if (query.length === 0) {
        return { kind: 'error', text: '❌ 用法错误：/skill-search <关键词>' };
    }
    const items = filterBrowse(browsePool(poolRoot, invocation.agent, store), { query });
    if (items.length === 0)
        return { kind: 'success', text: '🔍 未找到与 "' + query + '" 匹配的技能' };
    return { kind: 'success', text: '🔍 搜索结果（' + items.length + ' 条）：\n' + renderBrowse(items.slice(0, 20)) };
}
/** /skill-list —— 当前会话已引入清单。 */
async function handlerList(ctx, store, invocation) {
    const agent = invocation.agent;
    const names = store.names(agent);
    if (names.length === 0)
        return { kind: 'success', text: '📋 当前会话已引入技能：0 个' };
    const view = await ctx.skills.list({ scope: agent });
    const lines = names.map(name => {
        const match = view.find(skill => skill.name === name);
        return '  - ' + name + (match?.description === undefined ? '' : ': ' + match.description);
    });
    return { kind: 'success', text: '📋 当前会话已引入技能（' + names.length + ' 个）：\n' + lines.join('\n') };
}
/** /skill-introduce <name> —— 从池引入到当前会话（会话结束自动消失；同名影子覆盖本会话）。 */
async function handlerIntroduce(ctx, poolRoot, store, invocation) {
    const agent = invocation.agent;
    const name = invocation.rawInput.trim();
    if (name.length === 0)
        return { kind: 'error', text: '❌ 用法错误：/skill-introduce <技能名>' };
    const result = await introduceSkill(ctx, poolRoot, store, agent, name);
    if (!result.ok)
        return { kind: 'error', text: '❌ ' + result.reason };
    if (result.alreadyIntroduced)
        return { kind: 'success', text: '✅ "' + result.name + '" 已在本会话引入（幂等，无需重复）' };
    const shadow = result.shadowed ? '（影子覆盖：本会话使用引入版，其余会话不受影响）' : '';
    return { kind: 'success', text: '✅ 已引入 "' + result.name + '"（' + result.origin + '）到当前会话' + shadow };
}
/** /skill-remove <name> —— 从当前会话移除（幂等，未引入时报错）。 */
function handlerRemove(store, invocation) {
    const agent = invocation.agent;
    const name = invocation.rawInput.trim();
    if (name.length === 0)
        return { kind: 'error', text: '❌ 用法错误：/skill-remove <技能名>' };
    const result = removeSkill(store, agent, name);
    if (!result.ok)
        return { kind: 'error', text: '❌ ' + result.reason };
    return { kind: 'success', text: '🗑 已移除 "' + result.name + '"（当前会话）' };
}
/** 注册五个 /skill-* 斜杠命令（全局，经 ctx.commands 供所有会话的 `/` 菜单发现）。 */
export function applySessionSkillCommands(ctx, config) {
    const poolRoot = config.poolRoot;
    const store = config.store;
    ctx.effect(() => ctx.commands.register({
        name: 'skill-browse',
        description: 'list skills in the pool (local + subscribed ecosystem + catalog); optional [local|ecosystem] origin and keyword query',
        input: { hint: '[<origin>] [<query>]' },
        handler: invocation => handlerBrowse(poolRoot, store, invocation),
    }));
    ctx.effect(() => ctx.commands.register({
        name: 'skill-search',
        description: 'search the pool for a skill by keyword in name or description',
        input: { hint: '<query>' },
        handler: invocation => handlerSearch(poolRoot, store, invocation),
    }));
    ctx.effect(() => ctx.commands.register({
        name: 'skill-list',
        description: 'list skills introduced into this session',
        handler: invocation => handlerList(ctx, store, invocation),
    }));
    ctx.effect(() => ctx.commands.register({
        name: 'skill-introduce',
        description: 'introduce a pool skill into this session (vanishes when the session ends)',
        input: { hint: '<name>' },
        handler: invocation => handlerIntroduce(ctx, poolRoot, store, invocation),
    }));
    ctx.effect(() => ctx.commands.register({
        name: 'skill-remove',
        description: 'remove a skill introduced into this session',
        input: { hint: '<name>' },
        handler: invocation => handlerRemove(store, invocation),
    }));
}
//# sourceMappingURL=commands.js.map