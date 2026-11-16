// Steal errors go to the 5xx path: a missed turn is HOLD −1 and the platform re-pushes within the
// 5-min window, while an accepted proofless HOLD is −2 and final. Gatekeeper falls back to REJECT.
export const handlers = {
  async steal(envelope) {
    const { stealTurn } = await import('./steal.mjs');
    return stealTurn(envelope);
  },
  async gatekeeper(envelope) {
    try {
      const { gatekeeperTask } = await import('./gatekeeper-task.mjs');
      return await gatekeeperTask(envelope);
    } catch (error) {
      console.log(JSON.stringify({ at: 'gatekeeper-fallback', error: error.stack ?? String(error) }));
      return { decision: 'REJECT', reason_code: 'PUBLIC_INPUT_MISMATCH', proof_tx: envelope.input?.proof_tx };
    }
  },
};
