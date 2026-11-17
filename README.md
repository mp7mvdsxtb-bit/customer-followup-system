# 客户跟进系统

一个给 B2B 销售用的本地客户跟进工作台。单机运行、零第三方依赖、数据只存本机。

![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)
![No dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Platform](https://img.shields.io/badge/Windows-10%2F11-0078d4)

## 它解决什么

每天只有一小时打电话，最怕的是「今天该打给谁」想不起来、「上次跟到哪了」记不清、
「这家到底有没有在用第三方背调」不知道。这个系统把这三件事变成一屏能看完的队列。

## 功能

| 页面 | 干什么 |
|---|---|
| **今日工作台** | 按「到期 → 目标KA → 有三方背调」排队，用给出的分钟数算今天能打几家 |
| **看板** | 按阶段铺开，拖卡片改状态 |
| **客户库** | 全量搜索筛选，支持批量改阶段 / 排下次 / 停跟 / 删除 |
| **周报** | 按周（周一→周日）列出跟了哪些客户、每家结果，可导出 CSV，适合周会汇报 |
| **数据洞察** | 阶段漏斗、行业/规模/地区分布、四周跟进趋势 |
| **目标** | 月度目标、保底、达成进度 |
| **数据质量** | 缺号码 / 缺行业 / 逾期 / 从未跟进，一键筛出并处理；自动检测疑似重复公司 |

其他：命令面板（`Ctrl+K`）、深色模式、键盘快捷键、到期提醒（Windows 计划任务）、
一键备份、CSV 导出、在线自动更新。

## 直接用（推荐）

到 [Releases](../../releases) 下载最新的 zip，解压后双击 `start.bat`。
**不需要装 Python 或任何依赖**，运行时已经打包在里面。

关闭那个黑色命令行窗口即停止服务。数据不会丢。

## 从源码跑

```bash
git clone https://github.com/mp7mvdsxtb-bit/customer-followup-system.git
cd customer-followup-system
python tools/setup_runtime.py     # 下载便携运行时到 runtime/（约 11 MB）
双击 start.bat
```

`setup_runtime.py` 只做一件事：把 Python 官方的 embeddable 包解压到 `runtime/`，
并写好 `_pth` 让 `import app 模块` 能找到。装完之后与发布版完全一致。

## 数据在哪

```
data/crm.db      ← 全部数据（SQLite）。拷走这个文件就是完整备份
data/backups/    ← 设置页「备份数据库」生成的时间点快照
```

**这个仓库里没有任何客户数据。** `.gitignore` 把 `data/` 整个排除了，
`*.xlsx` 和 `*.db` 也在排除列表里。数据永远不会被提交。

## 更新机制

程序启动 4 秒后会静默请求一次 GitHub Releases API。有新版本时，右上角出现「更新」按钮：

- 只提示，不自动替换；点了才下载
- 只替换 `app/` 和 `tools/`，**不碰 `data/`**
- 替换前把旧版本备份成 `app.bak/`
- 替换前先做语法检查，坏的代码不会被执行
- 替换由独立的 helper 进程完成，完成后自动重启服务

发布新版：改 `app/release.py` 里的 `VERSION`，打一个 `v1.2.0` 的 tag，
把打包好的 zip 作为 Release 附件上传即可。程序靠 tag 判断版本。

## 实现

- 后端：Python 标准库 `http.server` + `sqlite3`，无 Web 框架
- 前端：原生 JS + CSS，无构建步骤，无 npm
- 打包：官方 Python embeddable 运行时 + `start.bat`
- 数据库：SQLite（WAL 模式），单文件，随手可备份

## License

MIT
