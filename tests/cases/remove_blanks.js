'use strict';

const fixture = require('../fixture.json');

// fixture: rows 0-2 active+name, row 3 active+noname, rows 4-5 inactive, rows 6-7 active+name
// All 8 rows have a shure config, so /cc/shure/setnames produces 8 captures.
// Active rows get vocal-name prefix + mic number; inactive rows get mic number only.

module.exports = [

  {
    // Note: remove_blanks is only called via the krdsmgmt recall/settitle flow chains,
    // not by setting input_map directly via the HTTP API. This test therefore does NOT
    // directly exercise the function. It verifies only that the quiet period after a
    // null input_map write produces no error events. The null-guard fix for remove_blanks
    // is covered indirectly by the null_input.js suite (BUG-001).
    name: 'Event log is clean after setting null input_map (remove_blanks not directly exercised)',
    async run(api, assert) {
      await api.setState({ input_map: null });
      await api.wait(500);
      const since = Date.now() - 2000;
      const { body } = await api.getEventlog({ since, limit: 20 });
      const errors = body.filter(r => r.level === 'ERROR');
      assert(errors.length === 0,
        `unexpected errors in event log: ${errors.map(e => e.message).join('; ')}`);
    },
  },

  {
    name: 'Shure setnames: mixed fixture → all rows processed, inactive get mic-number-only name',
    async run(api, assert) {
      await api.setState({ input_map: fixture });
      await api.clearResults();
      await api.sendCmd('/cc/shure/setnames');
      await api.wait(500);

      // All 8 rows have a shure config → 8 captures
      const { body: results } = await api.getResults({ device: 'shure' });
      assert(results.length === fixture.length,
        `expected ${fixture.length} Shure captures (all rows with Shure config), got ${results.length}`);

      // Active rows with vocal names should have the vocal prefix in the command
      // e.g. fixture[0] = Alice (active, vocal_name "Alice") → "Alice0" + "01" in CHAN_NAME
      const aliceResult = results.find(r => r.command && r.command.includes('Alice'));
      assert(aliceResult !== undefined,
        'active row with name (Alice): command should contain vocal name');

      // Inactive rows should NOT have their vocal name in the command
      // fixture[4] = Dave (inactive, vocal_name "Dave") → chname = "05" only
      const daveResult = results.find(r => r.command && r.command.includes('SET 5'));
      if (daveResult) {
        assert(!daveResult.command.includes('Dave'),
          `inactive row (Dave): command should not contain vocal name, got "${daveResult.command}"`);
      }
    },
  },

];
