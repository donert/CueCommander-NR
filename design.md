---
title: "CueCommander-NR Design"
---

# Intention

The primary intention of this software is to enable the integration of Audio, Visual and Lighting systems in a live performance environment, specifically mine.

The secondary purpose is to build a free platform for others the use. This is a huge challenge as every facility is different and has different hardware and software and different problems to solve.

# Why Node-RED?

Prior prototypes of this concept used different platforms. <https://nodered.org> was chosen because it provided an "event first" processing platform that provided a lot of capability. Second There was a good variety of available packages that provided useful functions. Finally, a healthy community that would enable long term stability.

# Big Idea

The core operating concept is that something can happen and as a result of that, an action taken. The event can be initiated by the UI, via an http API call, or can be detected via polling for a condition.

# Configuration

Device configuration is currently held in templates on the "settings" flow. There is a test and a production template. (In some future version of the code, these templates will be moved to external files, an perhaps an edit UI.) The two versions of the configuration enable development and testing in a different location than the production facility.

The current configuration is stored in the global.config context item.

# Standard Event Elements

| Element      | Description                                                                                                                                                     |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| msg.cmd      | The command to send to the target device, each device supports its own discrete set of command words. for example for Lighting, the command might be *gotocue*. |
| msg.parm     | A command may need more specific object upon which to act. For a lighting *gotocue* , we need to also specify the desired cue #.                                |
| msg.num      | Target devices can have multiple instances. For example video cameras or projectors. The *num* is used to direct the command to that particular instance.       |
| msg.event    |                                                                                                                                                                 |
| msg.level    | Values include info, warn, error                                                                                                                                |
| msg.category | Indicates the subsystem category of the event. Values include Projector, ProPresenter, Lights, Cameras, Video Mixer, Control.                                   |
| msg.millis   | Timestamp that the event was created.                                                                                                                           |
| msg.source   | Indicates the source of the event. Values include http, ui, internal                                                                                            |

# Current Limitations and Improvement Areas

There are several areas which need improvement, some of which have hard constraints.

1.  Configuration needs to be externalized from the source code. This is important if it is every to be used by anyone else.

2.  Use by others will also need the ability to allow the function to be more modular. Not everybody will have the same set of connected equipment and it would be good to turn functions on and off via configuration. For example maybe there needs to be a different module to support Canon cameras that is different from the Sony camera support. Somebody might have both.

3.  Some configuration nodes have hard-coded parameters (eg, the ATEM node), The ability to make that dynamic requires changes to that module.

4.  The code base has evolved and some of the design concepts are not well implemented and some re-factoring needs to occur to clean this up.

5.  Address the outstanding "TODO"s

6.  Implement the VISCA python package in native node-red (as a package? depends on modularity strategy )

7.  Maintaining persistent state is somewhat clunky - need to figure out a good way to manage current state information and have incoming events apply updates for the UI.

# Architecture Patterns

## Message Hub Pattern

All subsystem commands are routed through the `/cc Message Hub` tab. The hub uses a two-level switch:

1. First switch routes on `msg.cmd` prefix (e.g. `/cc/lights/`, `/cc/klang/`, `/cc/dlive/`) to the appropriate execution tab via link-out/link-in pairs.
2. Execution tabs translate the standard message into device-specific protocol (OSC, UDP, HTTP, etc.) and send it.

This decouples the UI layer from the execution layer. A UI tab fires a message with `msg.cmd` and `msg.parm` set; it has no knowledge of IP addresses, ports, or protocols.

### Standard Command Message Fields

| Field       | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| msg.cmd     | Command path, e.g. `/cc/lights/go`, `/cc/lights/gotocue`                   |
| msg.parm    | Command parameter, e.g. cue number for gotocue                             |
| msg.source  | Origin: `UI`, `http`, `internal`                                            |
| msg.millis  | Unix timestamp (ms) when the event was created                              |
| msg.depth   | Log verbosity level (1 = normal, 2 = verbose)                               |
| msg.flow    | Flow name where the message originated                                      |
| msg.level   | Severity: `Info`, `Warn`, `Error`                                           |
| msg.message | Human-readable log description                                              |

## UI / Execution Split

Each subsystem has two tabs:

