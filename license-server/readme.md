# License Server MVP

本目录是 `tg-group` 的本地授权服务端 MVP。

## 启动服务

```bash
npm run license:server
```

默认监听：

```bash
http://127.0.0.1:8787
```

后台页面：

```bash
http://127.0.0.1:8787/admin
```

健康检查：

```bash
GET /health
```

## 基础命令

### 创建卡密

```bash
npm run license:create-card -- --key TEST-2026-0001 --days 30 --devices 1 --note 本地测试卡
```

### 查看全部卡密

```bash
npm run license:list-cards
```

### 查看单张卡密详情

```bash
npm run license:get-card -- --key TEST-2026-0001
```

### 禁用卡密

```bash
npm run license:disable-card -- --key TEST-2026-0001 --note 手动禁用
```

### 重新启用卡密

```bash
npm run license:disable-card -- --key TEST-2026-0001 --enable true --note 重新启用
```

### 延长有效期

```bash
npm run license:extend-card -- --key TEST-2026-0001 --days 30 --note 补 30 天
```

### 重置设备绑定

```bash
npm run license:reset-devices -- --key TEST-2026-0001 --note 重置绑定
```

### 查看日志

```bash
npm run license:list-logs -- --key TEST-2026-0001 --limit 20
```

## 客户端设置

把客户端设置页的授权服务地址填成：

```bash
http://127.0.0.1:8787
```

然后在授权页输入刚创建的卡密即可激活。

## 管理员鉴权

- 后台管理接口统一要求管理员 token
- 正式部署建议设置环境变量：

```bash
LICENSE_ADMIN_TOKEN=your-secret-token
```

- 如果未设置，当前本地开发默认 token 为：

```bash
dev-admin-token
```

## 当前已实现接口

### 客户端接口

- `POST /api/license/activate`
- `POST /api/license/validate`

### 后台管理接口

- `GET /api/admin/cards`
- `GET /api/admin/card?cardKey=...`
- `GET /api/admin/logs?cardKey=...&limit=20`
- `POST /api/admin/cards/create`
- `POST /api/admin/cards/disable`
- `POST /api/admin/cards/extend`
- `POST /api/admin/cards/reset-devices`

## 当前数据存储

默认保存在：

```bash
license-server/data/license-db.json
```

## 说明

这是本地 MVP，后面可以继续补：

- 更完整的后台管理页面
- 管理员账号体系
- 版本更新接口
- 多渠道 release 管理
- 正式数据库迁移
