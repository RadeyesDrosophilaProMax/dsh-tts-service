/**
 * Client half: sidebar panel for the local Qwen3-TTS service.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-tts-service',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const DEFAULT_EMOTION = '情绪饱满，语气带笑，有点撒娇'
    const DEFAULT_TEMP = '0.9'
    const SAMPLE = '主人，我在这儿呢。您听这一句，是不是还带点笑？'

    function PanelIcon({ size = 20, active = false }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block', opacity: active ? 1 : 0.85 },
        },
        h('path', { d: 'M4 10h3l5-4v12l-5-4H4z', fill: 'currentColor', opacity: 0.9 }),
        h('path', {
          d: 'M15.5 9.2c1.4 1.5 1.4 4.1 0 5.6',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M18 6.8c2.4 2.6 2.4 7.8 0 10.4',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          opacity: 0.6,
        }),
      )
    }

    function Panel() {
      const [status, setStatus] = React.useState(null)
      const [voices, setVoices] = React.useState([])
      const [speaker, setSpeaker] = React.useState('serena')
      const [emotion, setEmotion] = React.useState(DEFAULT_EMOTION)
      const [temperature, setTemperature] = React.useState(DEFAULT_TEMP)
      const [text, setText] = React.useState(SAMPLE)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')

      const refresh = React.useCallback(async () => {
        try {
          const sr = await fetch('/tts-local/status')
          setStatus(await sr.json())
          const vr = await fetch('/tts-local/voices')
          const vd = await vr.json()
          if (Array.isArray(vd.voices) && vd.voices.length > 0) {
            setVoices(vd.voices)
            setSpeaker((prev) => (vd.voices.includes(prev) ? prev : vd.voices[0]))
          }
        } catch (error) {
          setNote('状态读取失败：' + String(error && error.message))
        }
      }, [])

      React.useEffect(() => {
        void refresh()
      }, [refresh])

      const speak = async () => {
        if (text.trim() === '') return
        setBusy(true)
        setNote('合成中…')
        const started = Date.now()
        try {
          const response = await fetch('/tts-local/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              speaker,
              emotion,
              temperature: Number(temperature),
            }),
          })
          const data = await response.json()
          const wall = ((Date.now() - started) / 1000).toFixed(1)
          if (data.ok === true) {
            setNote(`完成：音频 ${data.duration}s，墙钟 ${wall}s，首响 ${data.first_audio_ms ?? '-'} ms`)
          } else {
            setNote('失败：' + (data.error || '未知错误'))
          }
        } catch (error) {
          setNote('请求失败：' + String(error && error.message))
        } finally {
          setBusy(false)
          void refresh()
        }
      }

      const restart = async () => {
        setBusy(true)
        setNote('重启中（冷启动约 15～30 秒）…')
        try {
          const response = await fetch('/tts-local/restart', { method: 'POST' })
          const data = await response.json()
          setNote(data.ok === true ? '重启完成' : '重启后仍未就绪')
        } catch (error) {
          setNote('重启失败：' + String(error && error.message))
        } finally {
          setBusy(false)
          void refresh()
        }
      }

      const online = status !== null && status.online === true
      const label = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }
      const field = {
        width: '100%',
        padding: '6px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 13,
        boxSizing: 'border-box',
      }
      const button = (disabled) => ({
        padding: '6px 14px',
        borderRadius: 6,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: 'var(--dsw-alias-brand-fill, #2f6fd0)',
        color: '#fff',
        fontSize: 13,
      })

      return h(
        'div',
        { style: { padding: 20, maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', {
            style: {
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: online ? '#39c07a' : '#d9534f',
              display: 'inline-block',
            },
          }),
          h('span', { style: { fontSize: 15, fontWeight: 600 } }, '本地语音（Qwen3-TTS）'),
          h('span', { style: { ...label, marginLeft: 'auto' } },
            status === null ? '读取中' : online ? `在线 · ${status.port}` : '离线'),
        ),

        h('div', { style: { display: 'flex', gap: 10 } },
          h('div', { style: { flex: 1 } },
            h('div', { style: label }, '音色'),
            h('select', {
              value: speaker,
              onChange: (e) => setSpeaker(e.target.value),
              style: { ...field, marginTop: 4 },
            }, voices.map((voice) => h('option', { key: voice, value: voice }, voice))),
          ),
          h('div', { style: { width: 110 } },
            h('div', { style: label }, '温度'),
            h('input', {
              value: temperature,
              onChange: (e) => setTemperature(e.target.value),
              style: { ...field, marginTop: 4 },
            }),
          ),
        ),

        h('div', {},
          h('div', { style: label }, '情绪指令'),
          h('input', {
            value: emotion,
            onChange: (e) => setEmotion(e.target.value),
            style: { ...field, marginTop: 4 },
          }),
        ),

        h('div', {},
          h('div', { style: label }, '试听文本'),
          h('textarea', {
            value: text,
            onChange: (e) => setText(e.target.value),
            rows: 3,
            style: { ...field, marginTop: 4, resize: 'vertical' },
          }),
        ),

        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
          h('button', { onClick: speak, disabled: busy, style: button(busy) }, busy ? '处理中…' : '试听'),
          h('button', {
            onClick: restart,
            disabled: busy,
            style: { ...button(busy), background: 'transparent', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))' },
          }, '重启服务'),
          h('button', {
            onClick: () => void refresh(),
            disabled: busy,
            style: { ...button(busy), background: 'transparent', color: 'var(--dsw-alias-label-primary)', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))' },
          }, '刷新'),
        ),

        h('div', { style: { ...label, minHeight: 18 } }, note),
        h('div', { style: { ...label, lineHeight: 1.6 } },
          '服务由插件随 DSH 启停：DSH 关闭即释放，重启电脑后若未启动 DSH 则不会加载。'),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'tts-panel',
          order: 45,
          label: '本地语音',
        }, PanelIcon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'tts-panel' }, Panel))
      },
    }
  },
})
