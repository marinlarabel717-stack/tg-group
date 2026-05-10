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

健康检查：

```bash
GET /health
```

## 创建卡密

```bash
npm run license:create-card -- --key TEST-2026-0001 --days 30 --devices 1 --note 本地测试卡
```

## 查看卡密

```bash
npm run license:list-cards
```

## 客户端设置

把客户端设置页的授权服务地址填成：

```bash
http://127.0.0.1:8787
```

然后在授权页输入刚创建的卡密即可激活。

## 当前已实现接口

- `POST /api/license/activate`
- `POST /api/license/validate`

## 当前数据存储

默认保存在：

```bash
license-server/data/license-db.json
```

## 说明

这是本地 MVP，后面可以继续补：

- 后台管理页面
- 重置设备绑定
- 禁用卡密
- 版本更新接口
- 多渠道 release 管理

