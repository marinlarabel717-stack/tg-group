export interface PhoneCountryMeta {
  iso2: string
  nameZh: string
  prefixes: string[]
  aliases?: string[]
}

const PHONE_COUNTRIES: PhoneCountryMeta[] = [
  { iso2: 'ID', nameZh: '印尼', prefixes: ['62'], aliases: ['id', 'indonesia', '印尼', '印度尼西亚'] },
  { iso2: 'MY', nameZh: '马来西亚', prefixes: ['60'], aliases: ['my', 'malaysia', '马来西亚'] },
  { iso2: 'SG', nameZh: '新加坡', prefixes: ['65'], aliases: ['sg', 'singapore', '新加坡'] },
  { iso2: 'PH', nameZh: '菲律宾', prefixes: ['63'], aliases: ['ph', 'philippines', '菲律宾'] },
  { iso2: 'VN', nameZh: '越南', prefixes: ['84'], aliases: ['vn', 'vietnam', '越南'] },
  { iso2: 'TH', nameZh: '泰国', prefixes: ['66'], aliases: ['th', 'thailand', '泰国'] },
  { iso2: 'MM', nameZh: '缅甸', prefixes: ['95'], aliases: ['mm', 'myanmar', '缅甸'] },
  { iso2: 'KH', nameZh: '柬埔寨', prefixes: ['855'], aliases: ['kh', 'cambodia', '柬埔寨'] },
  { iso2: 'LA', nameZh: '老挝', prefixes: ['856'], aliases: ['la', 'laos', '老挝'] },
  { iso2: 'BD', nameZh: '孟加拉', prefixes: ['880'], aliases: ['bd', 'bangladesh', '孟加拉', '孟加拉国'] },
  { iso2: 'IN', nameZh: '印度', prefixes: ['91'], aliases: ['in', 'india', '印度'] },
  { iso2: 'PK', nameZh: '巴基斯坦', prefixes: ['92'], aliases: ['pk', 'pakistan', '巴基斯坦'] },
  { iso2: 'KZ', nameZh: '哈萨克斯坦', prefixes: ['76', '77', '7'], aliases: ['kz', 'kazakhstan', '哈萨克斯坦'] },
  { iso2: 'RU', nameZh: '俄罗斯', prefixes: ['79', '7'], aliases: ['ru', 'russia', '俄罗斯'] },
  { iso2: 'UA', nameZh: '乌克兰', prefixes: ['380'], aliases: ['ua', 'ukraine', '乌克兰'] },
  { iso2: 'UZ', nameZh: '乌兹别克斯坦', prefixes: ['998'], aliases: ['uz', 'uzbekistan', '乌兹别克斯坦'] },
  { iso2: 'KG', nameZh: '吉尔吉斯斯坦', prefixes: ['996'], aliases: ['kg', 'kyrgyzstan', '吉尔吉斯斯坦'] },
  { iso2: 'AE', nameZh: '阿联酋', prefixes: ['971'], aliases: ['ae', 'uae', 'emirates', '阿联酋'] },
  { iso2: 'SA', nameZh: '沙特', prefixes: ['966'], aliases: ['sa', 'saudi', 'saudiarabia', '沙特', '沙特阿拉伯'] },
  { iso2: 'TR', nameZh: '土耳其', prefixes: ['90'], aliases: ['tr', 'turkey', '土耳其'] },
  { iso2: 'IR', nameZh: '伊朗', prefixes: ['98'], aliases: ['ir', 'iran', '伊朗'] },
  { iso2: 'IQ', nameZh: '伊拉克', prefixes: ['964'], aliases: ['iq', 'iraq', '伊拉克'] },
  { iso2: 'EG', nameZh: '埃及', prefixes: ['20'], aliases: ['eg', 'egypt', '埃及'] },
  { iso2: 'ZA', nameZh: '南非', prefixes: ['27'], aliases: ['za', 'southafrica', '南非'] },
  { iso2: 'NG', nameZh: '尼日利亚', prefixes: ['234'], aliases: ['ng', 'nigeria', '尼日利亚'] },
  { iso2: 'KE', nameZh: '肯尼亚', prefixes: ['254'], aliases: ['ke', 'kenya', '肯尼亚'] },
  { iso2: 'ET', nameZh: '埃塞俄比亚', prefixes: ['251'], aliases: ['et', 'ethiopia', '埃塞俄比亚'] },
  { iso2: 'BR', nameZh: '巴西', prefixes: ['55'], aliases: ['br', 'brazil', '巴西'] },
  { iso2: 'AR', nameZh: '阿根廷', prefixes: ['54'], aliases: ['ar', 'argentina', '阿根廷'] },
  { iso2: 'MX', nameZh: '墨西哥', prefixes: ['52'], aliases: ['mx', 'mexico', '墨西哥'] },
  { iso2: 'CO', nameZh: '哥伦比亚', prefixes: ['57'], aliases: ['co', 'colombia', '哥伦比亚'] },
  { iso2: 'PE', nameZh: '秘鲁', prefixes: ['51'], aliases: ['pe', 'peru', '秘鲁'] },
  { iso2: 'CL', nameZh: '智利', prefixes: ['56'], aliases: ['cl', 'chile', '智利'] },
  { iso2: 'US', nameZh: '美国', prefixes: ['1'], aliases: ['us', 'usa', 'unitedstates', '美国'] },
  { iso2: 'CA', nameZh: '加拿大', prefixes: ['1'], aliases: ['ca', 'canada', '加拿大'] },
  { iso2: 'GB', nameZh: '英国', prefixes: ['44'], aliases: ['gb', 'uk', 'unitedkingdom', '英国'] },
  { iso2: 'DE', nameZh: '德国', prefixes: ['49'], aliases: ['de', 'germany', '德国'] },
  { iso2: 'FR', nameZh: '法国', prefixes: ['33'], aliases: ['fr', 'france', '法国'] },
  { iso2: 'IT', nameZh: '意大利', prefixes: ['39'], aliases: ['it', 'italy', '意大利'] },
  { iso2: 'ES', nameZh: '西班牙', prefixes: ['34'], aliases: ['es', 'spain', '西班牙'] },
  { iso2: 'NL', nameZh: '荷兰', prefixes: ['31'], aliases: ['nl', 'netherlands', '荷兰'] },
  { iso2: 'PL', nameZh: '波兰', prefixes: ['48'], aliases: ['pl', 'poland', '波兰'] },
  { iso2: 'PT', nameZh: '葡萄牙', prefixes: ['351'], aliases: ['pt', 'portugal', '葡萄牙'] },
  { iso2: 'AU', nameZh: '澳大利亚', prefixes: ['61'], aliases: ['au', 'australia', '澳大利亚'] },
  { iso2: 'NZ', nameZh: '新西兰', prefixes: ['64'], aliases: ['nz', 'newzealand', '新西兰'] },
  { iso2: 'CN', nameZh: '中国', prefixes: ['86'], aliases: ['cn', 'china', '中国'] },
  { iso2: 'HK', nameZh: '香港', prefixes: ['852'], aliases: ['hk', 'hongkong', '香港'] },
  { iso2: 'MO', nameZh: '澳门', prefixes: ['853'], aliases: ['mo', 'macao', 'macau', '澳门'] },
  { iso2: 'TW', nameZh: '台湾', prefixes: ['886'], aliases: ['tw', 'taiwan', '台湾'] }
]

