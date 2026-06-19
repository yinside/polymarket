import { useEffect, useState } from 'react'
import type { CityMarket, MarketsResponse } from './types'
import './App.css'

const REFRESH_INTERVAL_MS = 60_000

function formatVolume(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    notation: value >= 100_000 ? 'compact' : 'standard',
  }).format(value)
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
  const visibleOpportunityCities =
    data?.filteredCities.filter((city) => city.topOptionProbability < 30) ?? []

  useEffect(() => {
    let cancelled = false

    const load = async (isBackgroundRefresh = false) => {
      if (isBackgroundRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const response = await fetch('/api/markets')

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`)
        }

        const payload = (await response.json()) as MarketsResponse

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
        <div className="section-head">
          <div>
            <p className="panel-label">机会城市</p>
            <h2>最高温度概率低于 30%</h2>
          </div>
          <p className="section-note">这些城市连最可能的那个温度档都不够高，说明市场还比较分散。</p>
        </div>

        <div className="status-bar">
          <span>{loading ? '正在抓取 Polymarket 实时数据...' : `命中 ${visibleOpportunityCities.length} 个城市`}</span>
          <span>{data ? `来源事件 ${data.sourceCount} 个` : '等待数据'}</span>
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

        <div className="cards-grid">
          {loading ? (
            <div className="empty-state">正在计算高温分布...</div>
          ) : visibleOpportunityCities.length ? (
            visibleOpportunityCities.map((city) => (
              <article key={city.slug} className={`city-card ${getSignalTone(city)}`}>
                <div className="city-card-head">
                  <div>
                    <p>{city.cityZh}</p>
                    <strong>{city.topOptionProbability}%</strong>
                  </div>
                  <a href={city.marketUrl} target="_blank" rel="noreferrer">
                    查看市场
                  </a>
                </div>

                <div className="chip-row">
                  <span className="probability-chip">
                    最高档 <b>{city.topOption.label}</b>
                  </span>
                  <span className="probability-chip">
                    概率 <b>{city.topOption.probability}%</b>
                  </span>
                </div>

                <div className="card-meta">
                  <span>市场日期 {city.marketDateLabel}</span>
                  <span>24h Vol {formatVolume(city.volume24hr)}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">当前没有城市的最高温度概率低于 30%。</div>
          )}
        </div>
      </section>

      <section className="table-panel">
        <div className="section-head">
          <div>
            <p className="panel-label">最新检测到的城市</p>
            <h2>按小卡片快速浏览</h2>
          </div>
          <p className="section-note">按“是否命中 + 最高温度概率从低到高”排列，方便快速扫盘。</p>
        </div>

        <div className="mini-cards-grid">
          {loading ? (
            <div className="empty-state">载入中...</div>
          ) : (
            data?.cities.map((city) => (
              <article key={city.slug} className={`mini-city-card ${city.trigger ? 'active' : ''}`}>
                <div className="mini-city-head">
                  <span className="city-name">
                    {city.cityZh}
                    {city.trigger ? <b>Alert</b> : null}
                  </span>
                  <strong className="sum-cell">{city.topOptionProbability}%</strong>
                </div>

                <p className="mini-option-list">
                  {`最高温度档 ${city.topOption.label} / 概率 ${city.topOption.probability}%`}
                </p>

                <div className="mini-city-footer">
                  <span>{city.marketDateLabel}</span>
                  <a href={city.marketUrl} target="_blank" rel="noreferrer">
                    查看
                  </a>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  )
}

export default App
