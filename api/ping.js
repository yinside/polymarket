export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
  })
}