const PREFIX_INDEX = PHONE_COUNTRIES.flatMap((country) =>
  country.prefixes.map((prefix) => ({ prefix, country }))
).sort((left, right) => right.prefix.length - left.prefix.length)

const COUNTRY_ALIAS_INDEX = new Map<string, PhoneCountryMeta>()
for (const country of PHONE_COUNTRIES) {
  COUNTRY_ALIAS_INDEX.set(country.iso2.toLowerCase(), country)
  COUNTRY_ALIAS_INDEX.set(country.nameZh.toLowerCase(), country)
  for (const alias of country.aliases ?? []) {
    COUNTRY_ALIAS_INDEX.set(normalizeCountryToken(alias), country)
  }
}

function normalizeCountryToken(value: string) {
  return value.toLowerCase().replace(/[\s_\-()（）]+/g, '')
}

function isoToFlag(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

export function normalizePhoneDigits(value: string | null | undefined) {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const noPrefix = trimmed.startsWith('00') ? trimmed.slice(2) : trimmed
  const digits = noPrefix.replace(/\D+/g, '')
  return digits.length >= 5 ? digits : ''
}

export function inferPhoneFromText(value: string | null | undefined) {
  return normalizePhoneDigits(value)
}

export function findCountryByPhone(phone: string | null | undefined) {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return null

  for (const item of PREFIX_INDEX) {
    if (digits.startsWith(item.prefix)) {
      return item.country
    }
  }

  return null
}

export function findCountryByLabel(value: string | null | undefined) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return COUNTRY_ALIAS_INDEX.get(normalizeCountryToken(trimmed)) ?? null
}

export function formatCountryDisplay(country: PhoneCountryMeta) {
  return `${isoToFlag(country.iso2)} ${country.nameZh}`
}

export function inferCountryDisplay(phone: string | null | undefined, explicitCountry?: string | null) {
  const explicit = findCountryByLabel(explicitCountry)
  if (explicit) return formatCountryDisplay(explicit)

  const fromPhone = findCountryByPhone(phone)
  if (fromPhone) return formatCountryDisplay(fromPhone)

  return explicitCountry?.trim() ?? ''
}
