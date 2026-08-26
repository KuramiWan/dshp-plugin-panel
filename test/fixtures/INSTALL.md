# INSTALL — 接入 DSH test profile

把 `test/fixtures/` 下的制品装进 DSH 的**独立 test profile**，与生产 web profile 完全隔离。

## 一次性 setup

```bash
# 1. 创建 test profile 目录（如果已存在则跳过）
mkdir -p ~/.dsh/profiles/test/node_modules

# 2. 把本仓各制品软链到 profile 的 node_modules
ln -s "$(pwd)/test/fixtures/test-plugin" ~/.dsh/profiles/test/node_modules/dshp-test-plugin

# 3. 软链 skill-pool 到 DSH skill-pool 目录
mkdir -p ~/.dsh/.skill-pool
ln -s "$(pwd)/test/fixtures/skill-pool" ~/.dsh/.skill-pool/test-local

# 4. 复制 test-profile/cordis.patch.yml 到 profile 根（DSH 会 watch 该文件）
cp "$(pwd)/test/fixtures/test-profile/cordis.patch.yml" ~/.dsh/profiles/test/cordis.patch.yml

# 5. 创建 profile 的 package.json（标 bundles）
cat > ~/.dsh/profiles/test/package.json <<'EOF'
{
  "name": "dsh-profile-test",
  "private": true,
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

# 6. 装该 profile 的依赖（@deepseek-ai/dsh-base / dsh-web-app / dsh-skill-panel）
# 最快的做法：cp -r 整个 web profile 的 node_modules（已装好），然后 symlink @super_camel/dsh-skill-panel
cp -r ~/.dsh/profiles/web/node_modules/. ~/.dsh/profiles/test/node_modules/
# 覆盖：让 test profile 的 dsh-skill-panel 指向主仓工作区（dev mode）
rm -rf ~/.dsh/profiles/test/node_modules/@super_camel/dsh-skill-panel
ln -s ~/code/dshp-skill-panel ~/.dsh/profiles/test/node_modules/@super_camel/dsh-skill-panel
```

> 软链而不是复制：test 分支改了立刻生效，无需重装。

## 启动 DSH（切到 test profile）

DSH CLI 启动时用 `--profile <name>`：

```bash
cd ~/dev/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts web --profile test
```

或您现有的 `restart-web.ps1` 加一个 `--profile test` 版本。

## 验证

打开 `http://127.0.0.1:3081/`，进入 设置 → 技能面板：

- **技能页签**应看到 4 个技能：alpha（带 tag test/demo）、beta（无 tag）、gamma（带 tag test）、delta（带 tag demo）
- **插件页签**应看到：
  - 「热插拔」section：dshp-test-plugin
  - 「MCP 会话连接」section：test-mcp-stdio（command 故意指向不存在二进制，"检查"会失败——是预期）

## 改 fixture 后的开发循环

- 改 `test/fixtures/skill-pool/*/SKILL.md`：刷新面板即生效（DSH 直接读文件）
- 改 `test/fixtures/test-plugin/src/index.ts`：需重启 DSH web（冷挂载）或重新链接
- 改 `test/fixtures/test-profile/cordis.patch.yml`：DSH 的 `watchUserPatches` 自动热重载

## 回到生产

```bash
cd ~/dev/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts web --profile web
```

`~/.dsh/profiles/test/` 不会被 web profile 读到（profile 隔离）。
