import type { CityMarket, MarketsResponse } from '../types'

const GAMMA_EVENTS_URL =
  'https://gamma-api.polymarket.com/events?tag_slug=highest-temperature&active=true&closed=false&archived=false&limit=200'
const DEFAULT_THRESHOLD = 30
const BLOCKED_CITIES = new Set(['Jinan', 'Zhengzhou'])

type RawMarket = {
  question: string
  outcomes: string
  outcomePrices: string
}

type RawEvent = {
  active: boolean
  archived: boolean
  closed: boolean
  endDate: string
  markets: RawMarket[]
  slug: string
  title: string
  volume24hr?: number
}

const MONTH_MAP: Record<string, number> = {
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

const CITY_NAME_MAP: Record<string, string> = {
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
  Houston: '休斯敦',
  Istanbul: '伊斯坦布尔',
  Jeddah: '吉达',
  Jinan: '济南',
  Karachi: '卡拉奇',
  'Kuala Lumpur': '吉隆坡',
  London: '伦敦',
  'Los Angeles': '洛杉矶',
  Lucknow: '勒克瑙',
  Madrid: '马德里',
  Manila: '马尼拉',
  'Mexico City': '墨西哥城',
  Miami: '迈阿密',
  Milan: '米兰',
  Moscow: '莫斯科',
  Munich: '慕尼黑',
  NYC: '纽约',
  'Panama City': '巴拿马城',
  Paris: '巴黎',
  Qingdao: '青岛',
  'San Francisco': '旧金山',
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
  Zhengzhou: '郑州',
}

function clampThreshold(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_THRESHOLD
  }

  return Math.max(0, Math.min(100, value))
}

function roundProbability(value: number) {
  return Math.round(value * 1000) / 10
}

function parseJsonArray(value: string) {
  try {
    return JSON.parse(value) as string[]
  } catch {
    return []
  }
}

function extractCity(title: string) {
  const match = title.match(/^Highest temperature in (.+) on /i)
  return match?.[1] ?? title
}

function translateCity(city: string) {
  return CITY_NAME_MAP[city] ?? city
}

function extractMarketDateLabel(title: string, fallbackDate: string) {
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

function extractLabel(question: string) {
  const match = question.match(/ be (.+) on /i)
  return match?.[1] ?? question
}

function extractYesProbability(market: RawMarket) {
  const outcomes = parseJsonArray(market.outcomes)
  const prices = parseJsonArray(market.outcomePrices)
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'yes')

  if (yesIndex === -1) {
    return 0
  }

  const rawValue = Number(prices[yesIndex] ?? 0)
  return Number.isFinite(rawValue) ? rawValue : 0
}

function isHighestTemperatureEvent(event: RawEvent) {
  const city = extractCity(event.title)

  return (
    event.active &&
    !event.closed &&
    !event.archived &&
    event.title.toLowerCase().startsWith('highest temperature in ') &&
    !BLOCKED_CITIES.has(city)
  )
}

function toCityMarket(event: RawEvent, threshold: number): CityMarket | null {
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

export async function fetchMarkets(threshold = DEFAULT_THRESHOLD): Promise<MarketsResponse> {
  const response = await fetch(GAMMA_EVENTS_URL, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`)
  }

  const rawEvents = (await response.json()) as RawEvent[]
  const events = rawEvents.filter(isHighestTemperatureEvent)
  const safeThreshold = clampThreshold(threshold)

  const cities = events
    .map((event) => toCityMarket(event, safeThreshold))
    .filter((city): city is CityMarket => Boolean(city))
    .sort((left, right) => left.topOptionProbability - right.topOptionProbability)

  return {
    cities,
    filteredCities: cities.filter((city) => city.trigger),
    generatedAt: new Date().toISOString(),
    sourceCount: events.length,
    threshold: safeThreshold,
  }
}
