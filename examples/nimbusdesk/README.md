# NimbusDesk (fictional Catlex fixture)

Tiny SaaS used to exercise **custom Catlex config files** and **translation guidance** from [PR #49](https://github.com/Hammertail/catlex/pull/49).

Two sibling projects share the same English copy and planted Portuguese mistakes, but they load **opposite glossaries**:

| Project | Config file | Messages dir | Distinctive Portuguese terms |
|---------|-------------|--------------|------------------------------|
| `examples/nimbusdesk` | `catlex.config.json` | `messages/` | Keep `NimbusDesk` / `HaloSync`; `Save` → `Guardar`; `workspace` → `espaço de trabalho`; `Billing cycle` → `ciclo de faturação` |
| `examples/nimbusdesk-alt` | `catlex.config.js` | `locales/` | `NimbusDesk` → `NimbusEscritório`; `HaloSync` → `HaloSinc`; `Save` → `Gravar`; `workspace` → `ambiente de trabalho`; `Billing cycle` → `período de cobrança` |

If `--cwd` actually loads the project config, a live `catlex translate --yes` on the two trees must not produce the same `Save` / brand strings.

`catlex.config.custom.json` is an extra file **Catlex will never discover**. There is no `--config <path>` flag; discovery only accepts the four fixed names under `--cwd`.

## Dictionaries

`en.json` is complete. `pt.json` / `es.json` (nimbusdesk) and `locales/pt.json` (alt) already contain **wrong** house terms so `translate review` has something to reject, and they **omit** keys so `translate` has missing strings to fill.

Planted errors (must be flagged when the nimbusdesk glossary is in the prompt):

- `brand.product`: `Mesa Nimbus` (must stay `NimbusDesk`)
- `brand.sync`: `Halo Sincronização` (must stay `HaloSync`)
- `nav.workspace`: `área de trabalho` (must be `espaço de trabalho`)
- `actions.save`: `Salvar` (must be `Guardar`)

Missing in the target locales: `nav.inbox`, `actions.openWorkspace`, `billing.cycle`, `billing.greeting`.

## Run from the Catlex repo

Live checks need `OPENAI_API_KEY` in the environment (the runner never prints it).

```bash
bun examples/nimbusdesk/run-live-config-checks.ts
```

Manual one-offs:

```bash
bun src/bin/catlex.ts translate --cwd examples/nimbusdesk --dry-run --json --locale pt
bun src/bin/catlex.ts translate --cwd examples/nimbusdesk --yes --json --locale pt --concurrency 1
bun src/bin/catlex.ts translate --cwd examples/nimbusdesk-alt --yes --json --locale pt --concurrency 1
bun src/bin/catlex.ts translate --cwd examples/nimbusdesk --no-config --guidance-file examples/nimbusdesk/glossary.md --yes --json --locale pt
bun src/bin/catlex.ts translate review --cwd examples/nimbusdesk --json --locale pt --concurrency 1
```

`--guidance-file` is resolved relative to `--cwd`, so the last `--guidance-file` example only works if you pass a path that exists **inside** `examples/nimbusdesk` (for example `--guidance-file glossary.md` together with `--cwd examples/nimbusdesk`).

Do not pass `--guidance` and `--guidance-file` together; that is a hard error.
