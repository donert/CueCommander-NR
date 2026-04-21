'use strict';

const fixture = require('../fixture.json');

// Rows from fixture by role:
// Rows 0-2, 6-7: active WITH vocal name  → full treatment
// Row 3:         active WITHOUT vocal name → falls back to mic_name
// Rows 4-5:      inactive WITH vocal name  → inactive treatment regardless

module.exports = [

  // ── Klang ─────────────────────────────────────────────────────────────────

  {
    name: 'Klang: active row with name → visible=true and formatted name',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[0]] }); // Alice, active
      await api.clearResults();
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'klang' });
      const visibleMsgs = results.filter(r => r.topic && r.topic.includes('/visible'));
      const nameMsgs    = results.filter(r => r.topic && r.topic.includes('/name'));

      assert(visibleMsgs.length > 0, 'should have visible messages');
      assert(visibleMsgs.every(r => r.payload === true), 'active row: visible should be true');

      const expected = 'Alic 01';   // first 4 chars of "Alice" + last 2 of "Mic 01"
      assert(nameMsgs.every(r => r.payload === expected),
        `active row: name should be "${expected}", got "${nameMsgs[0]?.payload}"`);
    },
  },

  {
    name: 'Klang: inactive row → visible=false and mic_name used',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[4]] }); // Dave, inactive
      await api.clearResults();
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'klang' });
      const visibleMsgs = results.filter(r => r.topic && r.topic.includes('/visible'));
      const nameMsgs    = results.filter(r => r.topic && r.topic.includes('/name'));

      assert(visibleMsgs.length > 0, 'should have Klang visible captures');
      assert(visibleMsgs.every(r => r.payload === false), 'inactive row: visible should be false');
      assert(nameMsgs.every(r => r.payload === fixture[4].mic_name),
        `inactive row: name should be mic_name "${fixture[4].mic_name}"`);
    },
  },

  {
    name: 'Klang: active row with no vocal name → visible=true, mic_name used',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[3]] }); // Mic 04, active, no name
      await api.clearResults();
      await api.sendCmd('/cc/klang/globalrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'klang' });
      const visibleMsgs = results.filter(r => r.topic && r.topic.includes('/visible'));
      const nameMsgs    = results.filter(r => r.topic && r.topic.includes('/name'));

      assert(visibleMsgs.length > 0, 'should have Klang visible captures');
      assert(visibleMsgs.every(r => r.payload === true), 'active-no-name row: visible should be true');
      assert(nameMsgs.every(r => r.payload === fixture[3].mic_name),
        'active-no-name row: name should fall back to mic_name');
    },
  },

  // ── Reaper ────────────────────────────────────────────────────────────────

  {
    name: 'Reaper: active row with name → mute=0 and full name used',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[1]] }); // Bob, active
      await api.clearResults();
      await api.sendCmd('/cc/reaper/inputrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'reaper' });
      const muteMsgs = results.filter(r => r.topic && r.topic.includes('/mute'));
      const nameMsgs = results.filter(r => r.topic && r.topic.includes('/name'));

      assert(muteMsgs.length > 0, 'should have Reaper mute captures');
      assert(muteMsgs.every(r => r.payload === 0), 'active row: mute should be 0');
      const expectedName = `${fixture[1].vocal_name} ${fixture[1].mic_name}`;
      assert(nameMsgs.every(r => r.payload === expectedName),
        `active row: name should be "${expectedName}"`);
    },
  },

  {
    name: 'Reaper: inactive row → mute=1 and mic_name only',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[5]] }); // Eve, inactive
      await api.clearResults();
      await api.sendCmd('/cc/reaper/inputrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'reaper' });
      const muteMsgs = results.filter(r => r.topic && r.topic.includes('/mute'));
      const nameMsgs = results.filter(r => r.topic && r.topic.includes('/name'));

      assert(muteMsgs.length > 0, 'should have Reaper mute captures');
      assert(muteMsgs.every(r => r.payload === 1), 'inactive row: mute should be 1');
      assert(nameMsgs.every(r => r.payload === fixture[5].mic_name),
        'inactive row: name should be mic_name only');
    },
  },

  // ── dLive ─────────────────────────────────────────────────────────────────

  {
    name: 'dLive: active row with name → channel name contains vocal prefix + mic suffix',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[2]] }); // Carol, active
      await api.clearResults();
      await api.sendCmd('/cc/dlive/inputrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'dlive' });
      assert(results.length > 0, 'should have dLive capture');

      const expected = 'Car03';  // first 3 of "Carol" + last 2 of "Mic 03"
      assert(results.every(r => r.name === expected),
        `dLive active name should be "${expected}", got "${results[0]?.name}"`);
    },
  },

  {
    name: 'dLive: inactive row → channel name is mic_name',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[4]] }); // Dave, inactive
      await api.clearResults();
      await api.sendCmd('/cc/dlive/inputrename');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'dlive' });
      assert(results.length > 0, 'should have dLive captures');
      assert(results.every(r => r.name === fixture[4].mic_name),
        `dLive inactive: name should be mic_name "${fixture[4].mic_name}"`);
    },
  },

  // ── Shure ─────────────────────────────────────────────────────────────────

  {
    name: 'Shure: active row with name → command contains vocal name prefix',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[6]] }); // Frank, active
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length > 0, 'should have Shure capture');

      // chname = first 6 of "Frank" + last 2 of "Mic 07" = "Frank07"
      const expectedChunk = 'Frank07';
      const cmd = results[0]?.command || '';
      assert(cmd.includes(expectedChunk),
        `Shure active: command should contain "${expectedChunk}", got "${cmd}"`);
    },
  },

  {
    name: 'Shure: inactive row → command contains only mic number (no vocal prefix)',
    async run(api, assert) {
      await api.setState({ input_map: [fixture[5]] }); // Eve, inactive
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(500);

      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length > 0, 'should have Shure capture for inactive row');
      // chname = "" + last 2 of "Mic 06" = "06"
      const cmd = results[0]?.command || '';
      assert(cmd.includes('CHAN_NAME {06}') || cmd.match(/CHAN_NAME \{\d+\}/),
        `Shure inactive: command should have only number in name, got "${cmd}"`);
    },
  },

];
