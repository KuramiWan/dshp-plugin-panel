#!/usr/bin/env bash
#
# setup-env.sh —— 一键搭建 dshp-skill-panel 的 dev/test profile。
#
# 方案（grilling 定案，2026-08）：官方 profile 机制。
#   一个 DSH home（~/.dsh），多个 profile 区分环境：
#     web   生产（npm 发布版，本脚本不管理）
#     dev   main 分支代码（clone → build → 真副本装入 ~/.dsh/profiles/dev）
#     test  test 分支代码 + fixtures（真副本 + poolRoot 隔离技能池）
#   共享：~/.dsh 凭证/会话/设置（profile 机制天然如此）。
#   隔离：组合层（每 profile 独立 node_modules + bundles + patch）；技能池
#         （test 用 poolRoot 指到独立 pool，fixtures 不污染生产技能页签）。
#
# 环境定义唯一真相源：envs.yaml（本仓库根）。
#
# 用法：
#   ./setup-env.sh dev      # 搭 dev profile
#   ./setup-env.sh test     # 搭 test profile
#   ./setup-env.sh dev --reclone   # 强制重新 clone
#
# 前置：git、pnpm、node ≥ 20；dsh 在 PATH；envs.yaml 在仓库根。

set -euo pipefail

ENV_NAME="${1:-}"
[ -n "$ENV_NAME" ] || { echo "用法: $0 <dev|test> [--reclone]"; exit 2; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVS_FILE="$PROJECT_ROOT/envs.yaml"
[ -f "$ENVS_FILE" ] || { echo "错误: 缺少 $ENVS_FILE（环境定义）"; exit 2; }

# 读 envs.yaml（用 node + js-yaml，dsh 安装自带）
# shellcheck disable=SC2016
ENV_JSON="$(ENVS_FILE="$ENVS_FILE" node -e '
  const fs = require("fs");
  const yaml = require("/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/js-yaml");
  const doc = yaml.load(fs.readFileSync(process.env.ENVS_FILE, "utf8"));
  const name = process.argv[1];
  const env = doc.profiles?.[name];
  if (!env) { console.error(`envs.yaml 未定义 profile: ${name}`); process.exit(1); }
  process.stdout.write(JSON.stringify(env));
' "$ENV_NAME")"
[ -n "$ENV_JSON" ] || exit 2

# 一次 node 解析出各字段（避免多次子进程）
BRANCH="$(printf '%s' "$ENV_JSON" | node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(e.branch??"")')"
MANAGED="$(printf '%s' "$ENV_JSON" | node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(e.managed??true))')"
WITH_FIXTURES="$(printf '%s' "$ENV_JSON" | node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(e.fixtures??false))')"
POOL_MODE="$(printf '%s' "$ENV_JSON" | node -e 'const e=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(e.pool??"default")')"

if [ "$MANAGED" != "true" ]; then
  echo "错误: profile $ENV_NAME 标记 managed=false（生产环境不归本脚本管理，用 restore-web-profile.sh）" >&2
  exit 2
fi
[ -n "$BRANCH" ] || { echo "错误: envs.yaml 未给 $ENV_NAME 定义 branch" >&2; exit 2; }

DSH_HOME_TARGET="${DSH_HOME_TARGET:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_TARGET/profiles/$ENV_NAME"
CHECKOUT="$PROJECT_ROOT/checkouts/dshp-skill-panel-$ENV_NAME"
REPO_URL="https://github.com/KuramiWan/dshp-skill-panel.git"
RECLONE=0
[ "${2:-}" = "--reclone" ] && RECLONE=1

log()  { printf '\033[36m[setup-%s]\033[0m %s\n' "$ENV_NAME" "$*"; }
die()  { printf '\033[31m[setup-%s] ERROR: %s\033[0m\n' "$ENV_NAME" "$*" >&2; exit 1; }

# ---- 1. clone（复用已有 checkout 时先 fetch 更新，--reclone 强制重来） ----
if [ ! -d "$CHECKOUT/.git" ] || [ "$RECLONE" = "1" ]; then
  log "clone $BRANCH 分支 → $CHECKOUT"
  rm -rf "$CHECKOUT"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$CHECKOUT"
else
  log "复用已有 checkout $CHECKOUT，fetch 更新…"
  git -C "$CHECKOUT" fetch origin "$BRANCH" --depth 1 2>/dev/null || true
  git -C "$CHECKOUT" reset --hard "origin/$BRANCH" 2>/dev/null || true
fi

# ---- 2. build（clone 后必须 build：lib/ 不进 git） ----
log "pnpm install + build（lib/ 由 build 生成）"
cd "$CHECKOUT"
if [ -n "${PNPM_STORE_DIR:-}" ]; then
  pnpm install --store-dir "$PNPM_STORE_DIR"
else
  pnpm install
fi
pnpm build
[ -f lib/index.js ] && [ -f lib/client.js ] || die "build 未产出 lib/index.js + lib/client.js"

# ---- 3. 创建 profile 骨架 ----
log "创建 $PROFILE_DIR"
mkdir -p "$PROFILE_DIR/node_modules/@super_camel"
cat > "$PROFILE_DIR/package.json" <<EOF
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
rm -rf "$PROFILE_DIR/node_modules/@super_camel/dsh-skill-panel"
cp -r "$CHECKOUT" "$PROFILE_DIR/node_modules/@super_camel/dsh-skill-panel"
[ -L "$PROFILE_DIR/node_modules/@super_camel/dsh-skill-panel" ] && die "意外产生软链"

# ---- 5. fixtures（仅 test） ----
if [ "$WITH_FIXTURES" = "true" ]; then
  log "落地 test fixtures"
  # 5a. skill-pool → 独立 pool（poolRoot 隔离，不污染生产技能页签）
  if [ "$POOL_MODE" = "isolated" ]; then
    POOL_DIR="$PROJECT_ROOT/.pool-$ENV_NAME"
    mkdir -p "$POOL_DIR/local"
    cp -r "$CHECKOUT/test/fixtures/skill-pool/." "$POOL_DIR/local/"
    log "技能池 → $POOL_DIR（poolRoot 隔离）"
  else
    mkdir -p "$DSH_HOME_TARGET/.skill-pool/local"
    cp -r "$CHECKOUT/test/fixtures/skill-pool/." "$DSH_HOME_TARGET/.skill-pool/local/"
    log "技能池 → $DSH_HOME_TARGET/.skill-pool/local（共享）"
  fi
  # 5b. test-plugin → node_modules/dshp-test-plugin（包名出现）
  rm -rf "$PROFILE_DIR/node_modules/dshp-test-plugin"
  cp -r "$CHECKOUT/test/fixtures/test-plugin" "$PROFILE_DIR/node_modules/dshp-test-plugin"
  # 5c. test-profile patch → profile 根（含 dshp-test-plugin 行；test-mcp-stdio 不走 patch，见 5e）
  cp "$CHECKOUT/test/fixtures/test-profile/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml"
  # 5d. 面板行 config 注入：profileDir（显式声明本 profile，避免 resolveProfileDir 猜错回退 web）
  #      + poolRoot（isolated 时隔离技能池）
  {
    printf '\n# 显式声明本 profile（面板 plugin-manager 不再扫描猜测）\n- id: dshp-skill-panel\n  config:\n    profileDir: %s\n' "$PROFILE_DIR"
    if [ "$POOL_MODE" = "isolated" ]; then
      printf '    poolRoot: %s\n' "$POOL_DIR"
    fi
  } >> "$PROFILE_DIR/cordis.patch.yml"
  # 5e. mcp 白名单（test-mcp-stdio 走 MCP 段管理）：若写进 profile patch 会被插件段
  #     误当 patch 行（启停报"已在 patch 中"）。白名单让面板在 MCP 段以会话连接/断开。
  #     位置跟随 poolRoot（mcp-manager 读 <poolRoot>/.mcp-whitelist.json）。
  MCP_WHITELIST_ROOT="${POOL_DIR:-$DSH_HOME_TARGET/.skill-pool}"
  cat > "$MCP_WHITELIST_ROOT/.mcp-whitelist.json" <<'EOF'
{
  "servers": [
    {
      "name": "test-mcp-stdio",
      "transport": "stdio",
      "command": "__nonexistent_fixture_server__",
      "args": []
    }
  ]
}
EOF
  log "fixtures 就位：skill-pool ×4、dshp-test-plugin、test-mcp-stdio（MCP 白名单）"
else
  # dev 环境：干净 patch + 显式 profileDir（避免 resolveProfileDir 猜错回退 web）
  cat > "$PROFILE_DIR/cordis.patch.yml" <<EOF
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
[]

# 显式声明本 profile（面板 plugin-manager 不再扫描猜测）
- id: dshp-skill-panel
  config:
    profileDir: $PROFILE_DIR
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
if DSH_HOME="$DSH_HOME_TARGET" dsh --profile "$ENV_NAME" --dump-config 2>/dev/null | grep -q "dshp-skill-panel"; then
  log "组合正确"
else
  die "组合验证失败：未找到 dshp-skill-panel"
fi

log "完成！启动方式："
log "  dsh --profile $ENV_NAME --port 3081   # 直接启动（凭证/会话共享 ~/.dsh）"
log "  或 ./dsh-$ENV_NAME --port 3081        # wrapper"