- **UI tab** — Dashboard 2 widgets (`@flowfuse/node-red-dashboard`). Buttons, sliders, switches. No device addresses. Sends standard command messages to the message hub.
- **Execution tab** — Receives messages from the hub, applies network parameters from `global.config`, encodes and sends device protocol.

## Event Logging

All UI actions and execution events send a copy of the message to the event log pipeline via a link-out to the event log tab. The message must have `cmd`, `parm`, `source`, `millis`, `depth`, `flow`, `level`, and `message` populated before logging.

Events are stored in a SQLite database at `/tmp/sqlite` (table `eventlog`). Because `/tmp` is cleared on host reboot, the log is intentionally ephemeral. The `CREATE TABLE IF NOT EXISTS` inject on the UI Event Log tab fires automatically at startup (`once=true`) so the table always exists after a reboot or deploy; without it, inserts fail silently and `/api/eventlog` hangs.

`msg.depth` is not a fixed 1–4 severity scale — it increments by roughly 1 at every message-hub hop (UI/ProPresenter → hub → execution tab → hub → sent-confirmation log), so a command that mirrors across subsystems (e.g. a ProPresenter-driven `/cc/lights/gotocue` that mirrors to `/cc/ma3/gotocue` and then logs its own OSC-sent confirmation) can easily reach depth 5 or more by the time it's actually sent. The UI Event Log page's "Filter Depth" control (`SELECT based on filters`, `WHERE depth < filterdepth`) previously topped out at `"1,2,3,4"` (`filterdepth=5`, i.e. `depth ≤ 4`), with no way to see anything deeper — so the actual "OSC sent" confirmation log for a deeply-nested command was invisible in the UI even though it was correctly written to the database. Added an "All" option (`filterdepth=999999`) to the Filter Depth radio group so no depth is excluded.

# Subsystem: Lighting (ETC ColorSource)

## Overview

Controls an ETC ColorSource AV console via OSC over UDP. Full OSC command reference: https://support.etcconnect.com/ETC/Consoles/ColorSource/

## Commands

| msg.cmd                    | OSC topic sent                        | Description              |
|----------------------------|---------------------------------------|--------------------------|
| /cc/lights/go              | /cs/playback/go                       | Advance to next cue      |
| /cc/lights/goback          | /cs/playback/goback                   | Return to previous cue   |
| /cc/lights/pause           | /cs/playback/pause                    | Pause playback           |
| /cc/lights/gotocue         | /cs/playback/gotocue/{msg.parm}       | Jump to specific cue     |

## Execution Path (v2)

```
Dashboard 2 UI (UI Lights v2 tab)
  → msg.cmd = /cc/lights/{command}, msg.parm = {parameter}
  → Link Out → /cc Message Hub
  → Switch on /cc/lights/* → Link Out → /cc/lights execution tab
  → Gate: global.LightingEnabled
  → Inject network params from global.config.devices[category=Lights]
  → OSC encode (topic = /cs/playback/...)
  → UDP out → ColorSource console
```

## Configuration

Device IP and port are read from `global.config.devices` (first entry with `category == 'Lights'`). The gate `global.LightingEnabled` (boolean) must be true for commands to be sent.

## grandMA3 Mirroring and Deprecation Path

Every `/cc/lights/gotocue` also fires the equivalent cue on the grandMA3 console: the lights execution tab emits `/cc/ma3/gotocue` through the message hub with `cue = ColorSource cue` unchanged, on **sequence 1** (ColorSource cue 94 → MA3 `Goto Sequence 1 Cue 94`, 1:1, no offset). Every numeric cue mirrors — there is no lower threshold. The mirror is tapped **before** the `LightingEnabled` gate, so each console is gated independently (`LightingEnabled` for the ColorSource UDP, `MA3Enabled` for the MA3 UDP).

(An earlier design mirrored to sequence 3 with a `cue − 90` offset and skipped cues ≤ 90 — that mapping is out of date as of 2026-07-26; the MA3 show is now programmed on sequence 1 with cues matching ColorSource 1:1.)

Most other `/cc/lights` commands (key, color, chanselect, look, level, huesat) exist to mimic features the grandMA3 UI provides natively and will not be carried forward. The intended end state is `LightingEnabled=false` / MA3 active, with `gotocue` the only cue-control command in use; the ColorSource implementation is then retired.

---

