# Crypsis

Сайт и приложение crypsis.fun: зашифрованные переводы для монет pump.fun на базе Helius Solana Privacy Rings.
Бриф, план и внутренние документы (`CRYPSIS-BRIEF.md`, `crypsis-brief/`, `docs/`) хранятся у владельца и в репозиторий не входят.

> Жёсткие правила: никаких mainnet-транзакций и трат без явного разрешения владельца; секреты только в `.env*` (в git — только `.env.example`); Crypsis не проходил аудит, и нигде не утверждается обратное.

## Структура

```
apps/web/                    Next.js 16 (App Router, Cache Components), деплой Vercel (Root Directory = apps/web)
  app/(site)/                лендинг S1–S9, /privacy-model, /terms, /privacy
  app/(app)/app/*            приложение: balance, deposit, send, withdraw, activate (nonce-CSP, динамический рендер)
  app/(app)/launch           запуск монеты на pump.fun
  app/(app)/tracker, coin/   трекер и страница монеты (+ OG)
  app/api/                   slot, coins, coins/[mint], ipfs, launches, webhooks/helius, cron/snapshot
  app/dev/                   ring-worker (самопроверка SDK), wallet-check (матрица кошельков)
  lib/ascii/                 порт kit/ascii/src/crypsis-ascii.mjs 1:1 + golden-тест
  lib/ring/                  ring.worker.ts — единственное место SDK в браузере; protocol, errors, IndexedDB-снапшот
  lib/pump/                  сборка Tx1/Tx2, адаптер web3.js ⇄ kit
  lib/solana/                Wallet Standard
  lib/indexer/               парсер событий Ring, реестр, метаданные, снапшоты, бэкфилл
  lib/tracker/               запросы трекера
  scripts/                   backfill, snapshot, reconcile, launch-simulate, check-coin
  tests/e2e/                 Playwright (тестовый Wallet Standard кошелёк в tests/e2e/test-wallet.ts)
packages/db/                 Drizzle-схема (coins, ring_events, snapshots, launches, indexer_state) + миграции
scripts/spike/               фаза 0: mainnet read-only симуляции, devnet-цикл SDK
docs/, crypsis-brief/        только локально (в .gitignore): отчёты, решения владельца, чек-лист, бриф и kit
```

## Быстрый старт

```bash
pnpm install
cp .env.example apps/web/.env.local     # заполнить; см. ниже
pnpm db:migrate                          # DATABASE_URL в окружении
pnpm dev                                 # http://localhost:3000
```

Разработка идёт сразу на mainnet (решение владельца 25.11.2026, devnet не используем; devnet остаётся только в CI-тестах). Минимум для локальной разработки: `DATABASE_URL`, `NEXT_PUBLIC_SOLANA_NETWORK=mainnet`, `NEXT_PUBLIC_HELIUS_RPC_URL`. Без Helius-ключа работают лендинг и трекер. Приложению ключ нужен: публичный RPC отвечает браузеру 403, а indexer и prover Ring доступны только через шлюз Helius `/v1/spr`.

### Переменные

| Переменная | Где | Зачем |
|---|---|---|
| `APP_LIVE` (или `NEXT_PUBLIC_APP_LIVE`) | сборка | `false` = «Launch soon». Приложение и Launch на mainnet недоступны, на devnet работают |
| `NEXT_PUBLIC_SOLANA_NETWORK` | клиент | `devnet` / `mainnet` |
| `NEXT_PUBLIC_HELIUS_RPC_URL`, `_WS_URL` | клиент | браузерный Helius-ключ **с ограничением по домену** |
| `SITE_ACCESS_KEY` | сервер | закрытый показ: ключ для входа на сайт (16+ символов). На Vercel без ключа сайт закрыт для всех |
| `SITE_PUBLIC` | сервер | `true` открывает сайт для всех (снимает вход по ключу) |
| `NEXT_PUBLIC_HELIUS_API_KEY` | клиент | необязательно: ключ для Ring indexer/prover. По умолчанию берётся `api-key` из `NEXT_PUBLIC_HELIUS_RPC_URL`. Без ключа indexer и prover отвечают 403 |
| `NEXT_PUBLIC_SPR_INDEXER_URL`, `_PROVER_URL` | клиент | Ring indexer/prover той же сети (по умолчанию — адреса из README SDK) |
| `HELIUS_API_KEY` | сервер | RPC для крона, вебхука, `/api/slot`, `/api/launches` |
| `HELIUS_WEBHOOK_SECRET` | сервер | authHeader вебхука Helius (сравнение за константное время) |
| `CRON_SECRET` | сервер | Vercel Cron шлёт `Authorization: Bearer …` |
| `DATABASE_URL` | сервер | Postgres (Neon/Supabase) |
| `PINATA_JWT` | сервер | загрузка метаданных Launch (pump.fun/api/ipfs не работает) |

