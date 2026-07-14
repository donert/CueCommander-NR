'use strict';

// grandMA3 subsystem (/cc/ma3) — see design.md "Subsystem: grandMA3 Console"
// and requirements TC-MA-01..06.
//
// The interceptor sits beside the UDP-out node, so captures show exactly what
// would be sent to the console. ma3_config is normally fetched from the
// avl_data network table (asset demoma3/NIC1); tests inject a fake config via
// /api/state so no real console or data-API row is needed.

const FAKE_CFG = { ip: '192.168.1.50', port: 8000 };
const SETTLE_MS = 800;

module.exports = [

  {
    name: 'MA3 gotocue builds "Go+ Sequence 3 Cue n" (TC-MA-01)',
    async run(api, assert) {
      await api.setState({ ma3_config: FAKE_CFG });
      await api.clearResults();
      await api.sendCmd('/cc/ma3/gotocue', { parm: { cue: 4 } });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 1, `expected 1 capture, got ${results.length}`);
      assert(results[0].command === 'Go+ Sequence 3 Cue 4',
        `command should be 'Go+ Sequence 3 Cue 4', got '${results[0].command}'`);
      assert(results[0].topic === '/cmd',
        `OSC address should be '/cmd', got '${results[0].topic}'`);
      assert(results[0].host === FAKE_CFG.ip && results[0].port == FAKE_CFG.port,
        `should target ${FAKE_CFG.ip}:${FAKE_CFG.port}, got ${results[0].host}:${results[0].port}`);
    },
  },

  {
    name: 'MA3 gotocue honours parm.seq override (TC-MA-01)',
    async run(api, assert) {
      await api.setState({ ma3_config: FAKE_CFG });
      await api.clearResults();
      await api.sendCmd('/cc/ma3/gotocue', { parm: { seq: 5, cue: 2 } });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 1, `expected 1 capture, got ${results.length}`);
      assert(results[0].command === 'Go+ Sequence 5 Cue 2',
        `got '${results[0].command}'`);
    },
  },

  {
    name: 'MA3 direct cmd sends parm.text verbatim (TC-MA-02)',
    async run(api, assert) {
      await api.setState({ ma3_config: FAKE_CFG });
      await api.clearResults();
      await api.sendCmd('/cc/ma3/cmd', { parm: { text: 'Off Sequence 3' } });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 1, `expected 1 capture, got ${results.length}`);
      assert(results[0].command === 'Off Sequence 3',
        `got '${results[0].command}'`);
    },
  },

  {
    name: 'lights gotocue 94 mirrors to MA3 seq 3 cue 4 (TC-MA-03)',
    async run(api, assert) {
      // Gate off the real ColorSource console while exercising the lights
      // path; the runner restores LightingEnabled from saved state afterwards.
      await api.setState({ LightingEnabled: false, ma3_config: FAKE_CFG });
      await api.clearResults();
      await api.sendCmd('/cc/lights/gotocue', { parm: 94 });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 1,
        `expected 1 MA3 capture from mirror, got ${results.length}`);
      assert(results[0].command === 'Go+ Sequence 3 Cue 4',
        `CS cue 94 should map to 'Go+ Sequence 3 Cue 4', got '${results[0].command}'`);
    },
  },

  {
    name: 'lights gotocue below 91 does not mirror (TC-MA-03)',
    async run(api, assert) {
      await api.setState({ LightingEnabled: false, ma3_config: FAKE_CFG });
      await api.clearResults();
      await api.sendCmd('/cc/lights/gotocue', { parm: 12 });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 0,
        `CS-only cue must not reach MA3, got ${results.length} capture(s)`);
    },
  },

  {
    name: 'MA3 send without config is skipped and logged as Error (TC-MA-04)',
    async run(api, assert) {
      const since = Date.now() - 1000;
      await api.setState({ ma3_config: null });
      await api.clearResults();
      await api.sendCmd('/cc/ma3/gotocue', { parm: { cue: 1 } });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 0,
        `nothing should be sent without config, got ${results.length}`);

      const { body: log } = await api.getEventlog({ since, cmd: '/cc/ma3/gotocue' });
      const err = log.find(r => (r.level || '').toLowerCase() === 'error'
        && /no network config/.test(r.message || ''));
      assert(err, 'expected an Error event "MA3 send skipped — no network config"');
    },
  },

  {
    name: 'MA3Enabled=false blocks the send and logs it (TC-MA-05)',
    async run(api, assert) {
      const since = Date.now() - 1000;
      await api.setState({ ma3_config: FAKE_CFG, MA3Enabled: false });
      await api.clearResults();
      await api.sendCmd('/cc/ma3/cmd', { parm: { text: 'Clear' } });
      await api.wait(SETTLE_MS);

      const { body: results } = await api.getResults({ device: 'ma3' });
      assert(results.length === 0,
        `MA3Enabled=false must block sends, got ${results.length}`);

      const { body: log } = await api.getEventlog({ since, cmd: '/cc/ma3/cmd' });
      const info = log.find(r => /MA3 disabled/.test(r.message || ''));
      assert(info, 'expected an event log record noting MA3 is disabled');

      await api.setState({ MA3Enabled: null }); // unset → default enabled
    },
  },

  {
    name: 'unsupported /cc/ma3 command logs an Error (TC-MA-06)',
    async run(api, assert) {
      const since = Date.now() - 1000;
      await api.sendCmd('/cc/ma3/bogus');
      await api.wait(SETTLE_MS);

      const { body: log } = await api.getEventlog({ since, cmd: '/cc/ma3/bogus' });
      const err = log.find(r => (r.level || '').toLowerCase() === 'error'
        && /Unsupported command/.test(r.message || ''));
      assert(err, 'expected "Unsupported command: /cc/ma3/bogus" Error entry');
    },
  },

];
