import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { groth16 } from 'snarkjs';
import { handle } from '../src/handler.mjs';
import { handlers } from '../src/handlers.mjs';

// Pins the exact signed Gatekeeper JSON the platform receives, per reason code.
const secret = 'test-only-hmac-secret-never-use-in-a-deployment';
const vkey = JSON.parse(readFileSync(new URL('../artifacts/gatekeeper.vkey.json', import.meta.url)));
const h = (n, b) => `0x${BigInt(n).toString(16).padStart(b * 2, '0')}`;
const sig = b => createHmac('sha256', secret).update(b).digest('hex');
const base = { registered_vk: '0x1c6b84', proof_vk: '0x1c6b84', minimum: '1000', public_balance: '1460',
  expiry_block: 8_430_000, current_block: 8_420_000, recipient: h(456, 20), condition_recipient: h(456, 20), amount: '500', max_transfer: '1000' };

const send = async (task_id, input) => {
  const raw = Buffer.from(JSON.stringify({ type: 'agent-games.proof-gatekeeper.v1', task_id, mode: 'practice',
    issued_at: new Date().toISOString(), deadline_at: new Date(Date.now() + 60_000).toISOString(), input }));
  const r = await handle(raw, sig(raw), { secret, handlers, log: () => {} });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-agent-games-signature'], sig(r.body));
  return JSON.parse(r.body);
};

[
  ['VALID_PROOF', {}, 'APPROVE'], ['VK_SUBSTITUTION', { proof_vk: '0xa4c1b8' }, 'REJECT'],
  ['THRESHOLD_MISMATCH', { public_balance: '999' }, 'REJECT'], ['EXPIRED_CONDITION', { current_block: 8_430_000 }, 'REJECT'],
  ['RECIPIENT_MISMATCH', { recipient: h(457, 20) }, 'REJECT'], ['AMOUNT_OVERFLOW', { amount: '1001' }, 'REJECT'],
].forEach(([code, patch, decision], i) => test(`gatekeeper ${code}: exact signed reply with a verifying proof`, async () => {
  const proof_tx = h(7919n * BigInt(i + 1), 32);
  const reply = await send(`gk_reply_${i}`, { ...base, ...patch, proof_tx });
  assert.deepEqual(Object.keys(reply).sort(), ['decision', 'proof', 'proof_tx', 'public_signals', 'reason_code']);
  assert.equal(reply.decision, decision);
  assert.equal(reply.reason_code, code);
  assert.equal(reply.proof_tx, proof_tx);
  assert.equal(reply.public_signals.length, 13);
  assert.equal(reply.public_signals[11], decision === 'APPROVE' ? '1' : '0');
  assert.ok(await groth16.verify(vkey, reply.public_signals, reply.proof));
}));

// An APPROVE must be remembered, a platform retry of the same task must still approve,
// and the next round's reuse of that proof_tx must get exactly { REJECT, PROOF_REUSED } (17 Nov R04).
test('approved proof_tx is remembered: retry approves, a later task reusing it is PROOF_REUSED', async () => {
  const input = { ...base, proof_tx: h(0xfeedn, 32) };
  assert.equal((await send('gk_first', input)).decision, 'APPROVE');
  const retry = await send('gk_first', input);
  assert.equal(retry.decision, 'APPROVE');
  assert.ok(retry.proof && retry.public_signals);
  assert.deepEqual(await send('gk_trap', { ...input, proof_tx: input.proof_tx.toUpperCase().replace('0X', '0x') }),
    { decision: 'REJECT', reason_code: 'PROOF_REUSED' });
});

test.after(() => globalThis.curve_bn128?.terminate());
