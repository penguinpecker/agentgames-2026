import { list, put } from '@vercel/blob';

// Durable set of accepted proof_tx references (Gatekeeper PROOF_REUSED trap).
// Pathname seen/<proof_tx>/<task_id> lets one list() answer both "seen before?"
// and "was it this same task?" (a platform retry must not look like a replay).
// ponytail: list+put is not atomic; two different tasks racing on one proof_tx
// within milliseconds could both approve. Tasks arrive one at a time, so fine.
const memory = new Map();
const safe = s => encodeURIComponent(String(s)).slice(0, 200);

export async function acceptedBy(proofTx) {
  const tx = proofTx.toLowerCase();
  if (memory.has(tx)) return memory.get(tx);
  const { blobs } = await list({ prefix: `seen/${tx}/`, limit: 1 });
  const taskId = blobs[0] && decodeURIComponent(blobs[0].pathname.split('/')[2]);
  if (taskId) memory.set(tx, taskId);
  return taskId;
}

export async function markAccepted(proofTx, taskId) {
  const tx = proofTx.toLowerCase();
  memory.set(tx, taskId);
  await put(`seen/${tx}/${safe(taskId)}`, String(taskId), { access: 'private', addRandomSuffix: false, allowOverwrite: true });
}

// Every scored task + our reply, kept past Vercel Hobby's ~1 h log window
// (disputes have 72 h; replays show opponents). 3 s cap so it never costs a turn.
export async function archive(kind, envelope, payload) {
  const id = kind === 'steal' ? `${safe(envelope.matchId)}/${String(envelope.turn).padStart(2, '0')}` : safe(envelope.task_id);
  await put(`log/${kind}/${id}.json`, JSON.stringify({ receivedAt: new Date().toISOString(), envelope, payload }), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    abortSignal: AbortSignal.timeout(3000),
  });
}
