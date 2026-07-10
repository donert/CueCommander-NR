'use strict';

// TC-AM-16: global.input_map must survive the service-title initialization.
//
// The Editable Table ui-template has passthru=true, so any message sent into
// the widget is forwarded to its output wire, which feeds "store on publish"
// (global.input_map = msg.payload). Until 2026-07-09 the startup title init
// ("get next Sunday") sent the title STRING as msg.payload through this path,
// overwriting input_map with a string on every Node-RED restart — which
// silently broke every send-names action until a service was manually
// recalled. Two defences now exist: the title message carries no payload,
// and a "payload is array" switch guards the table output.
//
// /cc/krdsmgmt/settitle drives the same title-init path as startup, so it
// exercises the corruption vector on demand.

module.exports = [

  {
    name: 'input_map survives title init (settitle must not clobber it) (TC-AM-16)',
    async run(api, assert) {
      const rows = [{
        mic_name: 'HH01', vocal_name: 'Alice', active: true,
        klang_channel: 1, dlive_channel: 1, reaper_channel: 1,
        shure: { ch: 1, ip: '192.168.1.100' },
      }];
      await api.setState({ input_map: rows });

      await api.sendCmd('/cc/krdsmgmt/settitle');
      await api.wait(600);

      const { status, body } = await api.getState();
      assert(status === 200, `getState should return 200, got ${status}`);
      assert(Array.isArray(body.input_map),
        `input_map should still be an array after title init, got ${typeof body.input_map}: ${JSON.stringify(body.input_map).slice(0, 80)}`);
      assert(body.input_map.length === 1 && body.input_map[0].mic_name === 'HH01',
        'input_map contents should be unchanged by title init');
    },
  },

  {
    name: 'setnames still works immediately after title init',
    async run(api, assert) {
      const rows = [{
        mic_name: 'HH01', vocal_name: 'Alice', active: true,
        klang_channel: 1, dlive_channel: 1, reaper_channel: 1,
        shure: { ch: 1, ip: '192.168.1.100' },
      }];
      await api.setState({ input_map: rows });
      await api.sendCmd('/cc/krdsmgmt/settitle');
      await api.wait(400);

      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(800);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length === 1,
        `expected 1 Shure capture after title init, got ${results.length}`);
    },
  },

];
