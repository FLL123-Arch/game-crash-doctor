# game-crash-doctor

DeepSeek Harness 插件：游戏崩溃后，用 Windows 事件日志、WER 报告和转储文件告诉你**为什么崩**、**怎么修**。

> Windows only · DSH `0.1.2`+ · 所有分析都在本机完成，不联网、不上传数据。

## 功能

- **自动监控**：每 45 秒检查一次事件日志，发现新的游戏崩溃时在当前会话里推送一条通知（原因摘要 + 3 条建议）。
- **按需诊断**：随时调用 `diagnose_game_crash`，可指定回溯小时数和游戏名。
- **数据来源**：
  - 应用程序日志：Application Error 1000、Windows Error Reporting 1001、Application Hang 1002、.NET Runtime 1026
  - 系统日志：显示驱动 TDR 4101、Kernel-Power 41、BugCheck 1001、意外关机 6008
  - WER 报告 `Report.wer`（异常代码、故障模块、Bucket）
  - 崩溃转储：`%LOCALAPPDATA%\CrashDumps`、`C:\Windows\Minidump`、`C:\Windows\LiveKernelReports`
- **原因归类**：ACCESS_VIOLATION、C++/.NET 异常、堆破坏、栈溢出、显卡 TDR、DXGI 设备丢失、反作弊、蓝屏 BugCheck 等，并给出置信度和排查顺序。
- **重复崩溃识别**：同一程序/异常/模块在时间窗内反复出现时会单独提示。

## 安装

### 从 npm

```powershell
dsh plugin --profile desktop add game-crash-doctor
```

### 从本地源码

```powershell
# 1. 把本目录放到 profile 的 plugins 下
#    %USERPROFILE%\.dsh\profiles\desktop\plugins\game-crash-doctor
# 2. 注册到 profile
dsh plugin --profile desktop add file:./plugins/game-crash-doctor
```

安装后重启 DSH（或在插件市场里点重启），工具和后台监控才会生效。

## 使用

直接对 Agent 说：

- “刚才游戏为什么崩了？”
- “帮我看看最近 3 天的崩溃记录”
- “只查 Wuthering Waves 的崩溃”

Agent 会调用 `diagnose_game_crash`：

| 参数 | 说明 |
|---|---|
| `hours` | 回溯小时数，1–168，默认 24 |
| `game` | 只看可执行文件名/路径包含该关键词的记录 |

## 配置

在 profile 的 `cordis.patch.yml` 中给插件加 `config`：

```yaml
- id: game-crash-doctor
  name: game-crash-doctor
  config:
    notify: true              # 是否自动推送崩溃通知
    pollSeconds: 45           # 轮询间隔（15–600 秒）
    gameOnly: true            # 只对“像游戏”的崩溃推送
    notifyAllSessions: false  # true = 通知所有打开的会话
    maxNotificationsPerHour: 3
```

## 判断逻辑示例

| 信号 | 典型结论 |
|---|---|
| `0xC0000005` @ 游戏模块 | 模组/补丁越界、文件损坏、内存不稳 |
| `0xE06D7363` @ `KERNELBASE.dll` | 未捕获的 C++ 异常：游戏 bug、模组/汉化、反作弊注入 |
| `0xC0000374` / `0xC0000409` | 堆破坏 / 栈溢出：优先查内存超频、XMP、注入 DLL |
| `0x887A0006` 或 4101 TDR | 显卡驱动超时：DDU 重装驱动、恢复默认频率、查供电/温度 |
| Kernel-Power 41 | 异常断电/死机：电源、散热、超频、BIOS |
| BugCheck `0x124` | WHEA 硬件错误：CPU/内存/电源 |
| Application Hang 1002 | 主线程卡死：驱动、覆盖层、资源加载 |

## 隐私与安全

- 只读取本机 Windows 事件日志、WER 报告和转储文件，**不发起任何网络请求**。
- 不收集、不上传崩溃内容、路径或用户信息。
- 需要执行的唯一外部程序是系统自带的 `powershell.exe`（只读采集）。
- 事件日志查询不需要管理员权限；`C:\Windows\LiveKernelReports` 和部分 WER 目录可能需要管理员权限，读不到会自动跳过。

## 限制

- 仅支持 Windows 10/11。
- 不解析转储里的调用栈（没有符号表）；转储只用于定位和关联。需要更深的栈分析时，用 WinDbg 打开报告里给出的 `.dmp`。
- 如果游戏是“直接断电/死机”且系统来不及写日志，可能只能看到 Kernel-Power 41，插件会明确说明“没有应用崩溃记录”。
- 自动通知要求 DSH 正在运行；DSH 关闭期间发生的崩溃，会在下次启动后的第一次轮询补报。

## License

MIT
