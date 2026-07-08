# YapStage

1v1 video debates with an AI judge. Create a private lobby, send a friend the code, get dealt a topic and a side, debate in timed turns with automatic mic muting — and the judge crowns the YapMaster.

## Dev

```sh
npm install

# terminal 1 — server on :3000
npm run dev:server

# terminal 2 — client on :5173 (proxies /socket.io to :3000)
npm run dev:client
```

Open http://localhost:5173 in two Chrome tabs to play against yourself.

Copy `.env.example` to `.env` for local config. Set `DEBATE_SPEED=fast` for ~30-second test debates.

## Production build

```sh
npm run build   # builds client, then server
npm start       # serves everything from :3000 (or $PORT)
```

Deployed on Railway; the Fastify server serves the built client, so there is exactly one service.

Env vars in production: `ANTHROPIC_API_KEY`, `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