# Subsystem: grandMA3 Console (OSC)

## Overview

Controls a grandMA3 console by sending command-line text over OSC/UDP. Each message is an OSC packet to address `//cmd/cmd` (note the doubled leading slash — confirmed literally against the console's own Console Monitor, not a typo) with a single string argument, which the console executes as command-line input. The console's OSC input "prefix" is configured as `/cmd` (not blank); combined with the `/cmd` command address, the console's OSC receiver expects the full path as `//cmd/cmd`. A bare `/cmd` was received and logged by the console's `OSCReceiver` but never reached `MainTask`, i.e. never executed; `//cmd/cmd` gets an `OK:<command>` response. If the console's prefix is ever changed, it must be reflected in the `apply MA3 network config` node.

## Commands (`/cc/ma3/*`)

| msg.cmd | msg.parm | MA3 command sent | Description |
|---------|----------|------------------|-------------|
| `/cc/ma3/gotocue` | `{seq?, cue}` | `Goto Sequence <seq> Cue <cue>` | Fire a specific cue. `seq` defaults to 3 (the CueCommander sequence) |
| `/cc/ma3/cmd` | `{text}` (or a plain string) | `<text>` verbatim | Direct command-line passthrough for anything not yet wrapped |
| `/cc/ma3/refreshconfig` | — | — | Re-fetch the console's IP/port from the data API |

`Goto` (not `Go+`) is the correct verb for jumping to an arbitrary cue by number — confirmed against the console's Console Monitor alongside a known-working command fired from Companion (`Goto Sequence 1 Cue 95` → console responds `OK:Goto Sequence 1 Cue 95`); `Go+ Sequence <seq> Cue <cue>` was received but silently produced no `OK:` response.

Reserved for future implementation (documented so UI/hub callers can plan against them): `/cc/ma3/go {seq}`, `/cc/ma3/pause {seq}`, `/cc/ma3/goback {seq}`, `/cc/ma3/off {seq}`, `/cc/ma3/master {master, value}`. All follow the same pattern: translate to MA3 command-line text, send via `//cmd/cmd`.

## Network Configuration (data API)

The console's address is **not** stored in `global.config`; it is acquired from the avl_data API network table and cached:

```
GET http://127.0.0.1:8002/network?asset_tag=2607-2500
→ row with NIC == "LAN1"
→ ip = ip_address column
→ port = the osc entry in the services column ("osc:8000, web:80" → 8000)
→ cached as global.ma3_config {ip, port, asset_tag, nic, fetched_at}
```

The fetch runs at startup (inject, `once=true`) and on `/cc/ma3/refreshconfig`. Success and failure are both event-logged; on failure `global.ma3_config` is cleared and subsequent sends are skipped with an Error event (nothing is sent blind). The asset tag `2607-2500` is the permanent tag for this console; it can still be overridden without a flow edit via `global.ma3_asset_tag` (and `global.ma3_nic`) for testing or if the console is re-tagged later.

The avl_data host defaults to `127.0.0.1:8002` — avl_data runs co-located with Node-RED, matching the convention used by `avltechassistant/backend` (`AVL_DATA_URL`, default `http://localhost:8002`). It is overridable via `global.ma3_config_host` without a flow edit, so a different deployment topology never requires hand-editing the function's code (an earlier version hardcoded a VPN hostname, `uacts-g001`, which resolved unreliably from the same box and had to be patched directly on the deployment machine — the override exists so that never has to happen again).

The default tag and host each live in exactly one place — the `DEFAULT_MA3_ASSET_TAG` / `DEFAULT_AVL_DATA_HOST` constants in the `build config request` function, which resolves both and stamps the tag onto `msg.ma3_tag` before the HTTP call. `parse ma3 config` reads `msg.ma3_tag` (its own literal fallback is a defensive backstop only, in case that function is ever invoked without going through `build config request`, and must be kept in sync with the constant above). Keeping the resolution in one node was a deliberate fix — the tag used to be hardcoded separately in both functions, so changing it in one place could silently leave the other stale.

`build config request` builds the URL with plain string concatenation (`'http://' + host + '/network?asset_tag=' + encodeURIComponent(tag)`), not the `URL`/`URLSearchParams` classes — Node-RED's Function node sandbox does not expose the global `URL` constructor, and using it throws `ReferenceError: URL is not defined` at deploy/run time.

## Execution Path

```
Message Hub → /cc/ma3 tab (link in → depth & flow → level-3 switch)
  gotocue / cmd → build MA3 command text
  → MA3Enabled gate (false blocks + logs; unset or true proceeds)
  → apply global.ma3_config (ip, port, topic=//cmd/cmd; missing config → Error log, no send)
  → OSC encode → UDP out → grandMA3
  (parallel: test interceptor 'ma3' at the UDP boundary; 'MA3 → ip:port //cmd/cmd <text>' Info log)
```

Every message arriving on the tab is logged ("message arrived"), as are unsupported commands (Error), config load results, disabled-gate drops, and each transmitted command.

## Test Support

The `interceptor: ma3` function beside the UDP-out node records `{device:'ma3', command, topic, host, port}` to `global.test_results` (read via `GET /api/results?device=ma3`). Tests inject a fake `global.ma3_config` through `POST /api/state` (`ma3_config`, `MA3Enabled`, and `LightingEnabled` are in the state API allowlist), so the suite runs without a console or a 2607-2500 network row.

---

# Subsystem: ProPresenter Cue Automation (Prop Name Routing)

## Overview

Polls the ProPresenter data API for the currently active Props on the `Propresenter Cue Automation` tab (group "Fire Cue based on Prop Name") and lets a single Prop's *name* encode one or more automation commands. This is a separate mechanism from the standard `/cc/*` UI buttons — it lets a ProPresenter operator trigger lighting, ATEM, or MA3 actions just by which Prop is currently active on a slide, with no extra button press.

## Naming Convention

A Prop name is a comma-separated list of segments: a `prefix:value` segment optionally followed by a second, plain-text segment with no prefix, which is a human-readable label only and is dropped (e.g. `Lq:170.0,Red White`, `Lq:80.0,Special 80`). A Prop can also carry a `Ma3cmd:<text>` segment on its own to send raw MA3 command text. Each segment is routed independently by prefix:

| Prefix     | Handler                          | Result                                                        |
|------------|-----------------------------------|----------------------------------------------------------------|
| `Lq:`      | Handle Lq                        | `/cc/lights/gotocue` with the text after `Lq:` as `parm`        |
| `Vq:`      | Handle Vq                        | Formats for ATEM                                                |
| `Pq:`      | Handler pq                       | Prop processor                                                  |
| `Lp:`      | Handle Lp                        | Lighting playback                                               |
| `Ma3cmd:`  | Handle Ma3cmd                    | `/cc/ma3/cmd` with the text after `Ma3cmd:` as `parm` (verbatim passthrough to the MA3 command line, see `MA-03`) |
| *(no prefix)* | — (dropped)                    | Descriptive label only, e.g. the `Red White` in `Lq:170.0,Red White` |

## Execution Path

```
Poll ProPresenter /props (every 100ms, gated by global.ProPresenterEnabled)
  → filter payload.id.name where is_active == true
  → split (one message per active Prop)
  → 'Select name': payload = payload.id.name; propname = payload (full name, captured once)
  → comma split on payload → one message per segment, propname unchanged on every copy
  → 'route to handler' switch (checkall=true) on payload, matches ANY segment whose text
    contains a known prefix → fans out to the corresponding handler group
  → each handler builds its own /cc/* command from THIS segment and sends it via
    the message hub (Link Out → 'from ProP Cue Auto' / 'out to MH')

  (parallel, every segment, any prefix) → 'from Prop Processor' → 'auto prop clear' link in
    → 'switch on payload' (same 5 prefixes, checkall=true) → 'set cmd and parm' template:
      payload = {cmd: "propclear", parm: propname}   (note: propname, the FULL original name)
    → 'pro7 cmd' link in → promotes payload.cmd/parm to msg.cmd/msg.parm
    → 'switch cmd' → 'fmt prop clear by name': payload = "/prop/" + msg.parm + "/clear"
    → 'To PP7 Communications' — tells ProPresenter itself to clear the prop
```

## Known Hazard: auto-clear must never reach MA3

The "auto prop clear" mechanism above exists purely to tell **ProPresenter** to clear a prop after it's been processed — it has nothing to do with MA3. Its output link-out, `from pp7 Rq Handler`, correctly targets `To PP7 Communications`, but until 2026-07-26 it *also* targeted `handle ma3cmd` (the same link-in the legitimate `Ma3cmd:` router uses). Because `handle ma3cmd` unconditionally sets `cmd = /cc/ma3/cmd`, **every** auto-clear — for a `Lq:`, `Vq:`, `Pq:`, `Lp:`, or `Ma3cmd:` prop, regardless of which — fired a bogus OSC message at the grandMA3 console built from a fragment of the `/prop/<name>/clear` HTTP path (cut at the first colon, e.g. `/prop/Lq:170.0,Red White/clear` → `170.0,Red White/clear`). The fix was to remove the cross-wire: `from pp7 Rq Handler` now links only to `To PP7 Communications`, and `handle ma3cmd` now links only from `link out 86` (the genuine `Ma3cmd:` router). If a link-in node in this tab ever needs a new source wired in, check what it *unconditionally* does downstream first — `handle ma3cmd` has no per-source filtering, so anything routed into it becomes an MA3 command.

The `switch on payload` gate ahead of `set cmd and parm` is the only thing that limits auto-clear to the five known prefixes: it has 5 `contains` rules and no catch-all/`else` rule, so a segment matching none of them produces zero outputs and is silently dropped, never reaching `set cmd and parm` at all — this is the enforcement point for PC-05, and it was already correct. However, the group also contained a second, orphaned `change` node (`$replace(propname, "&#x2F", '/')`) wired directly into `set cmd and parm`, bypassing this gate entirely. It had no inputs of its own — it couldn't fire — but it was exactly the kind of stray, filter-bypassing wire that turned into a real bug once already in this tab (the `handle ma3cmd` cross-wire above). It was removed on 2026-07-26 rather than left as a latent trap for a future edit to accidentally reconnect.

## Known Hazard: build the command from `msg.payload`, not `msg.propname`

Because `comma split` only replaces `msg.payload`, every split-out message still carries the *original, full, pre-split* Prop name in `msg.propname`. A handler that reads `msg.propname` to extract "the text after my prefix" is not reading its own segment — it is reading the whole Prop name from its own prefix's first colon onward, which silently includes any later comma-separated segments that belong to *other* handlers.

This caused a real bug: `Handle Ma3cmd`'s `parm` node used `$substringAfter(msg.propname, ":")`. For a Prop named `Ma3cmd:200.0,Green`, that produced `parm = "200.0,Green"` — sent verbatim as an MA3 command line, which is meaningless to the console. `Handle Lq` was never affected because it already used `$substring(msg.payload, 3)` — the current segment. The fix was to change the Ma3cmd handler to read from `msg.payload` as well (`$substringAfter(msg.payload, ":")`), matching the pattern already used by `Handle Lq`. Any new prefix handler added to this group must build its command from `msg.payload`, never `msg.propname`.

---

# Subsystem: Klang (Personal Monitoring) — Mix Consistency Dashboard

## Overview

Every Klang mix (up to 16, one per personal-monitor user) maintains its own copy of channel name/mute/visible/solo state on the Konductor. Operators can drift these out of sync (typo a name on one mix, leave a channel visible on another). The "sweep" (`kl_conn_fn`, triggered by `POST /api/klang/buildconsensus`) visits each mix via `SwitchUser`, records its channel state, and computes a per-attribute plurality consensus (`TC-KL-02`). The avltechassistant operational dashboard's Mix Consistency panel (`GET /dashboard/klang`, proxying `GET /api/klang/reportmixvariances`) surfaces the resulting variances with two write actions per row: **Set this to** (adopt the consensus value on the deviating mix) and **Set all others to** (propagate that mix's actual value to the other 15) — see `avltechassistant/requirements.md` for the dashboard UI and `avltechassistant/backend/main.py`'s `/dashboard/klang*` routes, which are thin proxies to the endpoints below.

