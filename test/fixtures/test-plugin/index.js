/**
 * dshp-test-plugin 入口（JS 版）。
 *
 * 为什么是 .js 而不是 .ts：DSH 的 Node loader 不支持从 node_modules
 * 目录加载 .ts 源文件（ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING），
 * 而本 fixture 以真副本形式放进 profile 的 node_modules —— 因此入口
 * 必须是构建后的 JS。逻辑与 src/index.ts 完全一致：
 * 注册一个最简 cordis plugin，挂载到组合后仅打一条日志。
 *
 * 不实现真实业务 —— 用途是让浏览器面板的「插件」页签里能看到一行
 * 可热启停的记录。
 */
export const name = 'dshp-test-plugin'

export function apply(ctx) {
  ctx.on('ready', () => {
    ctx.logger('test-plugin').info('dshp-test-plugin ready')
  })
}
