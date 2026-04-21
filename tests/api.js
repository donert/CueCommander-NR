/**
 * Thin wrapper around the Node-RED HTTP API.
 * Used by all test case files.
 */
'use strict';

const http = require('http');

const BASE    = process.env.NR_HOST  || 'http://uacts-g001:1880';
const TOKEN   = process.env.API_TOKEN || 'vn-api-changeme';
const TIMEOUT = parseInt(process.env.API_TIMEOUT) || 5000;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url    = new URL(BASE + path);
    const data   = body ? JSON.stringify(body) : null;
    const opts   = {
      hostname: url.hostname,
      port:     url.port || 1880,
      path:     url.pathname + url.search,
      method,
      headers: {
        'X-Api-Token':   TOKEN,
        'Content-Type':  'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  /** Check that Node-RED is up and the API is reachable */
  async ping() {
    return request('GET', '/api/state');
  },

  /** Inject a command into the message hub */
  async sendCmd(cmd, extras = {}) {
    return request('POST', '/api/cmd', { cmd, ...extras });
  },

  /** Read global context values */
  async getState() {
    return request('GET', '/api/state');
  },

  /** Write global context values (test setup/teardown) */
  async setState(obj) {
    return request('POST', '/api/state', obj);
  },

  /** Query the SQLite event log */
  async getEventlog(opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit) params.set('limit', opts.limit);
    if (opts.since) params.set('since', opts.since);
    if (opts.cmd)   params.set('cmd',   opts.cmd);
    const qs = params.toString() ? '?' + params.toString() : '';
    return request('GET', '/api/eventlog' + qs);
  },

  /** Read interceptor captures */
  async getResults(opts = {}) {
    const params = new URLSearchParams();
    if (opts.device) params.set('device', opts.device);
    if (opts.since)  params.set('since',  opts.since);
    const qs = params.toString() ? '?' + params.toString() : '';
    return request('GET', '/api/results' + qs);
  },

  /** Clear interceptor captures */
  async clearResults() {
    return request('DELETE', '/api/results');
  },

  /** Wait ms milliseconds */
  wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  },
};
