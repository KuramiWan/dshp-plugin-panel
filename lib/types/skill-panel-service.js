import { findPoolEntry, readSkillContent } from "./pool.js";
import { browsePool, introduceSkill, removeSkill, filterBrowse } from "./actions.js";
/** 面板 host 服务：只读为主；写操作与命令/工具同路径。 */
export class SkillPanelService {
    static inject = ['agents', 'skills'];
    ctx;
    poolRoot;
    store;
    constructor(ctx, options) {
        this.ctx = ctx;
        this.poolRoot = options.poolRoot;
        this.store = options.store;
        const webServer = ctx.get('webServer');
        if (webServer === undefined)
            return;
        ctx.effect(() => webServer.register({
            kind: 'prefix',
            path: '/skill-panel',
            handler: (req, res) => void this.dispatch(req, res),
        }), 'skill-panel: /skill-panel router');
    }
    agentOf(sessionId) {
        const agent = this.ctx.agents.get(sessionId);
        if (agent === undefined) {
            throw new Error(`skillPanel: session "${sessionId}" is not a live agent`);
        }
        return agent;
    }
    /** 路由分发：POST /skill-panel/<method>，body 为 JSON 载荷。 */
    async dispatch(req, res) {
        try {
            if (req.method !== 'POST') {
                this.send(res, 405, { ok: false, reason: 'method not allowed, use POST' });
                return;
            }
            const url = req.url ?? '/skill-panel/';
            const method = this.pathMethod(url);
            if (method === undefined) {
                this.send(res, 404, { ok: false, reason: 'unknown endpoint' });
                return;
            }
            // 读取并解析 JSON body
            const body = await this.readBody(req);
            const payload = body.length === 0 ? {} : JSON.parse(body);
            let result;
            switch (method) {
                case 'browse':
                    result = this.browse(payload);
                    break;
                case 'list':
                    result = await this.list(payload);
                    break;
                case 'detail':
                    result = this.detail(payload);
                    break;
                case 'introduce':
                    result = await this.introduce(payload);
                    break;
                case 'removeSkill':
                    result = this.removeSkill(payload);
                    break;
                default:
                    this.send(res, 404, { ok: false, reason: `unknown method "${method}"` });
                    return;
            }
            this.send(res, 200, result);
        }
        catch (error) {
            this.send(res, 400, { ok: false, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    pathMethod(rawUrl) {
        // /skill-panel/browse -> browse
        const m = rawUrl.match(/^\/skill-panel\/([a-zA-Z_]+)\/?$/);
        return m === null ? undefined : m[1];
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', chunk => { chunks.push(chunk); });
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }
    send(res, status, data) {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    }
    /** 池浏览（本地 + 已订阅生态 + 未订阅目录），支持来源过滤与关键词。 */
    browse(request) {
        const agent = this.agentOf(request.sessionId);
        const items = filterBrowse(browsePool(this.poolRoot, agent, this.store), {
            origin: request.origin,
            query: request.query,
        });
        const limit = typeof request.limit === 'number' ? Math.max(1, Math.floor(request.limit)) : 100;
        return { entries: items.slice(0, limit) };
    }
    /** 当前会话已引入清单。 */
    async list(request) {
        const agent = this.agentOf(request.sessionId);
        const names = this.store.names(agent);
        if (names.length === 0)
            return { skills: [] };
        const view = await this.ctx.skills.list({ scope: agent });
        return {
            skills: names.map(name => {
                const match = view.find(skill => skill.name === name);
                return { name, ...(match?.description === undefined ? {} : { description: match.description }) };
            }),
        };
    }
    /** 单个技能的完整定义（名称/来源/说明/适用场景/正文）。 */
    detail(request) {
        const entry = findPoolEntry(this.poolRoot, request.name);
        if (entry === undefined)
            return { ok: false, reason: `池中未找到 "${request.name}"` };
        const def = readSkillContent(entry);
        if (def === undefined)
            return { ok: false, reason: `"${request.name}" 在池中不可读` };
        return {
            ok: true,
            name: def.name,
            origin: entry.origin,
            ...(entry.source === undefined ? {} : { source: entry.source }),
            description: def.description,
            ...(def.whenToUse === undefined ? {} : { whenToUse: def.whenToUse }),
            content: def.content,
        };
    }
    /** 从池引入到当前会话（幂等；同名影子覆盖仅本会话）。 */
    async introduce(request) {
        const agent = this.agentOf(request.sessionId);
        const result = await introduceSkill(this.ctx, this.poolRoot, this.store, agent, request.name);
        if (!result.ok)
            return { ok: false, reason: result.reason };
        return {
            ok: true,
            name: result.name,
            origin: result.origin,
            shadowed: result.shadowed,
            alreadyIntroduced: result.alreadyIntroduced,
        };
    }
    /** 从当前会话移除（幂等；未引入时报错）。方法名避开 RemoteNamespaceService 保留名（remove 冲突）。 */
    removeSkill(request) {
        const agent = this.agentOf(request.sessionId);
        const result = removeSkill(this.store, agent, request.name);
        if (!result.ok)
            return { ok: false, reason: result.reason };
        return { ok: true, name: result.name };
    }
}
//# sourceMappingURL=skill-panel-service.js.map