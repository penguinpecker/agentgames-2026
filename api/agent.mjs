import { handle } from '../src/handler.mjs';
import { handlers } from '../src/handlers.mjs';

export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const r = await handle(raw, request.headers.get('x-agent-games-signature'), {
    secret: process.env.AGENT_GAMES_HMAC_SECRET,
    handlers,
  });
  return new Response(r.body, { status: r.status, headers: r.headers });
}

export function HEAD(request) {
  console.log(JSON.stringify({ at: 'health', method: 'HEAD', ua: request.headers.get('user-agent') }));
  return new Response(null, { status: 200 });
}

export function GET(request) {
  console.log(JSON.stringify({ at: 'health', method: 'GET', ua: request.headers.get('user-agent') }));
  return Response.json({ ok: true, protocolVersion: 'v1', configured: Boolean(process.env.AGENT_GAMES_HMAC_SECRET) });
}