## Commands

Both dashboard write actions call the same endpoint:

| msg.cmd / HTTP | parm / body | Description |
|---|---|---|
| `POST /api/klang/setvariance` | `{mix, channel, attribute, value}` | Sets one mix's one channel attribute. `attribute` is `name`, `mute`, `visible`, or `solo`. |

## Execution Path

```
POST /api/klang/setvariance {mix, channel, attribute, value}
  → kl_api_sv_fn: validate mix/channel/attribute
  → build SwitchUser + attribute-SET OSC packets (raw, hand-built — not the OSC-encode node)
  → send SwitchUser over a dgram socket created in the function
  → wait 250ms (SwitchUser must settle before the console accepts the SET)
  → send SET over the same socket
  → record the attempt (ok/error) to global.test_results, device 'klang_setvariance'
  → respond 200 {ok:true, ...} on success, 502 {ok:false, error} on send failure
```

## Known Hazard: an unwired output reports success while sending nothing

Until 2026-07-28, `kl_api_sv_fn` built both OSC packets and sent them via `node.send()` to its first output — but that output's `wires` array was `[]`. The packets were built, logged via `node.warn()` (so debug output looked normal), and then discarded; nothing ever reached the Konductor. The second output (the HTTP response) *was* wired correctly and always sent `{ok:true}` immediately, before the (silently dropped) sends would even have completed. Both dashboard write buttons called this same function, so both were affected identically — the bug was reported via "Set all others to" (14 changes at once made the non-effect obvious) but would have equally affected the single-mix "Set this to" button.

