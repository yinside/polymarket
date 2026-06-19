const WEATHER_PAGE_URL = 'https://polymarket.com/predictions/weather'
const GAMMA_EVENT_SLUG_URL = 'https://gamma-api.polymarket.com/events/slug'
const CACHE_TTL_MS = 15_000
const DEFAULT_THRESHOLD = 30

const MONTH_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const CITY_NAME_MAP = {
  Amsterdam: '阿姆斯特丹',
  Ankara: '安卡拉',
  Austin: '奥斯汀',
  Beijing: '北京',
  Busan: '釜山',
  'Cape Town': '开普敦',
  Chengdu: '成都',
  Chongqing: '重庆',
  Dallas: '达拉斯',
  Guangzhou: '广州',
  Helsinki: '赫尔辛基',
  'Hong Kong': '香港',
  Istanbul: '伊斯坦布尔',
  Jeddah: '吉达',
  Karachi: '卡拉奇',
  'Kuala Lumpur': '吉隆坡',
  London: '伦敦',
  'Los Angeles': '洛杉矶',
  Lucknow: '勒克瑙',
  Madrid: '马德里',
  Manila: '马尼拉',
  Miami: '迈阿密',
  Milan: '米兰',
  Moscow: '莫斯科',
  Munich: '慕尼黑',
  NYC: '纽约',
  Paris: '巴黎',
  Qingdao: '青岛',
  'Sao Paulo': '圣保罗',
  Seattle: '西雅图',
  Seoul: '首尔',
  Shanghai: '上海',
  Shenzhen: '深圳',
  Singapore: '新加坡',
  Taipei: '台北',
  'Tel Aviv': '特拉维夫',
  Tokyo: '东京',
  Warsaw: '华沙',
  Wellington: '惠灵顿',
  Wuhan: '武汉',
}

const cache = new Map()

function clampThreshold(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_THRESHOLD
  }

  return Math.max(0, Math.min(100, value))
}

function roundProbability(value) {
  return Math.round(value * 1000) / 10
}

function parseJsonArray(value) {
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function extractEventSlugs(html) {
  const slugs = new Set()

  for (const match of html.matchAll(/\/event\/(highest-temperature-in-[a-z0-9-]+)/g)) {
    slugs.add(match[1])
  }

  return [...slugs]
}

function extractCity(title) {
  const match = title.match(/^Highest temperature in (.+) on /i)
  return match?.[1] ?? title
}

function translateCity(city) {
  return CITY_NAME_MAP[city] ?? city
}

function extractMarketDateLabel(title, fallbackDate) {
  const match = title.match(/ on ([A-Za-z]+) (\d+)\?/i)

  if (match) {
    const month = MONTH_MAP[match[1].toLowerCase()]

    if (month) {
      return `${month}月${match[2]}日`
    }
  }

  const date = new Date(fallbackDate)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function extractLabel(question) {
  const match = question.match(/ be (.+) on /i)
  return match?.[1] ?? question
}

function extractYesProbability(market) {
  const outcomes = parseJsonArray(market.outcomes)
  const prices = parseJsonArray(market.outcomePrices)
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes')

  if (yesIndex === -1) {
    return 0
  }

  const rawValue = Number(prices[yesIndex] ?? 0)
  return Number.isFinite(rawValue) ? rawValue : 0
}

function toCityMarket(event, threshold) {
  const options = event.markets
    .map((market) => ({
      label: extractLabel(market.question),
      probability: roundProbability(extractYesProbability(market)),
    }))
    .sort((left, right) => right.probability - left.probability)

  if (!options.length) {
    return null
  }

  const topOption = options[0]
  const topFour = options.slice(0, 4)
  const city = extractCity(event.title)

  return {
    city,
    cityZh: translateCity(city),
    endDate: event.endDate,
    marketDateLabel: extractMarketDateLabel(event.title, event.endDate),
    marketUrl: `https://polymarket.com/event/${event.slug}`,
    options,
    slug: event.slug,
    topOption,
    topFour,
    topOptionProbability: topOption.probability,
    trigger: topOption.probability < threshold,
    volume24hr: event.volume24hr ?? 0,
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; HeatScanner/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.text()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; HeatScanner/1.0)',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.json()
}

async function fetchActiveEvents() {
  const html = await fetchText(WEATHER_PAGE_URL)
  const slugs = extractEventSlugs(html)
  const events = await Promise.all(
    slugs.map(async (slug) => {
      try {
        return await fetchJson(`${GAMMA_EVENT_SLUG_URL}/${slug}`)
      } catch {
        return null
      }
    }),
  )

  return events.filter((event) => {
    if (!event) {
      return false
    }

    return (
      event.active &&
      !event.closed &&
      !event.archived &&
      event.title.toLowerCase().startsWith('highest temperature in ')
    )
  })
}

async function getMarketsResponse(rawThreshold = DEFAULT_THRESHOLD) {
  const threshold = clampThreshold(rawThreshold)
  const cached = cache.get(threshold)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const events = await fetchActiveEvents()
  const cities = events
    .map((event) => toCityMarket(event, threshold))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.trigger !== right.trigger) {
        return left.trigger ? -1 : 1
      }

      return left.topOptionProbability - right.topOptionProbability
    })

  const payload = {
    cities,
    filteredCities: cities.filter((city) => city.trigger),
    generatedAt: new Date().toISOString(),
    sourceCount: events.length,
    threshold,
  }

  cache.set(threshold, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: payload,
  })

  return payload
}

function readThreshold(url) {
  const requestUrl = new URL(url ?? '/api/markets', 'http://localhost')
  return Number(requestUrl.searchParams.get('threshold') ?? DEFAULT_THRESHOLD)
}

export default async function handler(request, response) {
  try {
    const payload = await getMarketsResponse(readThreshold(request.url))
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(payload))
  } catch (error) {
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Unknown server error',
      }),
    )
  }
}
