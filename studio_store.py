import os
import random
import shutil
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from telethon import TelegramClient
from telethon.errors import AuthKeyError, FloodWaitError, RPCError, SessionPasswordNeededError


STATUS_OPTIONS = ['未检查', '正常', '受限', '失效', '需重新登录', '检查失败']


class StudioStore:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.data_dir = self.base_dir / 'data'
        self.sessions_dir = self.base_dir / 'sessions'
        self.images_dir = self.base_dir / 'images'
        self.logs_dir = self.base_dir / 'logs'
        for path in [self.data_dir, self.sessions_dir, self.images_dir, self.logs_dir]:
            path.mkdir(parents=True, exist_ok=True)
        self.db_path = self.data_dir / 'studio.db'
        self._init_schema()
        self._init_defaults()

    def connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self):
        with self.connect() as conn:
            conn.executescript(
                '''
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    display_name TEXT NOT NULL,
                    phone TEXT DEFAULT '',
                    session_name TEXT NOT NULL,
                    session_path TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT '未检查',
                    last_check_at TEXT DEFAULT '',
                    last_check_result TEXT DEFAULT '',
                    last_error TEXT DEFAULT '',
                    target_chat TEXT DEFAULT '',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS materials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    text_content TEXT DEFAULT '',
                    image_path TEXT DEFAULT '',
                    caption TEXT DEFAULT '',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    target_chat TEXT DEFAULT '',
                    start_time TEXT NOT NULL DEFAULT '09:00',
                    end_time TEXT NOT NULL DEFAULT '21:00',
                    interval_minutes INTEGER NOT NULL DEFAULT 10,
                    daily_limit INTEGER NOT NULL DEFAULT 30,
                    text_mode TEXT NOT NULL DEFAULT 'rotate',
                    image_mode TEXT NOT NULL DEFAULT 'none',
                    fixed_image_id INTEGER,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                    FOREIGN KEY(fixed_image_id) REFERENCES materials(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS preview_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_date TEXT NOT NULL,
                    run_at TEXT NOT NULL,
                    account_id INTEGER NOT NULL,
                    rule_id INTEGER NOT NULL,
                    target_chat TEXT DEFAULT '',
                    text_summary TEXT DEFAULT '',
                    image_summary TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT '待执行',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                    FOREIGN KEY(rule_id) REFERENCES rules(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    account_name TEXT DEFAULT '',
                    action TEXT NOT NULL,
                    result TEXT NOT NULL,
                    detail TEXT DEFAULT ''
                );
                '''
            )

    def _init_defaults(self):
        defaults = {
            'data_dir': str(self.data_dir),
            'sessions_dir': str(self.sessions_dir),
            'images_dir': str(self.images_dir),
            'logs_dir': str(self.logs_dir),
            'api_id': '',
            'api_hash': '',
            'theme': '深色 · 默认',
            'density': '舒适',
        }
        with self.connect() as conn:
            for key, value in defaults.items():
                conn.execute('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', (key, value))

    def now(self):
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    def add_log(self, action: str, result: str, detail: str = '', account_name: str = ''):
        with self.connect() as conn:
            conn.execute(
                'INSERT INTO logs(created_at, account_name, action, result, detail) VALUES (?, ?, ?, ?, ?)',
                (self.now(), account_name, action, result, detail),
            )

    def dashboard_metrics(self):
        with self.connect() as conn:
            account_total = conn.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]
            enabled_rules = conn.execute('SELECT COUNT(*) FROM rules WHERE enabled = 1').fetchone()[0]
            material_total = conn.execute('SELECT COUNT(*) FROM materials WHERE enabled = 1').fetchone()[0]
            abnormal_accounts = conn.execute(
                "SELECT COUNT(*) FROM accounts WHERE status IN ('受限', '失效', '需重新登录', '检查失败')"
            ).fetchone()[0]
            recent_logs = conn.execute(
                'SELECT created_at, action, result, detail FROM logs ORDER BY id DESC LIMIT 6'
            ).fetchall()
        return {
            'account_total': account_total,
            'enabled_rules': enabled_rules,
            'material_total': material_total,
            'abnormal_accounts': abnormal_accounts,
            'recent_logs': [dict(row) for row in recent_logs],
        }

    def account_metrics(self):
        with self.connect() as conn:
            total = conn.execute('SELECT COUNT(*) FROM accounts').fetchone()[0]
            normal = conn.execute("SELECT COUNT(*) FROM accounts WHERE status = '正常'").fetchone()[0]
            abnormal = conn.execute(
                "SELECT COUNT(*) FROM accounts WHERE status IN ('受限', '失效', '需重新登录', '检查失败')"
            ).fetchone()[0]
            enabled = conn.execute('SELECT COUNT(*) FROM accounts WHERE enabled = 1').fetchone()[0]
            row = conn.execute(
                "SELECT last_check_at FROM accounts WHERE last_check_at != '' ORDER BY last_check_at DESC LIMIT 1"
            ).fetchone()
        return {
            'total': total,
            'normal': normal,
            'abnormal': abnormal,
            'enabled': enabled,
            'last_check_at': row['last_check_at'] if row else '-',
        }

    def list_accounts(self, status: str = '', keyword: str = ''):
        query = 'SELECT * FROM accounts WHERE 1=1'
        params = []
        if status and status != '全部状态':
            query += ' AND status = ?'
            params.append(status)
        if keyword:
            query += ' AND (display_name LIKE ? OR phone LIKE ? OR session_name LIKE ? OR target_chat LIKE ?)'
            like = f'%{keyword.strip()}%'
            params.extend([like, like, like, like])
        query += ' ORDER BY id DESC'
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_account(self, account_id: int):
        with self.connect() as conn:
            row = conn.execute('SELECT * FROM accounts WHERE id = ?', (account_id,)).fetchone()
        return dict(row) if row else None

    def save_account(self, payload: dict):
        now = self.now()
        with self.connect() as conn:
            if payload.get('id'):
                conn.execute(
                    '''
                    UPDATE accounts
                    SET display_name=?, phone=?, status=?, last_check_at=?, last_check_result=?, last_error=?, target_chat=?, enabled=?, updated_at=?
                    WHERE id=?
                    ''',
                    (
                        payload.get('display_name', '').strip() or '未命名账号',
                        payload.get('phone', '').strip(),
                        payload.get('status', '未检查').strip() or '未检查',
                        payload.get('last_check_at', '').strip(),
                        payload.get('last_check_result', '').strip(),
                        payload.get('last_error', '').strip(),
                        payload.get('target_chat', '').strip(),
                        1 if payload.get('enabled', True) else 0,
                        now,
                        payload['id'],
                    ),
                )
                account_id = int(payload['id'])
            else:
                conn.execute(
                    '''
                    INSERT INTO accounts(display_name, phone, session_name, session_path, status, last_check_at, last_check_result, last_error, target_chat, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        payload.get('display_name', '').strip() or '未命名账号',
                        payload.get('phone', '').strip(),
                        payload.get('session_name', '').strip() or 'manual.session',
                        payload.get('session_path', '').strip() or '',
                        payload.get('status', '未检查').strip() or '未检查',
                        payload.get('last_check_at', '').strip(),
                        payload.get('last_check_result', '').strip(),
                        payload.get('last_error', '').strip(),
                        payload.get('target_chat', '').strip(),
                        1 if payload.get('enabled', True) else 0,
                        now,
                        now,
                    ),
                )
                account_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        self.add_log('保存账号', '成功', f'账号ID={account_id}', payload.get('display_name', ''))
        return account_id

    def import_session_files(self, file_paths):
        imported = []
        skipped = []
        renamed = 0
        for raw_path in file_paths:
            path = Path(raw_path)
            if not path.exists() or path.suffix.lower() != '.session':
                skipped.append(str(raw_path))
                continue
            target_name = path.name
            target_path = self.sessions_dir / target_name
            stem = path.stem
            suffix_index = 1
            while target_path.exists():
                target_name = f'{stem}_{suffix_index}.session'
                target_path = self.sessions_dir / target_name
                suffix_index += 1
            if target_name != path.name:
                renamed += 1
            shutil.copy2(path, target_path)
            payload = {
                'display_name': target_path.stem,
                'session_name': target_path.name,
                'session_path': str(target_path),
                'status': '未检查',
                'enabled': True,
            }
            account_id = self.save_account(payload)
            imported.append(account_id)
            self.add_log('导入 Session', '成功', target_path.name, target_path.stem)
        return {
            'imported_ids': imported,
            'imported_count': len(imported),
            'skipped_count': len(skipped),
            'renamed_count': renamed,
            'skipped_files': skipped,
        }

    def delete_accounts(self, account_ids):
        if not account_ids:
            return
        with self.connect() as conn:
            rows = conn.execute(
                f"SELECT display_name, session_path FROM accounts WHERE id IN ({','.join('?' * len(account_ids))})",
                list(account_ids),
            ).fetchall()
            for row in rows:
                session_path = row['session_path']
                if session_path and os.path.exists(session_path):
                    try:
                        os.remove(session_path)
                    except OSError:
                        pass
                self.add_log('删除账号', '成功', row['display_name'], row['display_name'])
            conn.execute(f"DELETE FROM accounts WHERE id IN ({','.join('?' * len(account_ids))})", list(account_ids))

    def set_accounts_enabled(self, account_ids, enabled: bool):
        if not account_ids:
            return
        with self.connect() as conn:
            conn.execute(
                f"UPDATE accounts SET enabled = ?, updated_at = ? WHERE id IN ({','.join('?' * len(account_ids))})",
                [1 if enabled else 0, self.now(), *list(account_ids)],
            )
        self.add_log('批量启停账号', '成功', f"{'启用' if enabled else '停用'} {len(account_ids)} 个账号")

    def list_materials(self, account_id: int, kind: str = ''):
        query = 'SELECT * FROM materials WHERE account_id = ?'
        params = [account_id]
        if kind:
            query += ' AND kind = ?'
            params.append(kind)
        query += ' ORDER BY id DESC'
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_material(self, material_id: int):
        with self.connect() as conn:
            row = conn.execute('SELECT * FROM materials WHERE id = ?', (material_id,)).fetchone()
        return dict(row) if row else None

    def save_material(self, payload: dict):
        now = self.now()
        with self.connect() as conn:
            if payload.get('id'):
                conn.execute(
                    '''
                    UPDATE materials
                    SET title=?, text_content=?, image_path=?, caption=?, enabled=?, updated_at=?
                    WHERE id=?
                    ''',
                    (
                        payload.get('title', '').strip() or '未命名素材',
                        payload.get('text_content', '').strip(),
                        payload.get('image_path', '').strip(),
                        payload.get('caption', '').strip(),
                        1 if payload.get('enabled', True) else 0,
                        now,
                        payload['id'],
                    ),
                )
                material_id = int(payload['id'])
            else:
                conn.execute(
                    '''
                    INSERT INTO materials(account_id, kind, title, text_content, image_path, caption, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        int(payload['account_id']),
                        payload.get('kind', 'text').strip() or 'text',
                        payload.get('title', '').strip() or '未命名素材',
                        payload.get('text_content', '').strip(),
                        payload.get('image_path', '').strip(),
                        payload.get('caption', '').strip(),
                        1 if payload.get('enabled', True) else 0,
                        now,
                        now,
                    ),
                )
                material_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        self.add_log('保存素材', '成功', f"素材ID={material_id}", payload.get('title', ''))
        return material_id

    def import_image(self, source_path: str):
        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(source_path)
        target = self.images_dir / source.name
        stem = source.stem
        index = 1
        while target.exists():
            target = self.images_dir / f'{stem}_{index}{source.suffix}'
            index += 1
        shutil.copy2(source, target)
        return str(target)

    def delete_material(self, material_id: int):
        material = self.get_material(material_id)
        if not material:
            return
        with self.connect() as conn:
            conn.execute('DELETE FROM materials WHERE id = ?', (material_id,))
        self.add_log('删除素材', '成功', material.get('title', ''), material.get('title', ''))

    def list_rules(self):
        with self.connect() as conn:
            rows = conn.execute(
                '''
                SELECT rules.*, accounts.display_name AS account_name
                FROM rules
                JOIN accounts ON accounts.id = rules.account_id
                ORDER BY rules.id DESC
                '''
            ).fetchall()
        return [dict(row) for row in rows]

    def get_rule(self, rule_id: int):
        with self.connect() as conn:
            row = conn.execute('SELECT * FROM rules WHERE id = ?', (rule_id,)).fetchone()
        return dict(row) if row else None

    def save_rule(self, payload: dict):
        now = self.now()
        with self.connect() as conn:
            if payload.get('id'):
                conn.execute(
                    '''
                    UPDATE rules
                    SET account_id=?, name=?, target_chat=?, start_time=?, end_time=?, interval_minutes=?, daily_limit=?, text_mode=?, image_mode=?, fixed_image_id=?, enabled=?, updated_at=?
                    WHERE id=?
                    ''',
                    (
                        int(payload['account_id']),
                        payload.get('name', '').strip() or '未命名规则',
                        payload.get('target_chat', '').strip(),
                        payload.get('start_time', '09:00').strip(),
                        payload.get('end_time', '21:00').strip(),
                        int(payload.get('interval_minutes', 10) or 10),
                        int(payload.get('daily_limit', 30) or 30),
                        payload.get('text_mode', 'rotate').strip() or 'rotate',
                        payload.get('image_mode', 'none').strip() or 'none',
                        payload.get('fixed_image_id') or None,
                        1 if payload.get('enabled', True) else 0,
                        now,
                        int(payload['id']),
                    ),
                )
                rule_id = int(payload['id'])
            else:
                conn.execute(
                    '''
                    INSERT INTO rules(account_id, name, target_chat, start_time, end_time, interval_minutes, daily_limit, text_mode, image_mode, fixed_image_id, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        int(payload['account_id']),
                        payload.get('name', '').strip() or '未命名规则',
                        payload.get('target_chat', '').strip(),
                        payload.get('start_time', '09:00').strip(),
                        payload.get('end_time', '21:00').strip(),
                        int(payload.get('interval_minutes', 10) or 10),
                        int(payload.get('daily_limit', 30) or 30),
                        payload.get('text_mode', 'rotate').strip() or 'rotate',
                        payload.get('image_mode', 'none').strip() or 'none',
                        payload.get('fixed_image_id') or None,
                        1 if payload.get('enabled', True) else 0,
                        now,
                        now,
                    ),
                )
                rule_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        self.add_log('保存规则', '成功', f'规则ID={rule_id}', payload.get('name', ''))
        return rule_id

    def delete_rule(self, rule_id: int):
        rule = self.get_rule(rule_id)
        if not rule:
            return
        with self.connect() as conn:
            conn.execute('DELETE FROM rules WHERE id = ?', (rule_id,))
        self.add_log('删除规则', '成功', rule.get('name', ''), rule.get('name', ''))

    def get_settings(self):
        with self.connect() as conn:
            rows = conn.execute('SELECT key, value FROM settings').fetchall()
        return {row['key']: row['value'] for row in rows}

    def get_api_credentials(self):
        settings = self.get_settings()
        api_id = str(settings.get('api_id', '') or '').strip()
        api_hash = str(settings.get('api_hash', '') or '').strip()
        if not api_id or not api_hash:
            raise RuntimeError('请先到设置页填写 API ID 和 API HASH，再检查账号状态。')
        try:
            api_id_int = int(api_id)
        except ValueError as exc:
            raise RuntimeError('API ID 必须是数字。') from exc
        return api_id_int, api_hash

    def save_settings(self, payload: dict):
        with self.connect() as conn:
            for key, value in payload.items():
                conn.execute(
                    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                    (key, str(value)),
                )
        self.add_log('保存设置', '成功', '更新本地设置')

    def check_account_status(self, account_id: int):
        account = self.get_account(account_id)
        if not account:
            raise RuntimeError(f'账号不存在：{account_id}')

        api_id, api_hash = self.get_api_credentials()
        session_path = str(account.get('session_path') or '').strip()
        if not session_path:
            raise RuntimeError('当前账号没有 session 路径。')
        if not os.path.exists(session_path):
            result = {
                'status': '失效',
                'last_check_result': 'session 文件不存在',
                'last_error': session_path,
            }
            self.save_account({**account, **result, 'last_check_at': self.now(), 'enabled': bool(account.get('enabled'))})
            self.add_log('检查状态', '失败', f"{account['display_name']} · session 文件不存在", account['display_name'])
            return self.get_account(account_id)

        client = TelegramClient(session_path, api_id, api_hash)
        try:
            client.connect()
            if not client.is_user_authorized():
                status = '需重新登录'
                check_result = 'session 已失效或未授权'
                last_error = '当前 session 需要重新登录'
            else:
                me = client.get_me()
                phone = str(getattr(me, 'phone', '') or account.get('phone') or '').strip()
                display_name = str(getattr(me, 'first_name', '') or '').strip() or account.get('display_name') or '未命名账号'
                status = '正常'
                check_result = 'session 可正常连接'
                last_error = ''
                account['phone'] = phone
                account['display_name'] = display_name
        except SessionPasswordNeededError:
            status = '需重新登录'
            check_result = '该账号需要两步验证密码'
            last_error = 'session 需要重新登录并完成两步验证'
        except FloodWaitError as exc:
            status = '检查失败'
            check_result = f'触发频率限制，需等待 {exc.seconds} 秒'
            last_error = str(exc)
        except (AuthKeyError, sqlite3.DatabaseError):
            status = '失效'
            check_result = 'session 文件损坏或不可用'
            last_error = 'session 文件损坏 / 不可读取'
        except RPCError as exc:
            status = '检查失败'
            check_result = f'检查失败：{exc.__class__.__name__}'
            last_error = str(exc)
        except Exception as exc:
            status = '检查失败'
            check_result = f'连接失败：{exc.__class__.__name__}'
            last_error = str(exc)
        finally:
            try:
                client.disconnect()
            except Exception:
                pass

        payload = {
            **account,
            'status': status,
            'last_check_at': self.now(),
            'last_check_result': check_result,
            'last_error': last_error,
            'enabled': bool(account.get('enabled')),
        }
        self.save_account(payload)
        self.add_log('检查状态', '成功' if status == '正常' else '完成', f"{payload['display_name']} · {check_result}", payload['display_name'])
        return self.get_account(account_id)

    def check_accounts_status(self, account_ids=None):
        if account_ids:
            ids = list(account_ids)
        else:
            ids = [row['id'] for row in self.list_accounts()]
        results = []
        for account_id in ids:
            results.append(self.check_account_status(int(account_id)))
        return results

    def list_logs(self, limit: int = 300):
        with self.connect() as conn:
            rows = conn.execute('SELECT * FROM logs ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        return [dict(row) for row in rows]

    def clear_preview_jobs(self, run_date: str):
        with self.connect() as conn:
            conn.execute('DELETE FROM preview_jobs WHERE run_date = ?', (run_date,))
        self.add_log('清空预览', '成功', run_date)

    def list_preview_jobs(self, run_date: str = '', account_id: int = 0):
        query = '''
            SELECT preview_jobs.*, accounts.display_name AS account_name, rules.name AS rule_name
            FROM preview_jobs
            JOIN accounts ON accounts.id = preview_jobs.account_id
            JOIN rules ON rules.id = preview_jobs.rule_id
            WHERE 1=1
        '''
        params = []
        if run_date:
            query += ' AND run_date = ?'
            params.append(run_date)
        if account_id:
            query += ' AND account_id = ?'
            params.append(int(account_id))
        query += ' ORDER BY run_at ASC, id ASC'
        with self.connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _build_time_points(self, start_time: str, end_time: str, interval_minutes: int, daily_limit: int):
        base_date = datetime.combine(date.today(), datetime.min.time())
        start = datetime.strptime(start_time, '%H:%M').replace(year=base_date.year, month=base_date.month, day=base_date.day)
        end = datetime.strptime(end_time, '%H:%M').replace(year=base_date.year, month=base_date.month, day=base_date.day)
        if end < start:
            return []
        items = []
        current = start
        while current <= end and len(items) < daily_limit:
            items.append(current.strftime('%H:%M'))
            current += timedelta(minutes=max(interval_minutes, 1))
        return items

    def generate_preview_jobs(self, run_date: str, account_id: int = 0):
        self.clear_preview_jobs(run_date)
        with self.connect() as conn:
            query = '''
                SELECT rules.*, accounts.display_name AS account_name, accounts.target_chat AS account_target_chat
                FROM rules
                JOIN accounts ON accounts.id = rules.account_id
                WHERE rules.enabled = 1 AND accounts.enabled = 1
            '''
            params = []
            if account_id:
                query += ' AND rules.account_id = ?'
                params.append(int(account_id))
            query += ' ORDER BY rules.id ASC'
            rules = [dict(row) for row in conn.execute(query, params).fetchall()]

            for rule in rules:
                text_materials = [dict(row) for row in conn.execute(
                    "SELECT * FROM materials WHERE account_id = ? AND kind = 'text' AND enabled = 1 ORDER BY id ASC",
                    (rule['account_id'],),
                ).fetchall()]
                image_materials = [dict(row) for row in conn.execute(
                    "SELECT * FROM materials WHERE account_id = ? AND kind = 'image' AND enabled = 1 ORDER BY id ASC",
                    (rule['account_id'],),
                ).fetchall()]
                fixed_image = None
                if rule.get('fixed_image_id'):
                    row = conn.execute('SELECT * FROM materials WHERE id = ?', (rule['fixed_image_id'],)).fetchone()
                    fixed_image = dict(row) if row else None

                points = self._build_time_points(rule['start_time'], rule['end_time'], rule['interval_minutes'], rule['daily_limit'])
                for idx, point in enumerate(points):
                    text_summary = ''
                    if text_materials:
                        if rule['text_mode'] == 'random':
                            chosen_text = random.choice(text_materials)
                        else:
                            chosen_text = text_materials[idx % len(text_materials)]
                        text_summary = (chosen_text.get('text_content') or chosen_text.get('title') or '').strip().replace('\n', ' ')
                    image_summary = ''
                    if rule['image_mode'] == 'fixed' and fixed_image:
                        image_summary = fixed_image.get('title') or os.path.basename(fixed_image.get('image_path') or '')
                    elif rule['image_mode'] == 'random' and image_materials:
                        chosen_image = random.choice(image_materials)
                        image_summary = chosen_image.get('title') or os.path.basename(chosen_image.get('image_path') or '')
                    target_chat = (rule.get('target_chat') or rule.get('account_target_chat') or '').strip()
                    conn.execute(
                        '''
                        INSERT INTO preview_jobs(run_date, run_at, account_id, rule_id, target_chat, text_summary, image_summary, status, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''',
                        (
                            run_date,
                            point,
                            rule['account_id'],
                            rule['id'],
                            target_chat,
                            text_summary[:120],
                            image_summary[:120],
                            '待执行',
                            self.now(),
                        ),
                    )
        self.add_log('生成预览', '成功', f'{run_date} · account={account_id or "ALL"}')

    def account_choices(self):
        rows = self.list_accounts()
        return [(row['id'], row['display_name']) for row in rows]

    def image_material_choices(self, account_id: int):
        rows = self.list_materials(account_id, 'image')
        return [(row['id'], row['title'] or os.path.basename(row['image_path'] or '未命名图片')) for row in rows]
