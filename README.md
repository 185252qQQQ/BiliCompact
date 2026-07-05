# BiliCompact
BiliCompact – A Tampermonkey script that severely trims the Bilibili web feed.
# BiliCompact
[中文](#中文) | [English](#english)
---
## 中文

###  项目简介

**BiliCompact** —— 一款针对 B 站（Bilibili）网页端的 **Tampermonkey 用户脚本**，让你对首页、分区、动态、搜索等页面上的视频流拥有精确的控制力。

你是否厌倦了 B 站首页和各类页面铺天盖地的视频流？BiliCompact 让你精确控制显示的视频数量，并智能过滤直播、广告、番剧、付费内容等冗余信息。

###  功能特性

- **数量限制**：设置最大显示视频数量（1~100 个），告别信息过载。
- **智能过滤**：
  - 排除直播
  - 排除广告 / 推广（可选择保留推广位但不计入总数）
  - 排除番剧（Bangumi）
  - 排除付费课程
- **白名单机制**：保留指定 UP 主（通过 UID）的视频，不受数量限制。
- **一键切换**：悬浮按钮可随时开启 / 关闭精简模式，恢复原始视图。
- **实时计数器**：展示当前显示 / 总视频数，以及隐藏数量。
- **快捷键支持**：`Ctrl+Shift+数字` 快速调整数量（例如 `Ctrl+Shift+5` 立即显示 5 个视频，`Ctrl+Shift+0` 关闭精简）。
- **配置持久化**：所有设置自动保存在浏览器中，跨页面生效。
- **悬浮配置面板**：可视化调整所有选项，无需手动编辑脚本。
- **广泛兼容**：适用于 B 站首页、分区（动画、音乐、游戏、科技等）、动态、搜索、番剧、国创等绝大多数页面。
- **轻量高效**：使用 MutationObserver 监听动态加载，节流防抖，性能优化。

###  安装方法

1. 确保浏览器已安装 **Tampermonkey** 或 **Violentmonkey** 等用户脚本管理器。
2. 点击以下链接安装脚本（或手动新建脚本，将源码粘贴进去）：
   - [GitHub 原始链接]（将 `https://raw.githubusercontent.com/你的用户名/仓库名/main/脚本文件名.user.js` 替换为实际地址）
3. 刷新 B 站页面，即可在左下角看到控制按钮。

> 建议配合 **Adblock** 等插件使用，效果更佳。

###  使用指南

- **切换精简状态**：点击页面右下角的 `🔴 精简已开启` 按钮，一键开启 / 关闭精简。
- **调整数量**：使用快捷键 `Ctrl+Shift+1~9` 快速设置最大数量（例如 `Ctrl+Shift+5` 表示最多显示 5 个视频）。
- **打开配置面板**：点击 Tampermonkey 菜单中的 `⚙️ B站精简设置`，或通过脚本菜单项进入可视化配置。

###  配置选项（面板可调）

| 选项 | 说明 |
|------|------|
| 最大显示数量 | 限制页面最多显示的视频个数（默认 10） |
| 排除直播 | 隐藏正在直播的卡片 |
| 排除广告 | 隐藏含有广告 / 推广标记的卡片 |
| 排除番剧 | 隐藏番剧相关卡片（如“追番”等） |
| 排除付费课程 | 隐藏付费 / 课程类视频 |
| 保留推广位 | 保留推广卡片，但不计入总数（仍会显示） |
| 保留 UP 主 ID | 输入数字 UID（逗号分隔），这些 UP 主的视频将始终显示 |
| 显示计数器 | 在左上角显示视频统计信息 |
| 显示切换按钮 | 在右下角显示开启 / 关闭按钮 |
| 启用快捷键 | 允许使用 Ctrl+Shift+数字 调整数量 |

所有更改**自动保存**，无需重启脚本。

###  快捷键一览

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Shift+1` ~ `Ctrl+Shift+9` | 设置最大显示数量为 1~9 |
| `Ctrl+Shift+0` | 关闭精简模式（恢复全部视频） |

> 若快捷键无响应，请检查是否与其他浏览器扩展冲突，并确保脚本配置中“启用快捷键”已勾选。

###  注意事项

- 本脚本仅作用于 **B 站网页端**，不影响移动端或 APP。
- 由于 B 站页面结构可能更新，若失效请提 Issue，我会尽快适配。
- 脚本会尝试自动探测页面上的视频卡片，如遇未覆盖页面，欢迎反馈。
- 已测试环境：Chrome + Tampermonkey，Firefox + Violentmonkey 基本兼容。

###  开发者相关

- **技术栈**：原生 JavaScript + GM_* API
- **代码风格**：ES5 兼容（保证广泛兼容性）
- **调试模式**：在配置面板中开启 `debug` 选项（需要手动在脚本中修改 `config.debug = true` 或通过 GM 存储设置），可在控制台查看详细日志。

###  贡献与反馈

欢迎提交 Issue、Pull Request 或任何建议！

- **Issue 模板**：请描述使用的浏览器、脚本管理器版本、B 站页面 URL 以及重现步骤。
- **PR 指引**：请确保代码风格一致，并测试在多种页面下的兼容性。

###  开源协议

本项目采用 [MIT License](LICENSE) 授权，你可以自由使用、修改、分发。

---

## English

###  Introduction

**BiliCompact** is a **Tampermonkey userscript** that gives you precise control over the video feed on Bilibili (B站) web pages – homepage, channels, search, dynamic, and more.

Tired of endless video streams? BiliCompact lets you set a maximum number of visible videos and automatically filters out live streams, ads, bangumi, paid courses, and other clutter.

###  Features

- **Limit video count**: Set a max number (1–100) to avoid information overload.
- **Smart filters**:
  - Exclude live streams
  - Exclude ads / promotions (optionally keep promoted items without counting them)
  - Exclude bangumi (anime series)
  - Exclude paid courses
- **Whitelist**: Keep videos from specific UP IDs – they are always shown regardless of the limit.
- **One‑click toggle**: Floating button to enable/disable the limiter instantly.
- **Live counter**: Shows current displayed / total videos and hidden count.
- **Keyboard shortcuts**: `Ctrl+Shift+Number` to change the limit quickly (e.g., `Ctrl+Shift+5` sets to 5; `Ctrl+Shift+0` disables limiting).
- **Persistent settings**: All preferences are saved in browser storage and persist across pages.
- **Visual config panel**: Tweak every option through a GUI – no need to edit the script manually.
- **Broad compatibility**: Works on homepage, channels (animation, music, game, tech, etc.), dynamic, search, anime, and most other Bilibili pages.
- **Lightweight & efficient**: Uses MutationObserver with throttling and debouncing for performance.

###  Installation

1. Make sure you have **Tampermonkey** or **Violentmonkey** installed in your browser.
2. Click the installation link (or create a new script and paste the source code):
   - [GitHub raw link] (replace with actual URL: `https://raw.githubusercontent.com/your-username/repo-name/script.user.js`)
3. Refresh any Bilibili page – you should see the control button in the bottom‑right corner.

> For the best experience, consider using an ad blocker alongside this script.

###  Usage

- **Toggle limiting**: Click the `🔴 精简已开启` (or `Enabled`) button at the bottom‑right.
- **Quick‑set number**: Use `Ctrl+Shift+1~9` to set the max video count instantly.
- **Open config panel**: Click `⚙️ B站精简设置` in the Tampermonkey menu, or use the script’s menu entry.

###  Configuration (via GUI)

| Option | Description |
|--------|-------------|
| Max visible videos | Maximum number of videos to keep (default 10) |
| Exclude live | Hide live‑streaming cards |
| Exclude ads | Hide cards with ad / promotion labels |
| Exclude bangumi | Hide cards related to anime series |
| Exclude paid content | Hide paid courses / lessons |
| Keep promoted | Show promoted cards but they don’t count toward the limit |
| Whitelist UP IDs | Comma‑separated UIDs whose videos always show |
| Show counter | Display stats in the top‑left corner |
| Show toggle button | Display the enable/disable button in the bottom‑right |
| Enable shortcuts | Allow using `Ctrl+Shift+Number` to adjust the limit |

All changes are **saved automatically** – no restart needed.

###  Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+1` ~ `Ctrl+Shift+9` | Set max videos to 1–9 |
| `Ctrl+Shift+0` | Disable the limiter (show all videos) |

> If shortcuts don't work, check for conflicts with other extensions and make sure "Enable shortcuts" is ticked in the config panel.

###  Notes

- This script affects only the **web version** of Bilibili, not mobile or app.
- Bilibili may update its page structure – if the script stops working, please open an issue.
- The script auto‑detects video cards; if a page isn't covered, feel free to report it.
- Tested on Chrome + Tampermonkey; Firefox + Violentmonkey also works.

###  For Developers

- **Tech stack**: Vanilla JS + GM_* API.
- **Code style**: ES5 compatible for maximum cross‑browser support.
- **Debug mode**: Enable `debug` in the script’s `config` object (or via GM storage) to see detailed logs in the console.

###  Contributing

Issues, suggestions, and pull requests are welcome!

- **Issue template**: Please include your browser version, script manager version, Bilibili page URL, and steps to reproduce.
- **PR guidelines**: Keep code style consistent and test on multiple pages.

###  License

This project is licensed under the [MIT License](LICENSE) – feel free to use, modify, and distribute.

---

**Enjoy a cleaner Bilibili feed!** 
