# ZYMIX-UI 设计验收工作台（Skill）

把设计稿和实现截图放在一起做证据化验收：像素预扫描给候选，AI 独立复核，输出可编辑、可导出的问题清单。

> 👉 **第一次用、只想把工具跑起来** → 看 [使用指南.md](使用指南.md)（白话版，含额度换算和出错对照表）。
> 下面这份是给要改代码、改界面的人看的。

## 安装

整个目录就是一个 Skill，目录名必须是 `verify-design-implementation`（要和 `SKILL.md` 里的 `name` 一致）。

- Claude Code，只给自己用：放到 `~/.claude/skills/verify-design-implementation/`
- Claude Code，跟着某个仓库走：放到该仓库的 `.claude/skills/verify-design-implementation/`
- Codex：目录里的 `agents/openai.yaml` 是 Codex 侧的入口清单，把目录放到你的 Codex 安装读取 Skill 的位置即可

## 前置条件

| | 需要什么 |
|---|---|
| 打开工作台 | 只要 **Node 18+**。不需要 `npm install` |
| 跑 AI 检测 | **已登录的 Codex 命令行**。不需要 API key。装了但没登录不算，启动时会明确指出 |
| `scripts/visual_diff.py` | Python 3 + `pip install -r requirements.txt`（opencv / numpy / pillow） |
| 改界面 | 在 `assets/shadcn-review-app/` 里 `npm install` |

`scripts/validate_acceptance_report.py` 只用标准库。

## 启动

```bash
node scripts/start_workbench.mjs
```

输出：

```
ZYMIX_WORKBENCH_URL=http://127.0.0.1:43127/
ZYMIX_STATUS=Codex bridge ready
ZYMIX_PROVIDERS=codex
```

打开第一行那个完整 URL。**必须用这个 URL**——一次性令牌是在这次响应里注入页面的，直接双击 `workbench.html` 打不通 AI。

`ZYMIX_PROVIDERS` 只在 Codex **已登录**时才列出它。装了但没登录会给出 `codex login` 提示——光有命令行不算可用，`--version` 在没有凭证时照样成功。

## 用哪个模型

只调用 **Codex**，用它当前的默认模型。不指定模型、不读 API key。

- **在 Claude Code 里跑这个 Skill 也一样走 Codex**，不跟随启动环境
- Codex 没登录：页面照样打开，状态显示「AI 未连接」，`/api/health` 返回 503

不再支持 Claude 命令行。Claude CLI 没有原生图片输入参数，只能让模型自己去调 `Read` 读取图片路径，无法保证完整图片真的进入上下文——对逐像素级的设计走查来说不可靠，因此这条路径已移除。

## 环境变量

| 变量 | 作用 |
|---|---|
| `ZYMIX_PORT` | 指定端口。不指定时默认 43127，被占用会自动换一个空闲端口 |
| `CODEX_BIN` | Codex 不在 PATH 上时指定可执行文件路径 |

`ZYMIX_PROVIDER` 已废弃；设成 `codex` 以外的值会直接报错退出。

## 隐私

服务只绑 `127.0.0.1`，每次启动生成一次性令牌，`/api/*` 校验令牌。截图只写进本机临时目录，调用结束即删除，不上传任何外部服务。

## 改界面

```bash
cd assets/shadcn-review-app
npm install
npm run dev     # 开发
npm run build   # 重新生成 workbench.html
```

`npm run build` 先由 Vite 产出 `dist/`（可丢弃的中间产物），再把全部资源内联成单文件 `assets/shadcn-review-app/workbench.html`——也就是 bridge 实际服务的那个文件。构建产物全部落在包内。

组件和 token 基线是 shadcn 预设 `bKsFBxgG`（base-luma / Stone / Blue / Inter / Lucide）。

改动之前先读 `CLAUDE.md`，提交之前走 `docs/VALIDATION_CHECKLIST.md`。
