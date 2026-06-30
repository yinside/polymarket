import { useEffect, useState } from 'react'
import type { CityMarket, MarketsResponse } from './types'
import { fetchMarkets } from './lib/polymarket'
import './App.css'

const REFRESH_INTERVAL_MS = 60_000

function formatVolume(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    notation: value >= 100_000 ? 'compact' : 'standard',
  }).format(value)
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function getSignalTone(city: CityMarket) {
  if (city.topOptionProbability < 30) {
    return 'critical'
  }

  if (city.topOptionProbability < 45) {
    return 'strong'
  }

  return 'watch'
}

function App() {
  const [data, setData] = useState<MarketsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const visibleOpportunityCities = data?.cities.filter((city) => city.topOptionProbability < 30) ?? []
  const matrixCities = data?.cities.filter((city) => city.topOptionProbability >= 30) ?? []
  const spotlightCities = visibleOpportunityCities.slice(0, 4)

  useEffect(() => {
    let cancelled = false

    const load = async (isBackgroundRefresh = false) => {
      if (isBackgroundRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const payload = await fetchMarkets()

        if (!cancelled) {
          setData(payload)
          setError(null)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : '未知错误')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    void load(false)

    const timer = window.setInterval(() => {
      void load(true)
    }, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshTick])

  return (
    <main className="app-shell">
      {error ? (
        <section className="error-panel">
          <strong>接口暂时没拉到数据</strong>
          <p>{error}</p>
        </section>
      ) : null}

      <section className="opportunity-panel">
        <div className="hero-band">
          <div className="hero-copy">
            <p className="panel-label">高温机会看板</p>
            <h1>先看最分散的城市，再扫全市场。</h1>
            <p className="section-note">
              低于 30% 的城市会被放进机会区，下面的市场矩阵则继续按最高温度概率从低到高展开。
            </p>
          </div>

          <div className="hero-stats">
            <article className="metric-card danger">
              <span>机会城市</span>
              <strong>{loading ? '--' : visibleOpportunityCities.length}</strong>
            </article>
            <article className="metric-card">
              <span>活跃市场</span>
              <strong>{loading ? '--' : data?.sourceCount ?? '--'}</strong>
            </article>
            <article className="metric-card">
              <span>最近刷新</span>
              <strong>{data ? formatGeneratedAt(data.generatedAt) : '--'}</strong>
            </article>
          </div>
        </div>

        <div className="status-bar">
          <span>{loading ? '正在抓取 Polymarket 实时数据...' : '按最高温度概率从低到高排序'}</span>
          <span>{data ? `机会阈值 30% · 来源事件 ${data.sourceCount} 个` : '等待数据'}</span>
          <button
            type="button"
            className="refresh-button"
            onClick={() => {
              setRefreshTick((current) => current + 1)
            }}
            disabled={loading || refreshing}
          >
            {refreshing ? '刷新中...' : '立即刷新'}
          </button>
        </div>

        <div className="spotlight-strip">
          <div className="strip-head">
            <div>
              <p className="panel-label">机会聚焦</p>
              <h2>最值得先看的 4 个城市</h2>
            </div>
            <p className="section-note">这些城市当前最可能温度档的概率最低，市场分歧最大。</p>
          </div>

          <div className="spotlight-grid">
            {loading ? (
              <div className="empty-state">正在计算机会城市...</div>
            ) : spotlightCities.length ? (
              spotlightCities.map((city, index) => (
                <article key={city.slug} className={`spotlight-card ${getSignalTone(city)}`}>
                  <div className="spotlight-rank">#{index + 1}</div>
                  <div className="spotlight-head">
                    <div>
                      <p>{city.cityZh}</p>
                      <strong>{city.topOptionProbability}%</strong>
                    </div>
                    <a href={city.marketUrl} target="_blank" rel="noreferrer">
                      查看市场
                    </a>
                  </div>

                  <p className="spotlight-detail">{`最高温度档 ${city.topOption.label}`}</p>
                  <div className="spotlight-meta">
                    <span>{city.marketDateLabel}</span>
                    <span>{`24h Vol ${formatVolume(city.volume24hr)}`}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">当前没有低于 30% 的机会城市。</div>
            )}
          </div>
        </div>

        <div className="strip-head market-head">
          <div>
            <p className="panel-label">市场矩阵</p>
            <h2>30% 以上城市快速扫盘</h2>
          </div>
          <p className="section-note">机会城市已经放在上面，这里只保留最高温度概率在 30% 以上的城市。</p>
        </div>

        <div className="mini-cards-grid merged-grid">
          {loading ? (
            <div className="empty-state">正在计算高温分布...</div>
          ) : matrixCities.length ? (
            matrixCities.map((city) => (
              <article
                key={city.slug}
                className={`mini-city-card ${city.trigger ? 'active' : ''} ${getSignalTone(city)}`}
              >
                <div className="mini-city-head">
                  <span className="city-name">
                    {city.cityZh}
                    {city.trigger ? <b>机会</b> : null}
                  </span>
                  <strong className="sum-cell">{city.topOptionProbability}%</strong>
                </div>

                <p className="mini-option-list">
                  {`最高温度档 ${city.topOption.label}`}
                </p>

                <div className="mini-chip-row">
                  <span className="mini-chip">{`概率 ${city.topOption.probability}%`}</span>
                  <span className="mini-chip">{city.marketDateLabel}</span>
                </div>

                <div className="mini-city-footer">
                  <span>{`24h Vol ${formatVolume(city.volume24hr)}`}</span>
                  <a href={city.marketUrl} target="_blank" rel="noreferrer">
                    查看
                  </a>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">当前没有高于 30% 的市场矩阵城市。</div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
