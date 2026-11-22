/**
 * @local/dsh-tts-service
 *
 * Keeps the local Qwen3-TTS GGUF service alive exactly as long as DSH is alive,
 * and exposes a small panel API (status / voices / speak / restart) for the
 * sidebar component.
 *
 * Nothing is installed at the OS level, so a reboot with DSH not started leaves
 * the service down — which is the requested behaviour.
 *
 * @module @local/dsh-tts-service
 */
import { execFile, spawn } from 'node:child_process'

export const name = 'tts-service'

const DEFAULTS = {
  python: 'D:\\DSHAI\\qwen3tts\\Qwen3-TTS-GGUF\\.venv\\Scripts\\python.exe',
  server: 'D:\\DSHAI\\qwen3tts\\server_gguf.py',
  cwd: 'D:\\DSHAI\\qwen3tts\\Qwen3-TTS-GGUF',
  port: 7890,
  autoStart: true,
  autoRestart: true,
  watchdogSec: 15,
  startupTimeoutSec: 240,
  maxRestarts: 5,
  defaultSpeaker: 'serena',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

export function apply(ctx, config = {}) {
  const settings = { ...DEFAULTS }
  if (config !== null && typeof config === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      if (config[key] !== undefined && config[key] !== null) settings[key] = config[key]
    }
  }

  const base = `http://127.0.0.1:${settings.port}`
  const healthUrl = `${base}/health`
  const log = (...args) => {
    try {
      console.log('[tts-service]', ...args)
    } catch {
      // logging is never fatal
    }
  }

  let child = null
  let adopted = false
  let stopping = false
  let restarts = 0
  let timer = null

  const healthy = async () => {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
      return response.ok
    } catch {
      return false
    }
  }

  const killTree = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) return
    try {
      execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, () => {})
    } catch {
      // best effort
    }
  }

  /** Find whatever currently listens on the port and kill it (used for adopted instances). */
  const killByPort = () => {
    execFile('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true }, (error, stdout) => {
      if (error !== null || !stdout) return
      const pids = new Set()
      for (const line of String(stdout).split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue
        if (!line.includes(`:${settings.port} `) && !line.includes(`:${settings.port}\r`)) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts[parts.length - 1])
        if (Number.isInteger(pid) && pid > 0) pids.add(pid)
      }
      for (const pid of pids) killTree(pid)
    })
  }

  const alive = () => child !== null && child.exitCode === null

  const spawnService = () => {
    try {
      child = spawn(settings.python, [settings.server], {
        cwd: settings.cwd,
        stdio: 'ignore',
        windowsHide: true,
        detached: false,
      })
      child.on('error', (error) => log('spawn failed:', String(error && error.message)))
      child.on('exit', (code) => {
        if (!stopping) log(`service exited (code=${code})`)
        child = null
      })
      log(`spawned pid=${child.pid}`)
      return true
    } catch (error) {
      log('spawn threw:', String(error && error.message))
      child = null
      return false
    }
  }

  /** Start if needed. Resolves true once /health answers; never throws. */
  const start = async () => {
    if (stopping) return false
    if (await healthy()) {
      adopted = child === null
      return true
    }
    if (!alive() && !spawnService()) return false

    const deadline = Date.now() + Number(settings.startupTimeoutSec) * 1000
    while (Date.now() < deadline) {
      if (stopping) return false
      await sleep(1500)
      if (await healthy()) {
        restarts = 0
        log('ready')
        return true
      }
      if (!alive()) break
    }
    return false
  }

  const stop = async () => {
    if (child !== null) {
      killTree(child.pid)
      try {
        child.kill()
      } catch {
        // ignore
      }
      child = null
    } else {
      killByPort()
    }
    adopted = false
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(500)
      if (!(await healthy())) return true
    }
    return false
  }

  const tick = async () => {
    if (stopping) return
    if (await healthy()) {
      restarts = 0
      return
    }
    if (alive()) return
    if (!settings.autoRestart) return
    restarts += 1
    if (restarts > Number(settings.maxRestarts)) {
      log(`giving up after ${settings.maxRestarts} restarts`)
      return
    }
    log(`service down, restart #${restarts}`)
    void start()
  }

  if (settings.autoStart) void start()

  timer = setInterval(() => {
    void tick()
  }, Math.max(5, Number(settings.watchdogSec)) * 1000)
  if (typeof timer.unref === 'function') timer.unref()

  // ---- panel API -------------------------------------------------------
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      const webServer = httpCtx.get('webServer')
      if (webServer === undefined || webServer === null) return

      const routes = []

      routes.push(webServer.register({
        kind: 'exact',
        path: '/tts-local/status',
        handler: async (_req, res) => {
          const online = await healthy()
          json(res, 200, {
            ok: true,
            online,
            managed: alive(),
            port: settings.port,
            defaultSpeaker: settings.defaultSpeaker,
          })
        },
      }))

      routes.push(webServer.register({
        kind: 'exact',
        path: '/tts-local/voices',
        handler: async (_req, res) => {
          try {
            const upstream = await fetch(`${base}/api/v1/voices`, { signal: AbortSignal.timeout(8000) })
            const data = await upstream.json()
            json(res, 200, { ok: true, voices: Array.isArray(data.voices) ? data.voices : [], default: data.default })
          } catch (error) {
            json(res, 502, { ok: false, error: String(error && error.message) })
          }
        },
      }))

      routes.push(webServer.register({
        kind: 'exact',
        path: '/tts-local/speak',
        handler: async (req, res) => {
          try {
            const body = await readBody(req)
            const text = String(body.text ?? '').trim()
            if (text === '') {
              json(res, 400, { ok: false, error: 'text is empty' })
              return
            }
            if (!(await start())) {
              json(res, 503, { ok: false, error: '语音服务未就绪' })
              return
            }
            const payload = {
              text,
              play: body.play !== false,
              speaker: String(body.speaker ?? settings.defaultSpeaker),
            }
            if (body.emotion !== undefined && String(body.emotion).trim() !== '') {
              payload.style = String(body.emotion).trim()
            }
            if (body.temperature !== undefined && body.temperature !== '') {
              payload.temperature = Number(body.temperature)
            }
            const upstream = await fetch(`${base}/api/tts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(600000),
            })
            const data = await upstream.json()
            json(res, upstream.ok ? 200 : 502, data)
          } catch (error) {
            json(res, 500, { ok: false, error: String(error && error.message) })
          }
        },
      }))

      routes.push(webServer.register({
        kind: 'exact',
        path: '/tts-local/restart',
        handler: async (_req, res) => {
          try {
            stopping = false
            await stop()
            const ok = await start()
            json(res, 200, { ok, online: await healthy() })
          } catch (error) {
            json(res, 500, { ok: false, error: String(error && error.message) })
          }
        },
      }))

      if (typeof httpCtx.effect === 'function') {
        httpCtx.effect(() => () => {
          for (const dispose of routes) {
            try {
              dispose()
            } catch {
              // ignore
            }
          }
        })
      }
    })
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => {
      stopping = true
      if (timer !== null) clearInterval(timer)
      timer = null
      if (child !== null) {
        log(`shutting down pid=${child.pid}`)
        killTree(child.pid)
        try {
          child.kill()
        } catch {
          // ignore
        }
        child = null
      } else if (adopted) {
        log('shutting down adopted instance on port', settings.port)
        killByPort()
      }
    })
  }
}