The fix does not restore that wire. Instead `kl_api_sv_fn` now owns a `dgram` socket directly (declared via the function node's `libs`, the same mechanism already used elsewhere in this flow for `fs` — see the Assignment Management file-I/O functions) so a real send failure is detectable and can be reported to the caller as `ok:false` with an error, per KL-07. A wired-but-silent output can't do that: Node-RED's core `udp out` node has zero outputs, so there is no message-based path for a downstream send failure to ever reach back into the flow. Any future write path that needs to report send success/failure to its caller should follow this pattern (own the socket, don't delegate to a terminal `udp out` node) rather than trying to retrofit feedback onto one.

`klang_konductor_override` (global, `{ip, port}`) lets tests point this specific endpoint's Konductor target without touching the real `parameters` device config array — checked first in `kl_api_sv_fn`, falling back to the real config when unset. It round-trips through `GET`/`POST /api/state` so the test runner's automatic per-test save/restore covers it like `ma3_config`.

---

# Subsystem: Shure Receiver Channel Names

## Overview

Pushes vocalist names to Shure wireless receivers (ULX-D family) so each receiver channel's front-panel display shows who is on that mic. Uses the Shure TCP command protocol (`< SET n CHAN_NAME {name} >`), default port 2202.

## Commands (`/cc/shure/*`)

