'use strict';

// BUG-002: The "ip and port" change node in the Shure setnames flow was
// hardcoding port "2202" (as a string) instead of reading from the row's
// shure.port field. These tests verify that port comes from the row data.

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
      await api.wait(500);

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
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length > 0, 'should have at least one Shure capture');
      assert(results[0].host === '10.0.0.42',
        `host should be '10.0.0.42' (from row shure.ip), got ${results[0].host}`);
    },
  },

];
