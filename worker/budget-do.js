// Ask AI daily-budget counter -- a Durable Object, not a plain KV read-then-write. Found by
// /stress-test (2026-08-25): KV has no atomic increment, and 20 concurrent requests against the
// original KV-based check-then-write implementation ALL succeeded, with 19 of 20 real cost
// updates silently lost to a last-write-wins race (final recorded spend: $0.30 for what should
// have read ~$6.00) -- the "hard ceiling" was not actually a ceiling under ordinary concurrent
// public-page traffic, not even adversarial load. A Durable Object's fetch() calls against the
// SAME id are processed strictly one at a time (Cloudflare's own guarantee, and Cloudflare's own
// documented answer for "I need a real atomic counter, KV won't do it") -- that serialization is
// what makes the fix correct, not a bigger/cleverer retry loop over KV.
//
// Design: reserve a flat, conservative worst-case cost UPFRONT, in ONE round trip, before ever
// calling Anthropic -- not "check then separately commit the real cost after," which would
// reopen the exact same race between the two calls. This trades a little precision (a cheap
// question still "spends" the same worst-case reservation as an expensive one) for an honestly
// atomic ceiling, which is the property that actually matters for a public page with no login.

var RESERVE_PER_QUESTION_USD = 0.05; // conservative: comfortably above the real worst-case cost
  // of one question (MAX_TOOL_ROUNDS=6 rounds x ~2K context tokens + 700 max_tokens output on
  // Haiku 4.5 rates estimates to roughly $0.03 worst case -- see worker/index.js's own RATE_IN_PER_M/
  // RATE_OUT_PER_M). Re-check this constant if MAX_TOOL_ROUNDS, max_tokens, or the model changes.

class BudgetCounter {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    var body = await request.json();
    var dateKey = body.dateKey;
    var capUsd = body.capUsd;
    return this.state.blockConcurrencyWhile
      ? this._reserveSerialized(dateKey, capUsd)
      : this._reserve(dateKey, capUsd); // blockConcurrencyWhile absent only in a non-DO test stub
  }
  async _reserveSerialized(dateKey, capUsd) {
    // blockConcurrencyWhile is redundant with the DO's own single-threaded fetch() guarantee, but
    // stated explicitly rather than relied on implicitly -- makes the atomicity requirement
    // visible in the code, not just true by platform accident.
    var result;
    await this.state.blockConcurrencyWhile(async () => { result = await this._reserve(dateKey, capUsd); });
    return result;
  }
  async _reserve(dateKey, capUsd) {
    // Integer CENTS, not floating dollars -- /stress-test finding (2026-08-25): repeated float
    // addition of $0.05 drifts (39 additions landed on 2.00000000000000088818, not exactly 2.00),
    // which tipped a boundary comparison and rejected a request that should have been allowed.
    // Each call converts its own inputs to cents once (no drift accumulates in the STORED value,
    // which is always an exact integer) rather than storing/accumulating a float across calls.
    var reserveCents = Math.round(RESERVE_PER_QUESTION_USD * 100);
    var capCents = Math.round(capUsd * 100);
    var spentCents = (await this.state.storage.get(dateKey)) || 0;
    var allow = spentCents + reserveCents <= capCents;
    if (allow) {
      spentCents += reserveCents;
      await this.state.storage.put(dateKey, spentCents);
    }
    return new Response(JSON.stringify({allow: allow, spent: spentCents / 100}), {status: 200});
  }
}

module.exports = {BudgetCounter: BudgetCounter, RESERVE_PER_QUESTION_USD: RESERVE_PER_QUESTION_USD};
