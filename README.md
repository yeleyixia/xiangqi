# 🎮 中国象棋在线对弈平台

一个现代化的在线中国象棋对弈平台，支持实时对弈、游戏大厅、等级排名等功能。

![中国象棋](https://img.shields.io/badge/中国象棋-在线对弈-red)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-green)

## ✨ 功能特性

- ⚡ **实时对弈** - 基于 WebSocket 的毫秒级走子同步
- 🏠 **游戏大厅** - 创建/加入房间，观战对局
- 🏆 **等级排名** - 专业等级分系统
- 💬 **实时聊天** - 对局中与对手交流
- ⏱ **多种计时** - 支持多种时间控制（3分钟、5分钟、10分钟等）
- 📋 **棋局回放** - 完整记录每一步走法
- 🛡 **公平竞技** - 服务端验证走法，杜绝作弊
- 📱 **响应式设计** - 支持桌面和移动设备

## 🛠 技术栈

- **前端**: React 18 + TypeScript + Vite
- **样式**: CSS Variables + 响应式设计
- **状态管理**: Zustand
- **路由**: React Router v7
- **后端**: Supabase (PostgreSQL + Auth + Realtime)
- **部署**: Vercel

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/xiangqi-online.git
cd xiangqi-online
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 Supabase

#### 3.1 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并登录
2. 创建新项目，记录项目 URL 和 anon key

#### 3.2 初始化数据库

1. 进入 Supabase Dashboard → SQL Editor
2. 复制 `supabase/init.sql` 的内容并执行

#### 3.3 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的 Supabase 信息：

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 📦 部署到 Vercel

### 方法一：通过 Vercel CLI

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录并部署
vercel
```

### 方法二：通过 GitHub 集成

1. 将代码推送到 GitHub
2. 访问 [Vercel](https://vercel.com) 并导入项目
3. 配置环境变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. 点击 Deploy

## 📁 项目结构

```
xiangqi-online/
├── public/              # 静态资源
├── src/
│   ├── components/      # React 组件
│   │   ├── AuthModal.tsx
│   │   ├── ChessBoard.tsx
│   │   ├── CreateRoomModal.tsx
│   │   ├── Navbar.tsx
│   │   └── Toast.tsx
│   ├── lib/             # 工具函数
│   │   ├── chess.ts     # 象棋规则引擎
│   │   └── supabase.ts  # Supabase 客户端
│   ├── pages/           # 页面组件
│   │   ├── AuthPage.tsx
│   │   ├── GamePage.tsx
│   │   ├── HomePage.tsx
│   │   └── LobbyPage.tsx
│   ├── store/           # Zustand 状态管理
│   │   └── index.ts
│   ├── types/           # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.tsx          # 根组件
│   ├── index.css        # 全局样式
│   └── main.tsx         # 入口文件
├── supabase/
│   └── init.sql         # 数据库初始化脚本
├── .env.example         # 环境变量示例
├── vercel.json          # Vercel 配置
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎯 核心功能说明

### 象棋规则引擎 (`src/lib/chess.ts`)

完整实现了中国象棋的所有规则：

- 将/帅：九宫格内移动，不能将帅对脸
- 士/仕：九宫格内斜走
- 象/相：田字走法，不能过河，塞象眼
- 马：日字走法，蹩马腿
- 车：直线走，吃子
- 炮：直线走，隔子吃
- 兵/卒：过河前只能前进，过河后可左右

### 实时同步 (`src/store/index.ts`)

使用 Supabase Realtime 实现房间状态同步：

- 棋盘状态实时更新
- 聊天消息实时推送
- 玩家加入/离开通知

## 🔧 开发命令

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview

# 类型检查
npx tsc --noEmit
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [Supabase](https://supabase.com) - 后端服务
- [Vercel](https://vercel.com) - 托管服务
- [Lucide](https://lucide.dev) - 图标库

---

**以棋会友，乐在棋中** 🎮
