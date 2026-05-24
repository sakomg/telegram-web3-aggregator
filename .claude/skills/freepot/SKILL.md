---
name: freepot
description: >-
  Work on the freepot TON project: no-loss lottery (PoolTogether-style),
  LotteryPool Tact contract, Sandbox tests, stateless keeper bot (on-chain
  randomness via nativeRandomizeLt). Use for deposits/withdrawals, draws, yield integration,
  gas limits, or deployment. See README.md for the full spec.
---

# freepot (project skill)

## What this app is

**freepot** is a **no-loss lottery** on TON, similar in spirit to PoolTogether: users deposit TON as **principal** (tracked on-chain, withdrawable). **Yield** and other **plain TON** sent by the **keeper** accumulate in a **prize pool** and are periodically **raffled** to one **weighted random winner** (weight = deposited balance). Losers keep their principal; the winner receives the accumulated prize. One primary smart contract, minimal external dependencies.

## Authority and roles

| Role | Responsibility |
|------|------------------|
| **Users** | `Deposit` / `Withdraw` (anyone with balance). |
| **Keeper** | `LockDeposits`, `Draw`, `OpenDeposits`, and **only** address whose **empty-body** transfers credit `prizePool` (yield top-up path). |
| **Owner** | Set at `init`; fee config; emergency drain. |

## Non-negotiable engineering rules

1. **Gas test at 500 participants** — Before treating the keeper or mainnet as final, run the Sandbox test that runs `Draw` with **500** funded entries and asserts **success (no out-of-gas)**. The contract enforces **MAX_PARTICIPANTS = 500** because winner selection iterates the balance map.
2. **Yield path** — Weekly (or other) profit from an **arb bot** should reach the pool as a **plain TON transfer** to the contract from the **keeper** wallet; the contract’s **empty `receive()`** credits `prizePool` **only** when `sender() == keeper`.

## Code map

| Path | Purpose |
|------|---------|
| `contracts/lottery_pool.tact` | `LotteryPool`: storage, handlers, getters. |
| `tests/LotteryPool.spec.ts` | Sandbox tests including **500-entry gas/cap** scenario. |
| `scripts/deployLotteryPool.ts` | Blueprint deploy; `KEEPER_ADDRESS` optional in env. |
| `build/LotteryPool/` | Generated wrappers (import from tests / keeper). |
| `keeper/` | Node keeper CLI (`commit`, `draw`, `seed-print`, `sync-yield`). |

## Contract surface (high level)

- **Typed messages:** `Deposit`, `Withdraw`, `Draw` (keeper-only single-step).
- **Empty body:** From **keeper** → adds `context().value` to `prizePool`. From others → TON stays on contract but does not increase `prizePool` via that path.
- **Draw:** `nativeRandomizeLt()` + `nativeRandom() % totalDeposited`; weighted walk over `balances` in key order. Requires `prizePool > 0`.

## Preferred implementation order

1. Contract + tests (including **500** draw test).  
2. Keeper + persistence.  
3. Telegram Mini App / TON Connect (can be minimal for first real draw).  

## Deep reference

- **Full architecture, env vars, security notes:** [README.md](../../../README.md)

## Commands (repo root)

- Build: `npx blueprint build LotteryPool`
- Test: `npm test`
- Deploy: `npm run deploy`

Keeper: `cd keeper && npm install` then `npm run lock` / `npm run draw` / `npm run sync-yield` (requires env; see `README.md`).
