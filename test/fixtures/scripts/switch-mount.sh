#!/usr/bin/env bash
#
# dshp-skill-panel 本地挂载切换脚本（归档版，历史存档，不作开发调用）
#
# 在「开发模式」（link 到工作区，改动即生效）与「真实使用模式」（用已安装/已发布的
# 真实副本）之间切换 web profile 里挂载的 @super_camel/dsh-skill-panel。
#
# 归档说明：本脚本曾用于旧的 DSH_HOME 隔离方案的开发循环；现环境用官方 profile
# 机制 + 真副本（非软链），本脚本仅作历史参考，DSH test profile 接入不依赖它。
#

set -euo pipefail

# ---- 配置（按需调整）----
PACKAGE="dsh-skill-panel"
SCOPE="@super_camel"
PROFILE="${DSH_WEB_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
WS="${DSH_SKILL_PANEL_WS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
NM_DIR="$PROFILE/node_modules/$SCOPE"
MOUNT="$NM_DIR/$PACKAGE"
BACKUP="$NM_DIR/.dshp-skill-panel-real"

log()  { printf '\033[36m[dshp-switch]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[dshp-switch] ERROR: %s\033[0m %s\n' "$*" >&2; exit 1; }

[ -d "$PROFILE" ] || die "web profile 目录不存在: $PROFILE (可用 DSH_WEB_PROFILE_DIR 覆盖)"
[ -d "$WS" ] || die "工作区不存在：$WS"
[ -d "$MOUNT" ] || die "挂载目录不存在：$MOUNT（先装一次插件再切换）"

current_mode() {
  if [ -L "$MOUNT" ]; then echo "dev"; else echo "prod"; fi
}

do_dev() {
  log "当前模式: $(current_mode) → 切换到 dev（link 到工作区）"
  if [ -L "$MOUNT" ]; then
    log "已是 dev（symlink 存在），跳过挂载切换。"
  else
    if [ -e "$BACKUP" ]; then
      log "检测到已有备份，移除当前真实副本（$MOUNT）。"
      rm -rf "$MOUNT"
    else
      log "首次切换：把真实副本备份到 $BACKUP"
      mkdir -p "$NM_DIR"
      mv "$MOUNT" "$BACKUP"
    fi
    ln -s "$WS" "$MOUNT"
    log "已建立 symlink: $MOUNT → $WS"
  fi
  log "构建工作区产物（pnpm build）..."
  ( cd "$WS" && pnpm build )
  log "dev 就绪。注意：请重启 web（dsh web）以加载新的 host 代码。"
}

do_prod() {
  log "当前模式: $(current_mode) → 切换到 prod（真实已安装副本）"
  if [ ! -L "$MOUNT" ]; then
    log "已是 prod（非 symlink），跳过。"
    return 0
  fi
  [ -e "$BACKUP" ] || die "找不到真实副本备份 $BACKUP；无法还原（或许从未 dev 过）"
  rm "$MOUNT"
  mv "$BACKUP" "$MOUNT"
  log "已还原真实副本。prod 就绪。"
}

do_status() {
  log "当前模式: $(current_mode)"
  if [ -L "$MOUNT" ]; then
    echo "  symlink 目标: $(readlink "$MOUNT")"
  else
    echo "  版本: $(node -p "require('$MOUNT/package.json').version" 2>/dev/null || echo '?')"
  fi
}

case "${1:-}" in
  dev|link|workspace)  do_dev ;;
  prod|real|use|install) do_prod ;;
  status) do_status ;;
  *) die "用法: $0 {dev|prod|status}" ;;
esac
