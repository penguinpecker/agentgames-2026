# Agent Games 2026 agent

One HTTPS agent for zkVerify Agent Games **Steal the VFY** and **Proof Gatekeeper**.
Live at `https://agentgames-2026.vercel.app/agent` (Vercel function `api/agent.mjs`).

- `src/handler.mjs`: HMAC check on the raw body, replay window, routing, signed replies.
- `src/steal.mjs` + `src/policy.mjs`: deterministic policy matching the official `vfy-policy` circuit, Groth16 proof, `publicInputsHash`, UUIDv5 idempotency key.
- `src/gatekeeper-task.mjs`: trap checks (`src/gatekeeper.mjs`), official `gatekeeper` circuit proof, durable proof_tx seen-set (`src/seen.mjs`, Vercel Blob).

## Environment (Vercel production)

| var | source |
|---|---|
| `AGENT_GAMES_HMAC_SECRET` | dashboard Rotate Secret, pasted into Vercel by the owner |
| `STRATEGY_PARAMS`, `STRATEGY_SALT`, `STRATEGY_COMMITMENT` | `node scripts/strategy-setup.mjs 10,0,0,0,0,0,0,0 --push` (salt never printed; local copy `.env.strategy`) |
| `BLOB_READ_WRITE_TOKEN` | Blob store `agentgames-seen` |
| `GK_TASKID_ENCODING` | optional: `keccakModP` (default), `keccakShr8`, `utf8BigEndian`, `uuidTail`, `hexDigits` |

## Run

Circuit artifacts are the organizer's files; fetch them into `artifacts/` first (URLs from `https://agentgames.zkverify.io/api/circuit-info`):

```sh
for f in gatekeeper.wasm gatekeeper_final.zkey vfy-policy.wasm vfy-policy_final.zkey; do curl -fsSo artifacts/$f https://agentgames.zkverify.io/circuits/$f; done
for c in gatekeeper vfy-policy; do npx snarkjs zkey export verificationkey artifacts/${c}_final.zkey artifacts/$c.vkey.json; done
npm ci
npm test            # transport, policy, gatekeeper proofs
npm run proofs      # official-circuit local verification report
vercel deploy --prod --yes
```

Order that avoids the platform's secret-decrypt trap: rotate secret → set env → redeploy → preflight → save the strategy commitment.
