# StreamBench

全栈 SSE（Server-Sent Events）流式问答测试台：Express 后端接入 DeepSeek，React 前端分别用**原生 `EventSource`** 与 **`@microsoft/fetch-event-source`** 两种方式实现流式输出，便于对比两种客户端方案的差异。

## 技术栈

- **后端**：Node.js (v20.6+) + Express，原生 `fetch` 直连 DeepSeek 流式接口，手动解析并转发 SSE
- **前端**：React 18 + React Router + Vite + TypeScript
- **模型**：DeepSeek（接口与 OpenAI 兼容）

## 目录结构

```
StreamBench/
├── server/                 # Express 后端
│   ├── index.js            # 路由：EventSource(GET) 与 fetch-event-source(POST) 两条 SSE 路由
│   ├── deepseek.js         # 调用 DeepSeek 流式接口并转发为标准 SSE
│   ├── config.js           # 读取环境变量配置
│   └── .env.example        # 环境变量模板（复制为 .env 使用）
├── client/                 # React 前端
│   └── src/
│       ├── pages/          # EventSource / fetch-event-source 两个演示页
│       ├── components/     # Sidebar、ChatView
│       └── lib/            # SSEClient、MessageThrottler
└── package.json            # 根脚本：用 concurrently 同时起前后端
```

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

（等价于在根目录、`server/`、`client/` 分别执行 `npm install`）

### 2. 配置环境变量

复制模板并填入你自己的 DeepSeek API Key：

```bash
cp server/.env.example server/.env
```

然后编辑 `server/.env`：

```
DEEPSEEK_API_KEY=你的真实Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

> API Key 在 https://platform.deepseek.com 申请。`server/.env` 已被 `.gitignore` 忽略，不会被提交。

### 3. 启动开发环境

```bash
npm run dev
```

- 后端：http://localhost:3001
- 前端：http://localhost:5175 （Vite 已配置把 `/api` 代理到后端 3001 端口）

## 后端接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/chat/eventsource?message=你好` | 供原生 `EventSource` 使用（只支持 GET，问题走 query） |
| POST | `/api/chat/fetch` body: `{ "message": "你好" }` | 供 `@microsoft/fetch-event-source` 使用（POST + JSON） |
| GET | `/api/health` | 健康检查 |

下游统一 SSE 协议：

- 正常增量：`data: {"content":"xxx"}\n\n`
- 出错：`event: server_error\ndata: {"message":"..."}\n\n`
- 结束：`data: [DONE]\n\n`

## 构建

```bash
npm run build   # 构建前端到 client/dist
```

## 安全提示

- **切勿**把真实 API Key 写进代码或提交到仓库。密钥只放在本地 `server/.env`。
- 如果密钥曾被提交过，请到 DeepSeek 控制台**吊销并重新生成**，因为它会残留在 git 历史中。
