import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import 'dotenv/config'

const execFileAsync = promisify(execFile)
const githubApiBase = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '')
const githubTimeoutMs = Math.min(Math.max(Number(process.env.GITHUB_TIMEOUT_MS || 20000), 5000), 60000)
const statusCheckTimeoutMs = 8000

function normalizeGithubRepository(githubUrl) {
  if (!githubUrl) return null
  try {
    const url = new URL(githubUrl.startsWith('http') ? githubUrl : `https://${githubUrl}`)
    if (url.hostname !== 'github.com') return null
    const [owner, repository] = url.pathname.split('/').filter(Boolean)
    return owner && repository ? `${owner}/${repository.replace(/\.git$/, '')}` : null
  } catch {
    return null
  }
}

function compareVersions(localVersion, remoteVersion) {
  if (!localVersion || !remoteVersion) return 0
  const local = parseVersion(localVersion)
  const remote = parseVersion(remoteVersion)
  if (!local || !remote) return 0
  if (local.base === remote.base && local.distance !== remote.distance) return local.distance > remote.distance ? 1 : 2
  if (local.numeric && remote.numeric) {
    const length = Math.max(local.numeric.length, remote.numeric.length)
    for (let index = 0; index < length; index += 1) {
      const difference = (local.numeric[index] || 0) - (remote.numeric[index] || 0)
      if (difference) return difference > 0 ? 1 : 2
    }
    if (local.prerelease !== remote.prerelease) return local.prerelease ? 2 : 1
    return 1
  }
  return local.base === remote.base ? 1 : 0
}

function parseVersion(value) {
  const raw = String(value).trim().replace(/^v/i, '')
  const gitDescribe = raw.match(/^(.*)-(\d+)-g[0-9a-f]+$/i)
  const base = (gitDescribe ? gitDescribe[1] : raw).split('+')[0]
  const numericPart = base.split('-', 1)[0]
  if (!/^\d+(?:\.\d+)*$/.test(numericPart)) return { base, distance: Number(gitDescribe?.[2] || 0), numeric: null, prerelease: '' }
  return { base, distance: Number(gitDescribe?.[2] || 0), numeric: numericPart.split('.').map(Number), prerelease: base.slice(numericPart.length + 1) }
}

async function githubJson(pathname) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${githubApiBase}${pathname}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'homelab-dashboard' },
        signal: AbortSignal.timeout(githubTimeoutMs)
      })
      if (response.status === 404) throw new Error('未找到 GitHub 仓库或 Release')
      if (response.status === 403 || response.status === 429) throw new Error('GitHub API 请求受限，请稍后再试')
      if (!response.ok) throw new Error(`GitHub API 返回 HTTP ${response.status}`)
      return response.json()
    } catch (error) {
      lastError = error
      if (error.name !== 'TimeoutError' && error.name !== 'AbortError') throw error
    }
  }
  throw new Error(`连接 GitHub API 超时（${githubTimeoutMs / 1000} 秒，已重试一次）。请检查服务器网络、代理或 GITHUB_API_BASE 配置`)
}

function shortCommit(sha) {
  return String(sha || '').slice(0, 7) || null
}

async function githubDefaultBranch(repository) {
  const details = await githubJson(`/repos/${repository}`)
  if (!details?.default_branch) throw new Error('无法获取 GitHub 仓库默认分支')
  return details.default_branch
}

async function githubPackageVersion(repository, branch) {
  const file = await githubJson(`/repos/${repository}/contents/package.json?ref=${encodeURIComponent(branch)}`)
  if (!file?.content) throw new Error('GitHub 仓库根目录未找到 package.json')
  const packageJson = JSON.parse(Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString('utf8'))
  return packageJson.version || null
}

