export class SessionSkillStore {
    introduced = new WeakMap();
    /** 当前会话已引入的 skill 名清单。 */
    names(agent) {
        const map = this.introduced.get(agent);
        return map === undefined ? [] : [...map.keys()];
    }
    /** 获取某 agent+name 的 disposer（未引入返回 undefined）。 */
    disposer(agent, name) {
        return this.introduced.get(agent)?.get(name);
    }
    /** 记录 disposer（幂等：同名覆盖）。 */
    track(agent, name, dispose) {
        let map = this.introduced.get(agent);
        if (map === undefined) {
            map = new Map();
            this.introduced.set(agent, map);
        }
        map.set(name, dispose);
    }
    /** 摘除记录（disposer 由调用方先行执行）。 */
    drop(agent, name) {
        this.introduced.get(agent)?.delete(name);
    }
}
//# sourceMappingURL=handles.js.map