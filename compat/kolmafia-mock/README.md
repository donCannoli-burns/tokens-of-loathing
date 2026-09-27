# kolmafia-mock compatibility

This compatibility surface exists to migrate
`loathers/kolmafia-mock@5c53bf4a5ee64d84710e7788409862bd8d2a1661`
away from the retired data-of-loathing v2 GraphQL service.

## Design

The normal data-of-loathing client remains unchanged.

A new Node-only export is provided:

```ts
import { createKolmafiaMockLegacyData } from "data-of-loathing/legacy-mock";
```

It loads the current SQLite-backed database and projects five entity families
back into the narrow legacy object consumed by the pinned mock:

- items + consumables
- ascension classes
- paths
- skills
- familiars

No `/graphql` endpoint is recreated.

## Verification

`verify.sh` performs both layers:

1. runs the client package's deterministic unit tests;
2. builds and packs this fork's client package;
3. clones the exact pinned upstream kolmafia-mock revision;
4. replaces only upstream `src/data.ts` with `data.ts` from this directory;
5. points its `data-of-loathing` dependency at the locally packed client;
6. downloads one SQLite snapshot and exposes its local path to every Vitest worker;
7. runs the original upstream Vitest suite unchanged.

Using one local snapshot is intentional: Vitest runs test files in parallel. Letting every worker use the default URL/cache strategy can race while refreshing the shared cache, producing transient errors such as `TableNotFoundException: no such table: items`. The compatibility verifier removes that race without serializing or altering the upstream tests.

Success is:

```text
Test Files  7 passed (7)
KOLMAFIA_MOCK_COMPAT=PASS
```

This compatibility layer contains no live KoLmafia credentials, settings,
sessions, cookies, or password hashes.


## Consumer integration: kol-agent-sandbox

The verified downstream consumer is
[`donCannoli-burns/kol-agent-sandbox`](https://github.com/donCannoli-burns/kol-agent-sandbox).

That project owns sandbox isolation, live-vs-sandbox boundaries, read-only
mirrors, and agent workflow. This repository owns the data compatibility
boundary needed to make the pinned upstream `kolmafia-mock` run against the
current SQLite-backed client.

For downstream consumers, use:

```bash
bash compat/kolmafia-mock/materialize.sh --mock-dir /path/to/kolmafia-mock
```

The materializer:

1. prepares the exact pinned upstream mock checkout;
2. builds and packs this client;
3. applies the narrow legacy data overlay;
4. stores a local SQLite snapshot with the mock;
5. runs the original upstream seven-test suite unchanged;
6. writes `.kolmafia-mock-compat/compat-manifest.json`.

`kol-agent-sandbox` pins a verified commit of this repository and calls this
entrypoint during its host bootstrap. A compatibility PASS provides mock/test
evidence only; it does not grant authority for live KoLmafia actions.
