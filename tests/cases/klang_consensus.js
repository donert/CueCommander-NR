'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a live-state object with `mixCount` mixes × entries from `channels`.
 *  channels: { <ch>: { name, mute, visible, solo } }
 *  Overrides: array of { mix, ch, attr, value } applied after base. */
function makeState(mixCount, channels, overrides = []) {
    const state = {};
    for (let mix = 1; mix <= mixCount; mix++) {
        for (const [ch, base] of Object.entries(channels)) {
            state[`${mix}:${ch}`] = {
                name:    base.name,
                mute:    base.mute,
                visible: base.visible,
                solo:    base.solo,
                last_updated: new Date().toISOString(),
            };
        }
    }
    for (const { mix, ch, attr, value } of overrides) {
        const key = `${mix}:${ch}`;
        if (state[key]) state[key][attr] = value;
    }
    return state;
}

/** Clear Klang global state between tests. */
async function clearKlangState(api) {
    await api.setState({ klang_test_mode: true, klang_live_state: {}, klang_variances: null, klang_master_mix: null });
}

// ── Test cases ────────────────────────────────────────────────────────────────

module.exports = [

    // ── Status endpoint ───────────────────────────────────────────────────────

    {
        name: 'Klang: GET /api/klang/status returns required fields',
        async run(api, assert) {
            const { status, body } = await api.getState();
            // Use the Node-RED API directly for non-state endpoints
            const resp = await fetch_nr('/api/klang/status');
            assert(resp.status === 200, `Expected 200, got ${resp.status}`);
            assert(typeof resp.body.sweep_active === 'boolean',   'sweep_active should be boolean');
            assert('results_available' in resp.body,              'results_available field required');
            assert('sweep_mix_current' in resp.body,              'sweep_mix_current field required');
        },
    },

    // ── reportmixvariances — no data ──────────────────────────────────────────

    {
        name: 'Klang: GET /api/klang/reportmixvariances → 404 when no results',
        async run(api, assert) {
            await clearKlangState(api);
            const resp = await fetch_nr('/api/klang/reportmixvariances');
            assert(resp.status === 404, `Expected 404, got ${resp.status}`);
            assert(resp.body.ok === false, 'ok should be false');
        },
    },

    // ── buildConsensus — empty state ──────────────────────────────────────────

    {
        name: 'Klang: buildConsensus with no state → clears results, logs error',
        async run(api, assert) {
            await clearKlangState(api);
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            assert(body.klang_variances  === null, 'klang_variances should be null after empty-state build');
            assert(body.klang_master_mix === null, 'klang_master_mix should be null after empty-state build');
        },
    },

    // ── buildConsensus — uniform state ────────────────────────────────────────

    {
        name: 'Klang: buildConsensus with uniform state → 0 variances',
        async run(api, assert) {
            const liveState = makeState(16, {
                1: { name: 'Ch01', mute: false, visible: true,  solo: false },
                2: { name: 'Ch02', mute: false, visible: false, solo: false },
            });
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            assert(body.klang_variances !== null,           'variances should be populated');
            assert(body.klang_variances.total_variances === 0,
                `Expected 0 variances, got ${body.klang_variances.total_variances}`);
            assert(body.klang_master_mix !== null,           'master mix should be populated');
            assert(body.klang_master_mix.channels_with_data === 2,
                `Expected 2 channels, got ${body.klang_master_mix.channels_with_data}`);
        },
    },

    // ── buildConsensus — name variance (warning) ──────────────────────────────

    {
        name: 'Klang: name mismatch on one mix → warning variance',
        async run(api, assert) {
            const liveState = makeState(16, {
                1: { name: 'Alice', mute: false, visible: true, solo: false },
            }, [
                { mix: 7, ch: 1, attr: 'name', value: 'Aliss' },  // typo on mix 7
            ]);
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            const variances = body.klang_variances.variances;
            assert(body.klang_variances.total_variances === 1,
                `Expected 1 variance, got ${body.klang_variances.total_variances}`);
            assert(variances[0].mix === 7,           `Expected mix 7, got ${variances[0].mix}`);
            assert(variances[0].channel === 1,       `Expected ch 1, got ${variances[0].channel}`);
            assert(variances[0].attribute === 'name', `Expected name, got ${variances[0].attribute}`);
            assert(variances[0].severity === 'warning', `Expected warning, got ${variances[0].severity}`);
            assert(variances[0].consensus === 'Alice',  `Consensus should be 'Alice'`);
            assert(variances[0].actual   === 'Aliss',   `Actual should be 'Aliss'`);
        },
    },

    // ── buildConsensus — mute variance (critical) ─────────────────────────────

    {
        name: 'Klang: mute mismatch on one mix → critical variance',
        async run(api, assert) {
            const liveState = makeState(16, {
                5: { name: 'Bass', mute: false, visible: true, solo: false },
            }, [
                { mix: 3, ch: 5, attr: 'mute', value: true },  // muted on mix 3 only
            ]);
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            const variances = body.klang_variances.variances;
            assert(body.klang_variances.total_variances === 1,
                `Expected 1 variance, got ${body.klang_variances.total_variances}`);
            assert(variances[0].severity === 'critical',
                `Mute mismatch should be critical, got ${variances[0].severity}`);
            assert(variances[0].attribute === 'mute', `Expected mute attribute`);
            assert(variances[0].consensus === false,   'Consensus should be false (unmuted)');
            assert(variances[0].actual   === true,     'Actual should be true (muted)');
        },
    },

    // ── buildConsensus — multiple variances ───────────────────────────────────

    {
        name: 'Klang: multiple variances across channels counted correctly',
        async run(api, assert) {
            const liveState = makeState(16, {
                1: { name: 'Vox',  mute: false, visible: true,  solo: false },
                2: { name: 'Keys', mute: false, visible: true,  solo: false },
            }, [
                { mix: 2,  ch: 1, attr: 'name',    value: 'Voxx' },   // warning
                { mix: 5,  ch: 2, attr: 'visible',  value: false },    // warning
                { mix: 11, ch: 1, attr: 'mute',     value: true },     // critical
            ]);
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            assert(body.klang_variances.total_variances === 3,
                `Expected 3 variances, got ${body.klang_variances.total_variances}`);

            const critical = body.klang_variances.variances.filter(v => v.severity === 'critical');
            const warning  = body.klang_variances.variances.filter(v => v.severity === 'warning');
            assert(critical.length === 1, `Expected 1 critical, got ${critical.length}`);
            assert(warning.length  === 2, `Expected 2 warnings, got ${warning.length}`);
        },
    },

    // ── Consensus tie-break ───────────────────────────────────────────────────

    {
        name: 'Klang: plurality tie-break uses lowest mix number',
        async run(api, assert) {
            // 8 mixes say 'GroupA', 8 say 'GroupB' — mix 1 is in GroupA → GroupA wins
            const liveState = {};
            for (let mix = 1; mix <= 16; mix++) {
                liveState[`${mix}:10`] = {
                    name: mix <= 8 ? 'GroupA' : 'GroupB',
                    mute: false, visible: true, solo: false,
                    last_updated: new Date().toISOString(),
                };
            }
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const { body } = await api.getState();
            const chConsensus = body.klang_master_mix.channels['10'].name;
            assert(chConsensus.consensus === 'GroupA',
                `Tie-break: expected 'GroupA' (lowest mix wins), got '${chConsensus.consensus}'`);
            // 8 variances — the 'GroupB' mixes all deviate
            assert(body.klang_variances.total_variances === 8,
                `Expected 8 variances for GroupB mixes, got ${body.klang_variances.total_variances}`);
        },
    },

    // ── reportmixvariances — after buildConsensus ─────────────────────────────

    {
        name: 'Klang: GET /api/klang/reportmixvariances → 200 after buildConsensus',
        async run(api, assert) {
            const liveState = makeState(16, {
                1: { name: 'Vox', mute: false, visible: true, solo: false },
            });
            await api.setState({ klang_test_mode: true, klang_live_state: liveState });
            await api.sendCmd('/cc/klang/buildConsensus');
            await api.wait(400);

            const resp = await fetch_nr('/api/klang/reportmixvariances');
            assert(resp.status === 200, `Expected 200, got ${resp.status}`);
            assert('total_variances' in resp.body, 'total_variances field required');
            assert(Array.isArray(resp.body.variances), 'variances should be an array');
            assert('generated_at' in resp.body, 'generated_at field required');
        },
    },

    // ── POST /api/klang/buildconsensus (HTTP endpoint) ────────────────────────

    {
        name: 'Klang: POST /api/klang/buildconsensus → 202 accepted',
        async run(api, assert) {
            // Just verify the HTTP endpoint responds correctly — sweep itself needs hardware
            const resp = await fetch_nr('/api/klang/buildconsensus', 'POST');
            // 202 = started, 409 = already running — both are valid non-error responses
            assert(resp.status === 202 || resp.status === 409,
                `Expected 202 or 409, got ${resp.status}`);
            if (resp.status === 202) {
                assert(resp.body.ok === true, 'ok should be true on 202');
                assert(typeof resp.body.estimated_duration_s === 'number', 'estimated_duration_s required');
            }
            // Clear the sweep flag so it doesn't affect subsequent runs or the live dashboard
            await api.setState({ klang_sweep_active: false });
        },
    },

];

// ── Minimal fetch helper for direct NR HTTP API calls ────────────────────────
// (api.js only exposes state/cmd/eventlog/results — Klang endpoints need raw calls)
const http  = require('http');
const BASE  = process.env.NR_HOST  || 'http://uacts-g001:1880';
const TOKEN = process.env.API_TOKEN || 'vn-api-changeme';

function fetch_nr(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url  = new URL(BASE + path);
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: url.hostname,
            port:     url.port || 1880,
            path:     url.pathname,
            method,
            headers: {
                'X-Api-Token':  TOKEN,
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        };
        const req = http.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
