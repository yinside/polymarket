import type { IncomingMessage, ServerResponse } from 'node:http'
import { getMarketsResponse } from '../server/polymarket'

function readThreshold(url: string | undefined) {
  const requestUrl = new URL(url ?? '/api/markets', 'http://localhost')
  return Number(requestUrl.searchParams.get('threshold') ?? 30)
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
) {
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
