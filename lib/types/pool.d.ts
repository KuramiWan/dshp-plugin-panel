export interface PoolEntry {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
    readonly origin: 'local' | 'ecosystem';
    readonly source?: string;
    readonly directory: string;
    readonly available: boolean;
    readonly trusted: boolean;
}
export interface SkillContent {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
    readonly content: string;
    readonly directory: string;
}
interface Frontmatter {
    name: string | undefined;
    description: string | undefined;
    whenToUse: string | undefined;
    disableModel: boolean | undefined;
    userInvocable: boolean | undefined;
}
export interface EnvLike {
    DSH_HOME?: string;
}
/**
 * DSH home 解析优先级（对齐 @deepseek-ai/dsh-home-paths resolveDshHome）：
 * 显式配置 > `$DSH_HOME` > `~/.dsh`。空/纯空白的 `$DSH_HOME` 视为未设置。
 * home 目录本身默认即 `~/.dsh`（`$DSH_HOME` 让位时直接是 `~/.dsh`），
 * 技能池固定位于该 home 下的 `.skill-pool` 子目录。
 */
export declare function defaultPoolRoot(env?: EnvLike): string;
/** 显式提供的 poolRoot 或默认根。 */
export declare function resolvePoolRoot(poolRoot: string | undefined, env?: EnvLike): string;
export declare function isValidSkillName(name: string): boolean;
export declare function parseSkillFile(raw: string): {
    fm: Frontmatter;
    body: string;
} | undefined;
/** 扫描本地池与已订阅生态目录（磁盘真相）。 */
export declare function listPoolEntries(poolRoot: string): PoolEntry[];
/** 生态目录（.catalog.json）中尚未订阅的条目：available=false。 */
export declare function listUnsubscribedCatalogEntries(poolRoot: string): PoolEntry[];
export declare function findPoolEntry(poolRoot: string, name: string): PoolEntry | undefined;
export declare function readSkillContent(entry: PoolEntry): SkillContent | undefined;
export {};
//# sourceMappingURL=pool.d.ts.map