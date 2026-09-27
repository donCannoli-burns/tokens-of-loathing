# data-of-loathing

This repo contains the infrastructure for serving typed Kingdom of Loathing game data as a queryable SQLite database.

It has four parts:

- `packages/etl` - pulls data from [KoLmafia](https://github.com/kolmafia/kolmafia)'s data files and populates the database, running on a schedule to stay current
- `packages/server` - an Express server that serves the SQLite file with ETag and Range request support
- `packages/client` - a typed TypeScript client for querying the database, published to npm as [data-of-loathing](https://www.npmjs.com/package/data-of-loathing)
- `packages/mcp` - an [MCP](https://modelcontextprotocol.io) server exposing the game data to LLM agents, wrapping the client

The public database is hosted at [data.loathers.net](https://data.loathers.net). The client defaults to this endpoint, so most users only need to install the npm package.

See [packages/client/README.md](packages/client/README.md) for usage documentation.


## KoLmafia mock / agent sandbox integration

This fork carries a verified compatibility bridge for the pinned upstream
`loathers/kolmafia-mock`. The bridge is consumed by
[`donCannoli-burns/kol-agent-sandbox`](https://github.com/donCannoli-burns/kol-agent-sandbox)
during sandbox bootstrap.

Compatibility implementation and verification live under
[`compat/kolmafia-mock/`](compat/kolmafia-mock/README.md). The normal
SQLite-backed client API remains the primary API.
