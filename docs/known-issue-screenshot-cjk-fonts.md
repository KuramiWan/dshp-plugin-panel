# Known issue: README 截图存在 CJK 豆腐块（□）

**状态（2026-08-30）：已解决** —— 根因是 Linux fontconfig 未登记 `/mnt/c/Windows/Fonts`（截图机为 WSL，微软雅黑/黑体/宋体/Noto Sans SC 等中文字体一直都在，只是 fontconfig 看不见，`fc-list :lang=zh` 为 0）。**修复**：给 headless Chrome 设 `FONTCONFIG_FILE` 指向一份自定义 `fonts.conf`（include 系统配置 + `<dir>/mnt/c/Windows/Fonts</dir>`，另设可写 `cachedir`）即恢复中文渲染。同时截图环境（`./dsh-test` 根隔离实例，独立 settings.yaml）已将 UI 切至中文后重拍，README 三图为中文 UI。

**原始症状（2026-08-29 首拍）**：部分字符显示为方框（tofu）——fixture 技能（alpha/beta/gamma/delta）的中文描述，以及分组计数全角括号 `（1）`（面板 i18n 自带，英文界面同样命中）。

**通用缓解（他人复现时）**：
1. 装任一 CJK 字体（如 `fonts-noto-cjk`），或按上文 `fonts.conf` 指向现成字体目录；
2. 或把面板的全角分组计数括号 `（n）` 改半角 `(n)`（硬编码于 `src/client/view.tsx` 与 `src/client/plugin-view.tsx` 的分组计数模板，不在 `locale.ts`），可消除英文 UI 截图的豆腐块（fixture 中文描述建议不纳入取景）。
