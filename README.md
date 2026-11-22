# dsh-tts-service

给 DSH 加一个**本地语音**面板：启动 DSH 时自动加载本地 Qwen3-TTS 服务，关闭 DSH 时释放，崩溃后自动拉起。

- **只随 DSH 存活**：不用开机自启，注册表、计划任务一概不碰
- **面板可控**：侧边栏图标 → 开关状态、换音色、改情绪、试听、重启
- **崩溃自愈**：看门狗每 15 秒巡检，掉了自动重启（最多 5 次）

## 它不包含什么

**模型文件不在这个仓库里。** 这是插件，不是模型包。你需要自己准备：

| 需要 | 说明 |
|---|---|
| Python 3.11+ | 建议独立 venv |
| `qwen3_tts_gguf` 推理引擎 | talker / predictor 走 llama.cpp，编解码走 onnxruntime |
| 模型产物 | `qwen3_tts_talker.q5_k.gguf`、`qwen3_tts_predictor.q8_0.gguf`、`qwen3_tts_decoder.fp16.onnx`、`tokenizer.json` 等，合计约 1.8 GB |
| 启动脚本 | 一个能跑起来、监听 `127.0.0.1:7890` 且提供 `/health` 的 HTTP 服务 |

## 安装

### 桌面版 DSH（不用命令行，推荐）

**直接下载**：[dsh-tts-service-v1.1.0.zip](https://github.com/RadeyesDrosophilaProMax/dsh-tts-service/releases/download/v1.1.0/dsh-tts-service-v1.1.0.zip)（约 11 KB）

1. 下载后解压到**一个固定位置**（别放临时目录，插件会长期读这个文件夹）
2. 打开 DSH → 侧边栏 **插件** → 用「从文件夹 / 本地目录安装」那一项，选中解压出来的 `dsh-tts-service` 文件夹
3. **重启 DSH**，侧边栏出现「本地语音」图标

> ZIP 里的 `install.bat` 也能用：双击它，脚本会打开插件目录并提示下一步。

### 命令行版 DSH

```bash
dsh plugin --profile desktop add github:RadeyesDrosophilaProMax/dsh-tts-service
```

## 配置

首次装好必须改两处路径，否则拉不起服务。编辑 profile 的 `cordis.patch.yml`：

```yaml
- id: tts-service
  name: '@local/dsh-tts-service'
  config:
    python: 'D:\你的路径\venv\Scripts\python.exe'
    server: 'D:\你的路径\server_gguf.py'
    cwd: 'D:\你的路径'
    port: 7890
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `python` | — | 跑服务用的解释器 |
| `server` | — | 服务启动脚本 |
| `cwd` | — | 服务工作目录 |
| `port` | `7890` | 服务端口 |
| `autoStart` | `true` | 设为 `false` 则按钮触发才加载（省内存，但首次要等） |
| `autoRestart` | `true` | 崩溃是否自动拉起 |
| `watchdogSec` | `15` | 巡检间隔 |
| `startupTimeoutSec` | `240` | 冷启动最长等待 |
| `maxRestarts` | `5` | 连续重启上限，防止无限重启拖垮机器 |

## 面板接口

面板通过 Host 路由访问服务，浏览器不直连 7890，省掉 CORS：

| 路由 | 作用 |
|---|---|
| `GET /tts-local/status` | 在线状态、端口、是否由插件托管 |
| `GET /tts-local/voices` | 音色列表 |
| `POST /tts-local/speak` | `{text, speaker, emotion, temperature}` |
| `POST /tts-local/restart` | 强制重启服务 |

## 已知限制

- **只支持 Windows**（用了 `taskkill` / `netstat` 管进程）
- 冷启动约 15～30 秒，这段时间试听会失败或等待
- 服务本身在 6 GB 显存上约占 1.3 GB
- 试听是**本机扬声器直接出声**，不是把音频传回浏览器

## 卸载

```bash
dsh plugin --profile desktop remove @local/dsh-tts-service
```
