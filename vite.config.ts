import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { getMarketsResponse } from './server/polymarket'

type NextFunction = () => void

function polymarketApi(): Plugin {
  const handler = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: NextFunction,
  ) => {
    if (!request.url?.startsWith('/api/markets')) {
      next()
      return
    }

    try {
      const url = new URL(request.url, 'http://localhost')
      const threshold = Number(url.searchParams.get('threshold') ?? 70)
      const payload = await getMarketsResponse(threshold)

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

  return {
    name: 'polymarket-api',
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
    configureServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), polymarketApi()],
})