export async function checkVersion(service) {
  const now = new Date()
  const update = { version_status: 0, last_check_at: now }
  let comparisonHandled = false

  if (service.version_type === 0) throw new Error('手动维护类型不支持自动检测')

  if (service.version_type === 1 || service.version_type === 2 || service.version_type === 5) {
    const repository = normalizeGithubRepository(service.github_url)
    if (!repository) throw new Error('GitHub 地址必须是 github.com/<组织或用户>/<仓库>')
    if (service.version_type === 1) {
      const tags = await githubJson(`/repos/${repository}/tags?per_page=1`)
      if (!Array.isArray(tags) || !tags[0]?.name) throw new Error('该 GitHub 仓库没有可用的 Git 标签，请改用 Git 提交或手动维护')
      update.remote_version = tags[0].name
    } else if (service.version_type === 5) {
      let localCommit = service.local_version
      if (service.local_path) {
        const { stdout } = await execFileAsync('git', ['-C', service.local_path, 'rev-parse', 'HEAD'], { timeout: 10000 })
        localCommit = stdout.trim() || null
        update.local_version = shortCommit(localCommit)
      }
      const branch = await githubDefaultBranch(repository)
      const remoteCommit = await githubJson(`/repos/${repository}/commits/${encodeURIComponent(branch)}`)
      if (!remoteCommit?.sha) throw new Error('无法获取 GitHub 默认分支的最新提交')
      update.remote_version = shortCommit(remoteCommit.sha)

      if (localCommit) {
        const comparison = await githubJson(`/repos/${repository}/compare/${encodeURIComponent(localCommit)}...${remoteCommit.sha}`)
        update.version_status = Number(comparison.ahead_by || 0) > 0 ? 2 : 1
        comparisonHandled = true
      }
    } else {
      const release = await githubJson(`/repos/${repository}/releases/latest`)
      if (!release?.tag_name) throw new Error('该 GitHub 仓库没有可用的 Release，请改用 Git 标签或手动维护')
      update.remote_version = release.tag_name
    }
  }

  if (service.version_type === 1 && service.local_path) {
    const { stdout } = await execFileAsync('git', ['-C', service.local_path, 'describe', '--tags', '--always'], { timeout: 10000 })
    update.local_version = stdout.trim() || null
  }

  if (service.version_type === 3) {
    if (!service.local_path) throw new Error('package.json 检测需要填写本地路径')
    const packagePath = path.join(service.local_path, 'package.json')
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
    update.local_version = packageJson.version || null
    const repository = normalizeGithubRepository(service.github_url)
    if (repository) {
      update.remote_version = await githubPackageVersion(repository, await githubDefaultBranch(repository))
    } else {
      update.remote_version = null
    }
  }

  if (service.version_type === 4) {
    if (!service.docker_name) throw new Error('Docker 检测需要填写容器名称')
    const { stdout } = await execFileAsync('docker', ['inspect', service.docker_name, '--format', '{{json .State}}'], { timeout: 10000 })
    const state = JSON.parse(stdout)
    update.docker_status = state.Running ? 1 : state.Status === 'exited' ? 3 : state.Status === 'created' ? 2 : 4
    update.docker_health = state.Health?.Status || null
    update.docker_restart_count = Number(state.RestartCount || 0)
    update.docker_last_check_at = now
    if (service.docker_image) {
      const { stdout: image } = await execFileAsync('docker', ['image', 'inspect', service.docker_image, '--format', '{{join .RepoTags ","}}'], { timeout: 10000 })
      update.remote_version = image.trim() || null
    }
  }

  if (!comparisonHandled && (update.remote_version !== undefined || update.local_version !== undefined)) {
    update.version_status = compareVersions(update.local_version ?? service.local_version, update.remote_version ?? service.remote_version)
  }
  return update
}

function serviceUrl(value, defaultProtocol = 'http') {
  if (!value) return null
  try { return new URL(/^https?:\/\//i.test(value) ? value : `${defaultProtocol}://${value}`) } catch { return null }
}

function isPrivateIp(hostname) {
  const address = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number)
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
  }
  if (isIP(address) === 6) {
    return address === '::1'
      || address.startsWith('fc')
      || address.startsWith('fd')
      || /^fe[89ab]/.test(address)
  }
  return false
}

function requestUrl(url, method, allowSelfSigned) {
  const client = url.protocol === 'https:' ? https : http
  return new Promise((resolve) => {
    const request = client.request(url, {
      method,
      rejectUnauthorized: !(url.protocol === 'https:' && allowSelfSigned),
      timeout: statusCheckTimeoutMs
    }, (response) => {
      response.resume()
      resolve(response.statusCode || null)
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(null))
    request.end()
  })
}

async function probeUrl(value, defaultProtocol = 'http', { allowSelfSigned = false } = {}) {
  const rawValue = String(value).trim()
  const hasProtocol = /^https?:\/\//i.test(rawValue)
  const protocols = hasProtocol ? [defaultProtocol] : [defaultProtocol, defaultProtocol === 'https' ? 'http' : 'https']
  for (const protocol of protocols) {
    const url = serviceUrl(rawValue, protocol)
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) continue
    const requestOptions = url.protocol === 'https:' && (allowSelfSigned || isPrivateIp(url.hostname))
    const headStatus = await requestUrl(url, 'HEAD', requestOptions)
    if (headStatus === 405 || headStatus === 501 || headStatus >= 500) {
      const getStatus = await requestUrl(url, 'GET', requestOptions)
      if (getStatus !== null && getStatus > 0 && getStatus < 500) return true
    } else if (headStatus !== null && headStatus > 0 && headStatus < 500) {
      return true
    }
  }
  return false
}

export async function refreshServiceStatus(service) {
  const now = new Date()
  const update = { last_check_at: now }
  if (service.docker_enabled && service.docker_name) {
    try {
      const { stdout } = await execFileAsync('docker', ['inspect', service.docker_name, '--format', '{{json .State}}'], { timeout: statusCheckTimeoutMs })
      const state = JSON.parse(stdout)
      update.docker_status = state.Running ? 1 : state.Status === 'exited' ? 3 : state.Status === 'created' ? 2 : 4
      update.docker_health = state.Health?.Status || null
      update.docker_restart_count = Number(state.RestartCount || 0)
      update.docker_last_check_at = now
      update.status = state.Running && (!state.Health || state.Health.Status !== 'unhealthy') ? 1 : state.Running ? 2 : 0
    } catch {
      update.docker_status = 3
      update.docker_last_check_at = now
      update.status = 3
    }
  } else if (service.lan_url || service.wan_url) {
    const reachable = await probeUrl(service.lan_url || service.wan_url, service.lan_url ? 'http' : 'https', {
      allowSelfSigned: Boolean(service.lan_url)
    })
    update.status = reachable ? 1 : 0
  }
  return update
}