## Команды

```bash
pnpm --filter web test          # unit: golden ASCII, парсер на реальных mainnet-транзакциях, ошибки, суммы, копирайт
pnpm --filter web typecheck && pnpm --filter web lint
pnpm --filter web build && pnpm e2e   # Playwright: лендинг, hero, трекер, приложение, launch, CSP, a11y
E2E_DEVNET=1 pnpm e2e           # полный devnet-цикл (нужны Helius devnet + devnet SOL на .secrets/*)

pnpm tracker:backfill           # реестр -> монеты, события с 10.11.2026, снапшот (read-only)
pnpm --filter web tracker:snapshot
pnpm --filter web tracker:reconcile   # приёмка §13: vault == Σdeposit − Σwithdraw
pnpm launch:simulate            # mainnet read-only симуляция Tx1/Tx2 (sigVerify:false)
pnpm --filter @crypsis/scripts spike:simulate   # фаза 0: R3 (createSplInterface + v1-депозит на живых монетах)
pnpm --filter @crypsis/scripts spike:devnet     # фаза 0: полный цикл SDK на devnet (Helius devnet + SOL)
```

## Деплой (Vercel)

1. Новый проект → Root Directory `apps/web`, Install `pnpm install`, Build `pnpm build`.
2. Переменные окружения из таблицы, `NEXT_PUBLIC_SOLANA_NETWORK=mainnet`.
3. `apps/web/vercel.json` уже содержит крон `*/5 * * * *` → `/api/cron/snapshot`.
4. База: `DATABASE_URL=… pnpm db:migrate`, затем `pnpm tracker:backfill` (с `HELIUS_API_KEY`).
5. Helius → Webhooks: тип **raw**, адрес `ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW`, URL `https://crypsis.fun/api/webhooks/helius`, authHeader = `HELIUS_WEBHOOK_SECRET`. Без вебхука крон всё равно догоняет события раз в 5 минут.
6. Запуск: по локальному чек-листу владельца. `APP_LIVE=true` переключает владелец.

## Ключевые решения

- **Приватные данные только в браузере.** Подпись-деривация уходит в Web Worker как transferred-буфер и обнуляется; ключи и UTXO живут в памяти воркера; Lock = `worker.terminate()`; снапшот в IndexedDB запечатан AES-256-GCM SDK. Сервер видит только публичные ончейн-данные (e2e проверяет, что в запросах к нашему API нет адреса кошелька).
- **Mode A / Mode B** (бриф §4). A — кошелёк подписывает v1-транзакции; B — vault-ключ HKDF(подпись `crypsis.fun/vault/v1`), один seed для Solana-подписанта и ShieldedKeypair. Режим выбирается по `supportedTransactionVersions` кошелька; первая разблокировка просит две подписи и сравнивает их.
- **v1 wire-формат**: `message || signatures` (а не `shortvec || signatures || message`). Воркер собирает подписанную транзакцию из подписей кошелька и отказывается отправлять, если кошелёк изменил сообщение.
- **Трекер** считает события по изменению баланса vault (owner = CPI-authority Ring) — не зависит от формата инструкций alpha-SDK.
- **Launch**: `create_v2` + `buy_v2` (~33 аккаунта) не влезает в 1232 байта без lookup table, поэтому Tx1 = `create_v2` + legacy SOL-quoted buy (pump-sdk `createV2AndBuyInstructions`, 1206–1230 байт, проверено mainnet-симуляцией); если не влезает — buy автоматически уходит второй транзакцией. Мемо `crypsis.fun/launch/v1 <mint>` — в Tx2, подписано создателем; сервер ставит «Launched on Crypsis» только после проверки ончейн.
- **CSP**: `/app`, `/launch`, `/dev` — nonce + `strict-dynamic` (динамический рендер); статические страницы — статический CSP. `img-src` — только IPFS-гейтвей.
