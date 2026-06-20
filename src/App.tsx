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
        <div className="section-head">
          <div>
            <p className="panel-label">机会城市 + 最新检测</p>
            <h2>按最高温度概率从低到高浏览</h2>
          </div>
          <p className="section-note">低于 30% 的城市会优先高亮，方便你在同一屏里直接扫盘。</p>
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

        <div className="mini-cards-grid merged-grid">
          {loading ? (
            <div className="empty-state">正在计算高温分布...</div>
          ) : data?.cities.length ? (
            data.cities.map((city) => (
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
                  {`最高温度档 ${city.topOption.label} / 概率 ${city.topOption.probability}%`}
                </p>

                <div className="mini-city-footer">
                  <span>{`${city.marketDateLabel} · 24h Vol ${formatVolume(city.volume24hr)}`}</span>
                  <a href={city.marketUrl} target="_blank" rel="noreferrer">
                    查看
                  </a>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">当前没有可展示的高温市场。</div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