| msg.cmd | msg.parm | Description |
|---------|----------|-------------|
| `/cc/shure/setnames` | — | Bulk push: for every row of `global.input_map` with a `shure` config, derive the channel name and emit one `/cc/shure/setonename` per row via the message hub |
| `/cc/shure/setonename` | `{host, port, devch, chname}` | Set one receiver channel's name. `port` defaults to 2202 when absent |

## Channel Name Derivation

For each `input_map` row: `chname = substring(vocal_name, 0, 6) + last-2-of(mic_name)` (e.g. vocal `Brandy`, mic `HH02` → `Brandy02`). Rows with `active = false` contribute the number only. Rows without a `shure` config are skipped.

## Execution Path

```
Assignment Manager UI (Shure button)
  → msg.cmd = /cc/shure/setnames
  → Link Out → /cc Message Hub → /cc/shure tab
  → load global.input_map → split rows → filter rows with shure config
  → derive chname, host (row shure.ip), port (row shure.port, default 2202)
  → msg.cmd = /cc/shure/setonename, msg.parm = {host, port, devch, chname}
  → Link Out → /cc Message Hub → /cc/shure tab
  → build "< SET {devch} CHAN_NAME {chname} >" from parm
  → TCP request (msg.host / msg.port) → receiver
```

Routing every per-channel set back through the hub (rather than short-circuiting inside the tab) keeps each device command addressable, logged, and interceptable by the test harness. The test interceptor sits beside the TCP node in the Shure Communications group, so `/api/results` captures exactly what is sent on the wire.

## Row Data Contract

`input_map` rows that should receive a name push carry:

```json
{ "mic_name": "HH02", "vocal_name": "Brandy", "shure": { "ip": "192.168.0.177", "ch": 2, "port": 2202 } }
```

