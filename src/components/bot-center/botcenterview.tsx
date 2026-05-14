import { memo, useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, Play, RefreshCw, Save, Square, Trash2 } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useBotCenterStore } from '../../stores/botcenterstore'
import { formatDateTimeFull } from '../../lib/ui-text'

function StatusBadge({ active, text }: { active: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.08] text-textMuted'}`}>
      {text}
    </span>
  )
}

export default memo(function BotCenterView() {
  const init = useBotCenterStore((state) => state.init)
  const runtime = useBotCenterStore((state) => state.state)
  const loading = useBotCenterStore((state) => state.loading)
  const saving = useBotCenterStore((state) => state.saving)
  const saveConfig = useBotCenterStore((state) => state.saveConfig)
  const refreshProfile = useBotCenterStore((state) => state.refreshProfile)
  const start = useBotCenterStore((state) => state.start)
  const stop = useBotCenterStore((state) => state.stop)
  const clearLogs = useBotCenterStore((state) => state.clearLogs)

  const [botToken, setBotToken] = useState(runtime.config.botToken)
  const [guestReplyTitle, setGuestReplyTitle] = useState(runtime.config.guestReplyTitle)
  const [guestReplyText, setGuestReplyText] = useState(runtime.config.guestReplyText)
  const [autoStart, setAutoStart] = useState(runtime.config.autoStart)
  const [guestReplyEnabled, setGuestReplyEnabled] = useState(runtime.config.guestReplyEnabled)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    setBotToken(runtime.config.botToken)
    setGuestReplyTitle(runtime.config.guestReplyTitle)
    setGuestReplyText(runtime.config.guestReplyText)
    setAutoStart(runtime.config.autoStart)
    setGuestReplyEnabled(runtime.config.guestReplyEnabled)
  }, [runtime.config])

  const dirty = useMemo(() => {
    return botToken !== runtime.config.botToken
      || guestReplyTitle !== runtime.config.guestReplyTitle
      || guestReplyText !== runtime.config.guestReplyText
      || autoStart !== runtime.config.autoStart
      || guestReplyEnabled !== runtime.config.guestReplyEnabled
  }, [autoStart, botToken, guestReplyEnabled, guestReplyText, guestReplyTitle, runtime.config])

  const openBotFather = () => {
    void window.desktopWindow?.openExternal?.('https://t.me/BotFather')
  }

  return (
    <div className="space-y-5 contain-layout">
      <GlassPanel className="bg-card p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-white">机器人中心</div>
            <div className="mt-1 text-xs leading-6 text-textMuted">
              这里先做 Guest Bot 最小可用版：填 Bot Token、检查 Guest Mode、启动监听后，就能在群里被 @ 时自动回消息。
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge active={runtime.profile.valid} text={runtime.profile.valid ? 'Bot 已连通' : 'Bot 未验证'} />
            <StatusBadge active={runtime.profile.supportsGuestQueries} text={runtime.profile.supportsGuestQueries ? 'Guest Mode 已开启' : 'Guest Mode 未开启'} />
            <StatusBadge active={runtime.running} text={runtime.running ? '监听中' : '未监听'} />
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">Bot 接入配置</div>
              <div className="mt-4 grid gap-4">
                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>Bot Token</span>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                    placeholder="123456:AA..."
                    className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm text-textMuted">
                    <span>回复标题</span>
                    <input
                      value={guestReplyTitle}
                      onChange={(event) => setGuestReplyTitle(event.target.value)}
                      placeholder="TG-Matrix"
                      className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                    />
                  </label>

                  <div className="grid gap-3 rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm text-textMuted">
                    <label className="flex items-center justify-between gap-3">
                      <span>启动软件时自动拉起 Bot 监听</span>
                      <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} className="h-4 w-4 accent-sky-400" />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span>收到 Guest 消息后自动回复</span>
                      <input type="checkbox" checked={guestReplyEnabled} onChange={(event) => setGuestReplyEnabled(event.target.checked)} className="h-4 w-4 accent-sky-400" />
                    </label>
                  </div>
                </div>

                <label className="flex flex-col gap-2 text-sm text-textMuted">
                  <span>Guest 自动回复内容</span>
                  <textarea
                    value={guestReplyText}
                    onChange={(event) => setGuestReplyText(event.target.value)}
                    rows={7}
                    className="rounded-[12px] border border-white/10 bg-slate-950/45 px-3 py-3 text-white outline-none transition focus:border-sky-400/50"
                  />
                </label>

                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 px-4 py-3 text-xs leading-6 text-textMuted">
                  可用变量：<span className="text-white">{'{text}'}</span>、<span className="text-white">{'{caller_name}'}</span>、<span className="text-white">{'{caller_username}'}</span>、<span className="text-white">{'{chat_title}'}</span>、<span className="text-white">{'{bot_username}'}</span>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={saving || !dirty}
                    onClick={() => void saveConfig({ botToken, guestReplyTitle, guestReplyText, autoStart, guestReplyEnabled })}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    保存配置
                  </button>
                  <button
                    type="button"
                    disabled={saving || loading}
                    onClick={() => void refreshProfile()}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-white/[0.06] px-4 text-sm font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw size={16} />
                    检查 Bot / Guest Mode
                  </button>
                  <button
                    type="button"
                    disabled={saving || runtime.running}
                    onClick={() => void start()}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-emerald-500 px-4 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Play size={16} />
                    启动监听
                  </button>
                  <button
                    type="button"
                    disabled={saving || !runtime.running}
                    onClick={() => void stop()}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-amber-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Square size={16} />
                    停止监听
                  </button>
                  <button
                    type="button"
                    onClick={openBotFather}
                    className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/10 bg-transparent px-4 text-sm font-medium text-white transition hover:bg-white/[0.04]"
                  >
                    <Bot size={16} />
                    打开 BotFather
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">运行日志</div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-xs text-textMuted">这里只保留最近 200 条，方便你盯 Guest 消息有没有真正进来。</div>
                <button
                  type="button"
                  disabled={saving || runtime.logs.length === 0}
                  onClick={() => void clearLogs()}
                  className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-white/[0.06] px-3 text-xs font-medium text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  清空日志
                </button>
              </div>
              <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
                {runtime.logs.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-white/8 bg-slate-950/25 px-4 py-10 text-center text-sm text-textMuted">
                    还没有日志。先保存 Token，再检查 Guest Mode，最后启动监听。
                  </div>
                ) : runtime.logs.map((log) => (
                  <div key={log.id} className={`rounded-[12px] border px-4 py-3 text-sm ${log.level === 'error'
                    ? 'border-rose-400/15 bg-rose-400/10 text-rose-200'
                    : log.level === 'warning'
                      ? 'border-amber-400/15 bg-amber-400/10 text-amber-100'
                      : log.level === 'success'
                        ? 'border-emerald-400/15 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/8 bg-slate-950/30 text-slate-200'}`}
                  >
                    <div className="mb-1 text-[11px] text-white/55">{formatDateTimeFull(log.createdAt)}</div>
                    <div className="leading-6">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">Bot 状态</div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4">
                  <div className="text-xs text-textMuted">当前 Bot</div>
                  <div className="mt-1 text-base font-semibold text-white">{runtime.profile.username ? `@${runtime.profile.username}` : '未连接'}</div>
                  <div className="mt-2 text-xs leading-6 text-textMuted">
                    名称：{runtime.profile.firstName || '—'}
                    <br />
                    ID：{runtime.profile.id ?? '—'}
                  </div>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>是否允许进群：<span className="text-white">{runtime.profile.canJoinGroups ? '允许' : '不允许'}</span></div>
                  <div>是否读取全部群消息：<span className="text-white">{runtime.profile.canReadAllGroupMessages ? '是' : '否'}</span></div>
                  <div>Guest Mode：<span className="text-white">{runtime.profile.supportsGuestQueries ? '已开启' : '未开启'}</span></div>
                  <div>最近刷新：<span className="text-white">{formatDateTimeFull(runtime.profile.fetchedAt)}</span></div>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] bg-panel p-5">
              <div className="text-sm font-semibold text-white">监听运行态</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>运行状态：<span className="text-white">{runtime.running ? '监听中' : '已停止'}</span></div>
                  <div>轮询状态：<span className="text-white">{runtime.polling ? '正在长轮询' : '空闲'}</span></div>
                  <div>启动时间：<span className="text-white">{formatDateTimeFull(runtime.startedAt)}</span></div>
                  <div>最近轮询：<span className="text-white">{formatDateTimeFull(runtime.lastPollAt)}</span></div>
                  <div>当前 offset：<span className="text-white">{runtime.updateOffset}</span></div>
                </div>
                <div className="rounded-[14px] border border-white/8 bg-slate-950/30 p-4 text-sm leading-7 text-textMuted">
                  <div>收到 Guest 消息：<span className="text-white">{runtime.stats.receivedGuestCount}</span></div>
                  <div>成功回复：<span className="text-white">{runtime.stats.answeredGuestCount}</span></div>
                  <div>回复失败：<span className="text-white">{runtime.stats.failedGuestCount}</span></div>
                  <div>最近 Guest 消息：<span className="text-white">{formatDateTimeFull(runtime.stats.lastGuestAt)}</span></div>
                </div>
              </div>
            </div>

            {runtime.lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{runtime.lastActionMessage}</div> : null}
            {runtime.lastError ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{runtime.lastError}</div> : null}
          </div>
        </div>
      </GlassPanel>
    </div>
  )
})
