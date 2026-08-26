/**
 * dshp-test-plugin 入口：注册一个最简 cordis plugin，挂载到组合后仅打一条日志。
 * 不实现真实业务 —— 用途是让浏览器面板的「插件」页签里能看到一行可热启停的记录。
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dshp-test-plugin'

export function apply(ctx: Context): void {
  ctx.on('ready', () => {
    ctx.logger('test-plugin').info('dshp-test-plugin ready')
  })
}
