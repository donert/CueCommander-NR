'use strict';

// BUG-002: The "ip and port" change node in the Shure setnames flow was
// hardcoding port "2202" (as a string) instead of reading from the row's
// shure.port field. These tests verify that port comes from the row data.
//
// 2026-07-09: Saved assignment files typically omit shure.port, which left
// msg.port undefined and the TCP request node unable to connect (no commands
// reached the receivers). The port now defaults to 2202 when the row omits
// it (RN-05 / TC-RN-02). Per-channel sets are routed through the message hub
// as /cc/shure/setonename (RN-04 / TC-RN-03); the interceptor captures at
// the TCP boundary, so these tests verify what is actually sent.

// Hub round-trips (setnames → setonename → TCP) need a bit longer than the
// old direct-wire path did.
const SETTLE_MS = 800;

module.exports = [

  {
    name: 'Shure setnames: port is read from row shure.port, not hardcoded',
    async run(api, assert) {
      const customRow = {
        mic_name: 'Mic 01', vocal_name: 'Alice', active: true,
        klang_channel: 1, dlive_channel: 1, reaper_channel: 1,
        shure: { ch: 1, ip: '192.168.1.100', port: 9999 },
      };
      await api.setState({ input_map: [customRow] });
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length > 0, 'should have at least one Shure capture');
      // loose == to tolerate if TCP node converts port to string internally
      assert(results[0].port == 9999,
        `port should be 9999 (from row shure.port), got ${results[0].port}`);
    },
  },

  {
    name: 'Shure setnames: host is read from row shure.ip',
    async run(api, assert) {
      const customRow = {
        mic_name: 'Mic 01', vocal_name: 'Alice', active: true,
        klang_channel: 1, dlive_channel: 1, reaper_channel: 1,
        shure: { ch: 1, ip: '10.0.0.42', port: 2202 },
      };
      await api.setState({ input_map: [customRow] });
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length > 0, 'should have at least one Shure capture');
      assert(results[0].host === '10.0.0.42',
        `host should be '10.0.0.42' (from row shure.ip), got ${results[0].host}`);
    },
  },

  {
    name: 'Shure setnames: port defaults to 2202 when the row omits it (TC-RN-02)',
    async run(api, assert) {
      // Saved assignment files typically have shure: {ip, ch} with no port.
      const customRow = {
        mic_name: 'HH01', vocal_name: 'Alice', active: true,
        klang_channel: 1, dlive_channel: 1, reaper_channel: 1,
        shure: { ch: 1, ip: '192.168.1.100' },
      };
      await api.setState({ input_map: [customRow] });
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length === 1, `expected 1 capture, got ${results.length}`);
      assert(results[0].port == 2202,
        `port should default to 2202, got ${results[0].port}`);
      assert(results[0].host === '192.168.1.100',
        `host should be '192.168.1.100', got ${results[0].host}`);
    },
  },

  {
    name: 'Shure setnames: per-channel commands route through the hub (TC-RN-03)',
    async run(api, assert) {
      const rows = [1, 2, 3].map(ch => ({
        mic_name: 'HH0' + ch, vocal_name: 'Singer' + ch, active: true,
        klang_channel: ch, dlive_channel: ch, reaper_channel: ch,
        shure: { ch, ip: '192.168.1.100' },
      }));
      const since = Date.now() - 1000;
      await api.setState({ input_map: rows });
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(SETTLE_MS);

      // One TCP-boundary capture per row, correctly formed
      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length === 3, `expected 3 captures, got ${results.length}`);
      // chname = first 6 of vocal_name + last 2 of mic_name, e.g. Singer01
      assert(results.every(r => /^< SET \d CHAN_NAME \{Singer\d\d\} >$/.test(r.command)),
        `commands malformed: ${JSON.stringify(results.map(r => r.command))}`);

      // One /cc/shure/setonename event log entry per row, and no
      // "unsupported" errors anywhere in the window
      const { status, body: log } = await api.getEventlog({ cmd: '/cc/shure/setonename', since });
      assert(status === 200, `eventlog should return 200, got ${status}`);
      const arrived = log.filter(r => r.message === 'message arrived');
      assert(arrived.length >= 3,
        `expected >= 3 setonename hub arrivals, got ${arrived.length}`);

      const { body: all } = await api.getEventlog({ since });
      const errors = all.filter(r =>
        (r.level || '').toLowerCase() === 'error' && /shure/.test(r.cmd || ''));
      assert(errors.length === 0,
        `no shure errors expected, got: ${JSON.stringify(errors.map(e => e.message))}`);
    },
  },

];
