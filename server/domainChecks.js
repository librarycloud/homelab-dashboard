import { whoisDomain } from 'whoiser'
import { query } from './db.js'

// Known registrar and DNS provider mappings to auto-fill URLs
export const defaultRegistrars = [
  { keywords: ['cloudflare'], url: 'https://dash.cloudflare.com/' },
  { keywords: ['aliyun', 'alibaba'], url: 'https://dc.console.aliyun.com/' },
  { keywords: ['tencent', 'dnspod'], url: 'https://console.cloud.tencent.com/domain' },
  { keywords: ['namesilo'], url: 'https://www.namesilo.com/account_domains.php' },
  { keywords: ['godaddy'], url: 'https://dcc.godaddy.com/domains' },
  { keywords: ['namecheap'], url: 'https://ap.www.namecheap.com/domains/list' },
  { keywords: ['gandi'], url: 'https://admin.gandi.net/domain' },
  { keywords: ['chengdu west', 'west.cn', 'west263'], url: 'https://www.west.cn/manager/domain/' },
  { keywords: ['huawei'], url: 'https://console.huaweicloud.com/domain/' }
]

export const defaultDnsProviders = [
  { keywords: ['cloudflare'], url: 'https://dash.cloudflare.com/' },
  { keywords: ['alidns', 'aliyun'], url: 'https://dns.console.aliyun.com/' },
  { keywords: ['dnspod', 'tencent'], url: 'https://console.cloud.tencent.com/cns' },
  { keywords: ['huaweicloud'], url: 'https://console.huaweicloud.com/dns/' }
]

let cachedDicts = null

export async function getDicts() {
  if (cachedDicts) return cachedDicts
  const rows = await query("SELECT setting_key, setting_value FROM `settings` WHERE setting_key IN ('domain_registrars', 'domain_dns_providers')")
  const values = Object.fromEntries(rows.map((row) => {
    try {
      return [row.setting_key, JSON.parse(row.setting_value)]
    } catch {
      return [row.setting_key, null]
    }
  }))
  
  cachedDicts = {
    registrars: values.domain_registrars || defaultRegistrars,
    dnsProviders: values.domain_dns_providers || defaultDnsProviders
  }
  return cachedDicts
}

export async function saveDicts(registrars, dnsProviders) {
  await query(
    "INSERT INTO `settings` (setting_key, setting_value) VALUES ('domain_registrars', ?), ('domain_dns_providers', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
    [JSON.stringify(registrars), JSON.stringify(dnsProviders)]
  )
  cachedDicts = { registrars, dnsProviders }
}

function findUrl(name, dict) {
  if (!name) return null
  const lowerName = name.toLowerCase()
  for (const item of dict) {
    if (item.keywords.some((k) => lowerName.includes(k))) {
      return item.url
    }
  }
  return null
}

// Fallback WHOIS servers for common TLDs in case IANA auto-discovery fails
const fallbackTldServers = {
  uk: 'whois.nic.uk',
  cn: 'whois.cnnic.cn',
  cc: 'whois.nic.cc',
  co: 'whois.nic.co',
  me: 'whois.nic.me',
  tv: 'whois.nic.tv',
  io: 'whois.nic.io',
  xyz: 'whois.nic.xyz',
  top: 'whois.nic.top',
  vip: 'whois.nic.vip',
  club: 'whois.nic.club',
  shop: 'whois.nic.shop',
  site: 'whois.nic.site',
  icu: 'whois.nic.icu',
  de: 'whois.denic.de',
  hk: 'whois.hkirc.hk'
}

export async function fetchDomainInfo(domainName) {
  try {
    const tld = domainName.split('.').pop().toLowerCase()
    let expirationDate = null
    let registrarName = null
    let dnsProviderName = null

    // .ch and .li block WHOIS port 43, we must use RDAP
    if (tld === 'ch' || tld === 'li') {
      const res = await fetch(`https://rdap.nic.ch/domain/${domainName}`)
      if (res.ok) {
        const json = await res.json()
        const registrarEntity = json.entities?.find(e => e.roles?.includes('registrar'))
        if (registrarEntity) {
          const org = registrarEntity.vcardArray?.[1]?.find(v => v[0] === 'org')?.[3]
          if (org) registrarName = org
        }
        if (json.nameservers && json.nameservers.length > 0) {
          dnsProviderName = json.nameservers.map(ns => ns.ldhName).join(', ')
        }
        // .ch does not publicly disclose expiration dates
      }
    } else {
      const options = {}
      if (fallbackTldServers[tld]) {
        options.host = fallbackTldServers[tld]
      }
      const domainWhois = await whoisDomain(domainName, options)

      // whoiser returns data by whois server. We check all servers for the data.
      for (const serverName in domainWhois) {
        const serverData = domainWhois[serverName]
        if (!serverData) continue

        if (serverData['Expiry Date']) {
          expirationDate = new Date(serverData['Expiry Date'])
        } else if (serverData['Registry Expiry Date']) {
          expirationDate = new Date(serverData['Registry Expiry Date'])
        } else if (serverData['Registrar Registration Expiration Date']) {
          expirationDate = new Date(serverData['Registrar Registration Expiration Date'])
        }

        if (serverData['Registrar']) {
          // Strip out trailing brackets, e.g. "Cloudflare, Inc. [Tag = CLOUDFLARE]" -> "Cloudflare, Inc."
          registrarName = serverData['Registrar'].replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim()
        }

        if (serverData['Name Server']) {
          // Name servers can be a string or an array
          const ns = Array.isArray(serverData['Name Server']) ? serverData['Name Server'] : serverData['Name Server'].split('\n')
          if (ns.length > 0 && ns[0]) {
            dnsProviderName = ns.join(', ')
          }
        }

        // Fallback parsing for .hk and others that list Name Servers without a standard label
        if (!dnsProviderName && serverData.text) {
          const textLines = Array.isArray(serverData.text) ? serverData.text : serverData.text.split('\n')
          const nsList = []
          let capturing = false
          for (const line of textLines) {
            const l = line.trim()
            if (l.toLowerCase() === 'cdn variant / punycode' || l.toLowerCase() === 'name servers:') {
              capturing = true
              continue
            }
            if (capturing) {
              if (l === '' || l.toLowerCase() === 'unsigned') continue
              if (l.startsWith('-')) break // End of section
              if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(l)) {
                nsList.push(l.toLowerCase())
              } else {
                break // If we encounter non-domain text, stop capturing
              }
            }
          }
          if (nsList.length > 0) {
            dnsProviderName = nsList.join(', ')
          }
        }
      }
    }

    const result = {
      last_check_at: new Date()
    }

    const dicts = await getDicts()

    if (expirationDate && !isNaN(expirationDate)) result.expiration_date = expirationDate
    if (registrarName) {
      result.registrar_name = registrarName
      const url = findUrl(registrarName, dicts.registrars)
      if (url) result.registrar_url = url
    }
    if (dnsProviderName) {
      result.dns_provider_name = dnsProviderName
      const url = findUrl(dnsProviderName, dicts.dnsProviders)
      if (url) result.dns_provider_url = url
    }

    return result
  } catch (error) {
    console.error(`Failed to fetch WHOIS for ${domainName}:`, error.message)
    return { last_check_at: new Date() } // Still update last_check_at on failure
  }
}

export async function refreshDomainInfo(domain) {
  const update = await fetchDomainInfo(domain.domain_name)
  return update
}
