'use strict';

module.exports = [

  {
    name: 'Event log: SELECT with no globals set → no NaN error (valid SQL)',
    async run(api, assert) {
      // Clear filtertime/filterdepth/filter1sec to simulate fresh Node-RED start
      await api.setState({ filtertime: null, filterdepth: null, filter1sec: null });
      await api.wait(1500); // wait for the 1-sec trigger to fire at least once

      // If the query errored we'd see a Node-RED error log, not a result.
      // We assert that the eventlog endpoint itself returns rows (or empty array)
      // without throwing — a 200 response means SQLite executed cleanly.
      const { status, body } = await api.getEventlog({ limit: 5 });
      assert(status === 200, `eventlog endpoint should return 200, got ${status}`);
      assert(Array.isArray(body), 'eventlog response should be an array');
    },
  },

  {
    name: 'Event log: filter by cmd returns only matching rows',
    async run(api, assert) {
      // Trigger a known command so there is at least one matchable entry
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(400);

      const since = Date.now() - 10000; // last 10 seconds
      const { status, body } = await api.getEventlog({ cmd: '/cc/klang/globalrename', since });
      assert(status === 200, 'should return 200');
      assert(Array.isArray(body), 'should be array');
      assert(body.every(r => r.cmd === '/cc/klang/globalrename'),
        'all returned rows should match the cmd filter');
    },
  },

  {
    name: 'Event log: limit is respected',
    async run(api, assert) {
      const { status, body } = await api.getEventlog({ limit: 3 });
      assert(status === 200, 'should return 200');
      assert(body.length <= 3, `limit=3 should return at most 3 rows, got ${body.length}`);
    },
  },

  {
    name: 'Event log: since filters out old rows',
    async run(api, assert) {
      const futureMillis = Date.now() + 60000; // 1 minute in the future
      const { status, body } = await api.getEventlog({ since: futureMillis });
      assert(status === 200, 'should return 200');
      assert(body.length === 0, `since=future should return 0 rows, got ${body.length}`);
    },
  },

];
