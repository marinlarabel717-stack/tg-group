# tg-group

当前推荐先看这个：

## Sender Studio v1（本地软件版）
- 主文件：`sender_studio_v1.py`
- 双击启动：`run_sender_studio_v1.bat`
- 数据库：`data/studio.db`

### 这版已经能做
- 导入 session 文件到本地管理目录
- 维护账号信息（备注 / 目标群 / 状态）
- 为每个账号配置文案池
- 为每个账号配置图片池
- 保存定时规则
- 生成“任务预览”
- 查看操作日志
- 保存本地设置

### 这版暂时不做
- 自动发送执行
- 重试队列
- 并发调度

---

## 其他文件
- `ui_prototype_v1.py`：之前的纯 UI 原型版
- `run_ui_prototype.bat`：原型版启动脚本
- `scheduler.py` / `desktop_scheduler_gui.py`：旧实验文件

---

## 安装依赖

```bash
pip install -r requirements.txt
```

---

## 启动 Sender Studio v1

### 命令行
```bash
python sender_studio_v1.py
```

### 双击启动
```bash
run_sender_studio_v1.bat
```

---

## 使用顺序建议
1. 先去【账号管理】导入 session
2. 再去【素材配置】添加文案和图片
3. 再去【定时规则】保存规则
4. 最后去【任务预览】生成今天/明天的计划

---

## 本地目录
- `data/`：SQLite 数据库
- `sessions/`：导入后的 session 文件
- `images/`：导入后的图片
- `logs/`：预留日志目录

---

## 下一步可继续接
1. SQLite 数据表进一步细化
2. 状态检查面板
3. 规则复制 / 批量编辑
4. 预览导出
5. 后续是否接执行层再单独评估
