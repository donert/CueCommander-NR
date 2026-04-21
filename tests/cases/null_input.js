'use strict';

// BUG-001: When input_map is null (cold start before any recall), the device
// processor functions used to crash with "TypeError: tableData is not iterable".
// These tests verify that sending a device command with no input_map loaded
// produces no error events and no crash.

module.exports = [

  {
    name: 'Klang: null input_map → no crash on globalrename',
    async run(api, assert) {
      await api.setState({ input_map: null });
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(500);

      const since = Date.now() - 3000;
      const { body } = await api.getEventlog({ since, limit: 20 });
      const errors = body.filter(r => r.level === 'ERROR');
      assert(errors.length === 0,
        `got ${errors.length} error event(s): ${errors.map(e => e.message).join('; ')}`);
    },
  },

  {
    name: 'dLive: null input_map → no crash on inputrename',
    async run(api, assert) {
      await api.setState({ input_map: null });
      await api.sendCmd('/cc/dlive/inputrename');
      await api.wait(500);

      const since = Date.now() - 3000;
      const { body } = await api.getEventlog({ since, limit: 20 });
      const errors = body.filter(r => r.level === 'ERROR');
      assert(errors.length === 0,
        `got ${errors.length} error event(s): ${errors.map(e => e.message).join('; ')}`);
    },
  },

  {
    name: 'Reaper: null input_map → no crash on inputrename',
    async run(api, assert) {
      await api.setState({ input_map: null });
      await api.sendCmd('/cc/reaper/inputrename');
      await api.wait(500);

      const since = Date.now() - 3000;
      const { body } = await api.getEventlog({ since, limit: 20 });
      const errors = body.filter(r => r.level === 'ERROR');
      assert(errors.length === 0,
        `got ${errors.length} error event(s): ${errors.map(e => e.message).join('; ')}`);
    },
  },

  {
    name: 'Klang: empty array input_map → no crash, produces no captures',
    async run(api, assert) {
      await api.setState({ input_map: [] });
      await api.clearResults();
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'klang' });
      assert(results.length === 0,
        `empty input_map should produce 0 captures, got ${results.length}`);
    },
  },

];
