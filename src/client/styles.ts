/** 技能面板一次性样式：全部走 DSH 真实主题令牌（定义在 body，含 body[data-ds-dark-theme] 深色分支），
 *  注入 <style data-plugin>。令牌清单来自 Client Inspect `Theme.listTokens`；勿用未列出的自定义 --dsw-alias-* 名。 */
import type { Context } from '@deepseek-ai/cordis'

export const STYLE_ID = 'dshp-skill-panel-css'

const CSS = `
.dshp-root{display:flex;flex-direction:column;gap:10px;font-family:inherit}
.dshp-toolbar{display:flex;align-items:center;gap:8px}
.dshp-search{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 8px;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}
.dshp-search:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-select{background:var(--dsw-alias-bg-layer-1,transparent);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;padding:4px 6px;color:var(--dsw-alias-label-primary,#1f2328);font-size:13px}
.dshp-list{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto}
.dshp-item{display:flex;flex-direction:column;gap:4px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));border-radius:8px;padding:8px 10px}
.dshp-item-head{display:flex;align-items:center;gap:8px}
.dshp-name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);flex:0 0 auto}
.dshp-tag{font-size:11px;line-height:16px;padding:0 6px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 14%,transparent);color:var(--dsw-alias-brand-primary,#2563eb)}
.dshp-tag-eco{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshp-tag-intro{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706)}
.dshp-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#4b5563)}
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
`

export function ensureStyle(ctx: Context): void {
  ctx.effect(() => {
    if (typeof document !== 'undefined' && document.getElementById(STYLE_ID) === null) {
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = 'skill-panel'
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
    return () => {
      if (typeof document !== 'undefined') document.getElementById(STYLE_ID)?.remove()
    }
  }, 'skill-panel: styles')
}
