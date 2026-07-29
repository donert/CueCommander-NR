'use strict';

// POST /api/klang/setvariance — see design.md "Subsystem: Klang" and
// requirements.md KL-xx.
//
// Regression coverage for a real bug: kl_api_sv_fn built the SwitchUser and
// SET OSC packets and called node.send() to output 1, but output 1's wire
// was empty — the packets were silently dropped while the HTTP response
// still reported ok:true unconditionally. Neither symptom was visible from
// the HTTP response alone, which is why it shipped unnoticed: the response
// always said "ok" whether or not anything actually reached the wire.
//
// The fix sends over a dgram socket created inside the function itself, so
// a real send failure surfaces as ok:false with an error message, and each
// attempted send (success or failure) is recorded to global.test_results
// under device 'klang_setvariance' — giving these tests something to
// observe that isn't just the (previously untrustworthy) HTTP response.
//
// klang_konductor_override lets tests point the Konductor target without
// touching the real device 'parameters' config; it round-trips through
// GET/POST /api/state so the runner's per-test save/restore covers it.

const SETTLE_MS = 500;

async function clearOverride(api) {
    await api.setState({ klang_konductor_override: null });
}

module.exports = [

    {
        name: 'Klang setvariance: successful send is recorded and reported ok',
        async run(api, assert) {
            await api.setState({ klang_konductor_override: { ip: '127.0.0.1', port: 19110 } });
            await api.clearResults();

            const resp = await fetch_nr('/api/klang/setvariance', 'POST', {
                mix: 4, channel: 7, attribute: 'name', value: 'Test Name',
            });
            assert(resp.status === 200, `Expected 200, got ${resp.status}: ${JSON.stringify(resp.body)}`);
            assert(resp.body.ok === true, `Expected ok:true, got ${JSON.stringify(resp.body)}`);

            await api.wait(SETTLE_MS);

            const { body: results } = await api.getResults({ device: 'klang_setvariance' });
            assert(results.length === 1, `Expected 1 recorded send, got ${results.length}`);
            const r = results[0];
            assert(r.ok === true,          `Expected recorded ok:true, got ${r.ok}`);
            assert(r.mix === 4,            `Expected mix 4, got ${r.mix}`);
            assert(r.channel === 7,        `Expected channel 7, got ${r.channel}`);
            assert(r.attribute === 'name', `Expected attribute 'name', got ${r.attribute}`);
            assert(r.value === 'Test Name', `Expected value 'Test Name', got ${r.value}`);
            assert(r.host === '127.0.0.1' && r.port === 19110,
                `Expected target 127.0.0.1:19110, got ${r.host}:${r.port}`);

            await clearOverride(api);
        },
    },

    {
        name: 'Klang setvariance: send failure is reported as an error, not ok:true',
        async run(api, assert) {
            // Port -1 makes the underlying dgram socket.send() throw
            // synchronously — a deterministic, network-independent way to
            // exercise the failure path without depending on real hardware
            // being offline.
            await api.setState({ klang_konductor_override: { ip: '127.0.0.1', port: -1 } });
            await api.clearResults();

            const resp = await fetch_nr('/api/klang/setvariance', 'POST', {
                mix: 9, channel: 2, attribute: 'mute', value: true,
            });
            assert(resp.status === 502, `Expected 502, got ${resp.status}: ${JSON.stringify(resp.body)}`);
            assert(resp.body.ok === false, `Expected ok:false, got ${JSON.stringify(resp.body)}`);
            assert(typeof resp.body.error === 'string' && resp.body.error.length > 0,
                'Expected a non-empty error message');

            await api.wait(SETTLE_MS);

            const { body: results } = await api.getResults({ device: 'klang_setvariance' });
            assert(results.length === 1, `Expected 1 recorded (failed) send, got ${results.length}`);
            assert(results[0].ok === false, `Expected recorded ok:false, got ${results[0].ok}`);
            assert(typeof results[0].error === 'string' && results[0].error.length > 0,
                'Expected recorded entry to include an error message');

            await clearOverride(api);
        },
    },

    {
        name: 'Klang setvariance: propagate-to-others loop records one send per mix',
        async run(api, assert) {
            // Mirrors the dashboard's "Set all others to" button: one
            // setvariance call per other mix, sequentially. This is the
            // exact call pattern that silently did nothing before the fix.
            await api.setState({ klang_konductor_override: { ip: '127.0.0.1', port: 19110 } });
            await api.clearResults();

            const otherMixes = [1, 2, 3, 5, 6];
            for (const mix of otherMixes) {
                const resp = await fetch_nr('/api/klang/setvariance', 'POST', {
                    mix, channel: 3, attribute: 'visible', value: false,
                });
                assert(resp.body.ok === true, `mix ${mix}: expected ok:true, got ${JSON.stringify(resp.body)}`);
                await api.wait(400);
            }

            const { body: results } = await api.getResults({ device: 'klang_setvariance' });
            assert(results.length === otherMixes.length,
                `Expected ${otherMixes.length} recorded sends, got ${results.length}`);
            const gotMixes = results.map(r => r.mix).sort((a, b) => a - b);
            assert(JSON.stringify(gotMixes) === JSON.stringify([...otherMixes].sort((a, b) => a - b)),
                `Expected mixes ${otherMixes}, got ${gotMixes}`);
            assert(results.every(r => r.ok === true), 'Expected every recorded send to be ok:true');

            await clearOverride(api);
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
