#!/usr/bin/env bash
#
# setup-env.sh —— 一键搭建 dshp-skill-panel 的 dev/test 独立环境。
#
# 设计（grilling 定案）：
#   - 整体隔离：dev/test 各自独立 DSH_HOME（$PROJECT_ROOT/.dsh-<env>），不碰生产 ~/.dsh
#   - 面板代码：git clone 对应分支 → pnpm install → pnpm build → 真副本装入
#     <home>/profiles/web/node_modules/@super_camel/dsh-skill-panel（非软链）
#   - fixtures（仅 test）：skill-pool → <home>/.skill-pool/local/，
#     test-plugin → <home>/profiles/web/node_modules/dshp-test-plugin，
#     test-profile/cordis.patch.yml → <home>/profiles/web/cordis.patch.yml
#   - 生成 wrapper：dsh-dev / dsh-test（凭证 env 注入、--with-creds）
#
# 用法：
#   ./setup-env.sh dev     # 搭 dev 环境（clone main 分支）
#   ./setup-env.sh test    # 搭 test 环境（clone test 分支 + fixtures）
#   ./setup-env.sh dev --reclone   # 强制重新 clone
#
# 前置：git、pnpm、node ≥ 20；dsh 在 PATH（wrapper 需要）。

set -euo pipefail

ENV_NAME="${1:-}"
[ -n "$ENV_NAME" ] || { echo "用法: $0 <dev|test> [--reclone]"; exit 2; }
case "$ENV_NAME" in
  dev)  BRANCH="main";   WITH_FIXTURES=0 ;;
  test) BRANCH="test";   WITH_FIXTURES=1 ;;
  *) echo "错误: 未知环境 $ENV_NAME（应为 dev 或 test）"; exit 2 ;;
esac

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_TARGET="$PROJECT_ROOT/.dsh-$ENV_NAME"
CHECKOUT="$PROJECT_ROOT/checkouts/dshp-skill-panel-$ENV_NAME"
REPO_URL="https://github.com/KuramiWan/dshp-skill-panel.git"
RECLONE=0
[ "${2:-}" = "--reclone" ] && RECLONE=1

log()  { printf '\033[36m[setup-%s]\033[0m %s\n' "$ENV_NAME" "$*"; }
die()  { printf '\033[31m[setup-%s] ERROR: %s\033[0m\n' "$ENV_NAME" "$*" >&2; exit 1; }

# ---- 1. clone（复用已有 checkout，--reclone 强制重来） ----
if [ ! -d "$CHECKOUT/.git" ] || [ "$RECLONE" = "1" ]; then
  log "clone $BRANCH 分支 → $CHECKOUT"
  rm -rf "$CHECKOUT"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$CHECKOUT"
else
  log "复用已有 checkout $CHECKOUT（--reclone 可强制重来）"
fi

# ---- 2. build（clone 后必须 build：lib/ 不进 git） ----
log "pnpm install + build（lib/ 由 build 生成）"
cd "$CHECKOUT"
# 指定 store-dir：沙箱/受限环境里 pnpm 默认 store 的 SQLite 可能打不开；
# 宿主终端若想用默认 store，可设 PNPM_STORE_DIR="" 走系统默认。
if [ -n "${PNPM_STORE_DIR:-}" ]; then
  pnpm install --store-dir "$PNPM_STORE_DIR"
else
  pnpm install
fi
pnpm build
[ -f lib/index.js ] && [ -f lib/client.js ] || die "build 未产出 lib/index.js + lib/client.js"

# ---- 3. 创建独立 home 的 profile 骨架 ----
log "创建 $HOME_TARGET/profiles/web"
mkdir -p "$HOME_TARGET/profiles/web/node_modules/@super_camel"
mkdir -p "$HOME_TARGET/profiles/node_modules"
cat > "$HOME_TARGET/profiles/web/package.json" <<EOF
{
  "name": "dsh-profile-$ENV_NAME",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@super_camel/dsh-skill-panel"
      ]
    }
  }
}
EOF

# ---- 4. 面板代码真副本装入 profile ----
log "装入面板真副本（非软链）"
rm -rf "$HOME_TARGET/profiles/web/node_modules/@super_camel/dsh-skill-panel"
cp -r "$CHECKOUT" "$HOME_TARGET/profiles/web/node_modules/@super_camel/dsh-skill-panel"
[ -L "$HOME_TARGET/profiles/web/node_modules/@super_camel/dsh-skill-panel" ] && die "意外产生软链"

# ---- 5. fixtures（仅 test） ----
if [ "$WITH_FIXTURES" = "1" ]; then
  log "落地 test fixtures"
  # 5a. skill-pool → <home>/.skill-pool/local/（面板只扫 local/）
  mkdir -p "$HOME_TARGET/.skill-pool/local"
  cp -r "$CHECKOUT/test/fixtures/skill-pool/." "$HOME_TARGET/.skill-pool/local/"
  # 5b. test-plugin → node_modules/dshp-test-plugin（包名出现）
  rm -rf "$HOME_TARGET/profiles/web/node_modules/dshp-test-plugin"
  cp -r "$CHECKOUT/test/fixtures/test-plugin" "$HOME_TARGET/profiles/web/node_modules/dshp-test-plugin"
  # 5c. test-profile patch → profile 根
  cp "$CHECKOUT/test/fixtures/test-profile/cordis.patch.yml" "$HOME_TARGET/profiles/web/cordis.patch.yml"
  log "fixtures 就位：skill-pool ×4、dshp-test-plugin、test-mcp-stdio patch"
else
  # dev 环境用干净 patch
  cat > "$HOME_TARGET/profiles/web/cordis.patch.yml" <<'EOF'
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]
EOF
fi

# ---- 6. 生成 wrapper（dsh-dev / dsh-test） ----
log "生成 wrapper: $PROJECT_ROOT/dsh-$ENV_NAME"
if [ ! -e "$PROJECT_ROOT/dsh-env" ]; then
  die "缺少 $PROJECT_ROOT/dsh-env（wrapper 主体），请从仓库获取"
fi
ln -sf dsh-env "$PROJECT_ROOT/dsh-$ENV_NAME"
chmod +x "$PROJECT_ROOT/dsh-env"

# ---- 7. 验证组合 ----
log "验证组合（--dump-config 应含 dshp-skill-panel）"
if DSH_HOME="$HOME_TARGET" dsh --profile web --dump-config 2>/dev/null | grep -q "dshp-skill-panel"; then
  log "组合正确"
else
  die "组合验证失败：未找到 dshp-skill-panel"
fi

log "完成！启动方式："
log "  ./dsh-$ENV_NAME --port 3081            # 不带凭证"
log "  ./dsh-$ENV_NAME --with-creds --port 3081   # 注入生产凭证"