`shure.port` is optional (defaults to 2202). Saved assignment files typically omit it.

## Known Hazard: Editable Table passthrough

The Editable Table `ui-template` has `passthru = true`, so any message sent *into* the widget is forwarded to its output wire, which feeds `store on publish` (`global.input_map = msg.payload`). Messages injected into the table (e.g. the startup service-title init) must therefore never carry a non-array `payload`. A `payload is array` switch guards the table output as a second line of defence.

---

# Subsystem: Assignment Management

## Overview

Replaces the fixed Save 1 / Save 2 / Recall 1 / Recall 2 / Recall Defaults buttons on the UI Assignments page with a generic table-driven file manager. The subsystem is cross-cutting — it persists and restores the shared mic/pack assignment state used by dLive, Klang, Reaper, and Shure renaming flows.

## File Format

Each saved service is a JSON file:

```json
{
  "service_title": "2026-04-27 Mic and Pack Assignments",
  "input_map": [ ... ],
  "saved_at": 1745712345678
}
```

`service_title` is the human-readable display name, independent of the filename. `saved_at` is a Unix millisecond timestamp written on every save or update.

## File Naming

| File | Naming Rule |
|------|-------------|
| User-created services | `input_map_<uuid>.json` — UUID generated at save time |
| Defaults | `input_map_defaults.json` — fixed name, never written by the UI |

All files live in `~/Documents/UACTech/SystemDocumentation/github/uactechdoc/krd_automatin/`.

> **Future work:** this directory should be moved to a more appropriate location and made configurable.

## Commands (`/cc/assignments/*`)

| msg.cmd | msg.parm | Description |
|---------|----------|-------------|
| `/cc/assignments/list` | — | Scan directory; return array of `{filename, service_title, saved_at}` for all `input_map_*.json` files |
| `/cc/assignments/save` | `{service_title}` | Write current `global.input_map` + provided title to a new `input_map_<uuid>.json` |
| `/cc/assignments/update` | `{filename, service_title}` | Overwrite named file with current `global.input_map` + provided title |
| `/cc/assignments/delete` | `{filename}` | Delete named file; refuses if filename is `input_map_defaults.json` |
| `/cc/assignments/recall` | `{filename}` | Read file; load `input_map` and `service_title` into global working state |
| `/cc/assignments/recall_defaults` | — | Read `input_map_defaults.json`; load into global working state |

## Execution Path

```
UI Assignments tab
  → toolbar action (Save New / Update / Delete / Recall / Recall Defaults)
  → msg.cmd = /cc/assignments/{command}, msg.parm = {parameters}
  → Link Out → /cc Message Hub
  → Switch on /cc/assignments/* → Link Out → /cc/assignments execution tab
  → Function node: file I/O (fs read/write/unlink via node-red file nodes)
  → On completion: emit /cc/assignments/list to refresh table
  → Link Out → Event Log
```

## UI Layout — UI Assignments Tab

### Toolbar (top of page)
Single `ui-group` row containing:
- **Save New** — saves current state as a new file
- **Update** — overwrites the currently recalled file (disabled when no file is recalled)
- **Print** — prints the current assignment sheet
- **Send → Klang** | **Send → Shure** | **Send → dLive** | **Send → Reaper** — existing send-update actions, consolidated here from the former "Send Updates" section

### Assignment Table
`ui-table` (Dashboard 2) below the toolbar. Columns:

| Column | Content |
|--------|---------|
| Service Title | `service_title` from file |
| Saved | `saved_at` formatted as local date/time |
| Actions | Recall · Update · Delete per row (Defaults row: Recall only) |

Row selection triggers a recall. The Defaults row is visually distinguished (e.g., italic or muted colour) and exposes only the Recall action.

### Service Title Field
Editable text input below the toolbar, pre-populated on recall and on page load (auto-generated next-Sunday date string). Editing this field updates working state only; it does not auto-save.

## State Management

| Global variable | Set by | Read by |
|----------------|--------|---------|
| `global.input_map` | recall, recall_defaults | send-update commands, save, update |
| `global.service_title` | recall, recall_defaults, UI edit | save, update, UI display |
| `global.recalled_filename` | recall | update (to know which file to overwrite) |

`global.recalled_filename` is `null` after a Recall Defaults or on fresh load, which disables the Update button.
