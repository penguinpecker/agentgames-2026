import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { groth16 } from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import { keccak256, concat, numberToHex } from 'viem';

// Throwaway strategy, never the real one. Pins the exact signed turn reply the platform scores.
const params = [10n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], salt = 12345n;
const poseidon = await buildPoseidon();
const commitment = poseidon.F.toObject(poseidon([...params, salt]));
Object.assign(process.env, { STRATEGY_PARAMS: params.join(','), STRATEGY_SALT: String(salt) });
delete process.env.STRATEGY_COMMITMENT;
const { handle } = await import('../src/handler.mjs');
const { handlers } = await import('../src/handlers.mjs');
const secret = 'test-only-hmac-secret-never-use-in-a-deployment';
const vkey = JSON.parse(readFileSync(new URL('../artifacts/vfy-policy.vkey.json', import.meta.url)));
const matchId = '9f4e1b2a-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sig = b => createHmac('sha256', secret).update(b).digest('hex');

const turn = async (n, selfBalance, opponentBalance, hash = commitment) => {
  const raw = Buffer.from(JSON.stringify({ protocolVersion: 'v1', eventId: 'steal-the-vfy', mode: 'competition', matchId, turn: n,
    issuedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 30_000).toISOString(),
    state: { selfBalance, opponentBalance, selfFortifiedUntilTurn: null, opponentFortifiedUntilTurn: null },
    strategyCommitment: { hash: numberToHex(hash, { size: 32 }) }, resolverVersion: 'v1', nonce: 'n' }));
  const r = await handle(raw, sig(raw), { secret, handlers, log: () => {} });
  assert.equal(r.headers['x-agent-games-signature'], sig(r.body));
  return r;
};
const words = (n, s, o, a, amt) => [commitment, BigInt(`0x${matchId.replace(/-/g, '')}`), n, s, o, a, amt, 1n].map(BigInt);

for (const [name, n, s, o, a, amt, wire] of [
  ['EXTRACT', 3, 95n, 105n, 2n, 10n, { type: 'EXTRACT', amount: 10 }],
  ['HOLD (opponent at 0)', 4, 200n, 0n, 0n, 0n, { type: 'HOLD' }],
]) test(`steal ${name}: exact body, proof + public_signals INSIDE policyProof`, async () => {
  const res = await turn(n, String(s), String(o));
  assert.equal(res.status, 200);
  const r = JSON.parse(res.body);
  assert.deepEqual(Object.keys(r).sort(), ['action', 'agentTimestamp', 'idempotencyKey', 'matchId', 'policyProof', 'protocolVersion', 'turn']);
  assert.equal(r.matchId, matchId); assert.equal(r.turn, n);
  assert.deepEqual(r.action, wire);
  assert.match(r.idempotencyKey, UUID);
  assert.deepEqual(Object.keys(r.policyProof).sort(), ['circuitVersion', 'proof', 'publicInputsHash', 'public_signals']);
  assert.equal(r.policyProof.circuitVersion, 'v1');
  const w = words(n, s, o, a, amt);
  assert.equal(r.policyProof.public_signals.length, 9);
  assert.deepEqual(r.policyProof.public_signals.slice(1), w.map(String));
  assert.equal(r.policyProof.publicInputsHash, keccak256(concat(w.map(v => numberToHex(v, { size: 32 })))));
  assert.ok(await groth16.verify(vkey, r.policyProof.public_signals, r.policyProof.proof));
});

test('steal retry returns the identical body', async () => {
  assert.equal((await turn(3, '95', '105')).body, (await turn(3, '95', '105')).body);
});

// A proofless HOLD is accepted and final (-2); a 5xx is a missed push (-1) that the platform re-sends.
test('steal turn that cannot be proved returns a signed 503, never a proofless HOLD', async () => {
  const r = await turn(5, '95', '105', commitment + 1n);
  assert.equal(r.status, 503);
});

test.after(() => globalThis.curve_bn128?.terminate());
