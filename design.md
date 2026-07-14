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

Every `/cc/lights/gotocue` also fires the equivalent cue on the grandMA3 console: the lights execution tab emits `/cc/ma3/gotocue` through the message hub with `cue = ColorSource cue − 90` on sequence 3 (ColorSource cue 94 → MA3 `Go+ Sequence 3 Cue 4`). Cues below 91 have no MA3 equivalent and are not mirrored. The mirror is tapped **before** the `LightingEnabled` gate, so each console is gated independently (`LightingEnabled` for the ColorSource UDP, `MA3Enabled` for the MA3 UDP).

Most other `/cc/lights` commands (key, color, chanselect, look, level, huesat) exist to mimic features the grandMA3 UI provides natively and will not be carried forward. The intended end state is `LightingEnabled=false` / MA3 active, with `gotocue` the only cue-control command in use; the ColorSource implementation is then retired.

---

# Subsystem: grandMA3 Console (OSC)

## Overview

Controls a grandMA3 console by sending command-line text over OSC/UDP. Each message is an OSC packet to address `/cmd` with a single string argument, which the console executes as command-line input (the console's OSC "prefix" setting must be blank; if a prefix is configured on the console, it must be reflected in the `apply MA3 network config` node).

## Commands (`/cc/ma3/*`)

| msg.cmd | msg.parm | MA3 command sent | Description |
|---------|----------|------------------|-------------|
| `/cc/ma3/gotocue` | `{seq?, cue}` | `Go+ Sequence <seq> Cue <cue>` | Fire a specific cue. `seq` defaults to 3 (the CueCommander sequence) |
| `/cc/ma3/cmd` | `{text}` (or a plain string) | `<text>` verbatim | Direct command-line passthrough for anything not yet wrapped |
| `/cc/ma3/refreshconfig` | — | — | Re-fetch the console's IP/port from the data API |

Reserved for future implementation (documented so UI/hub callers can plan against them): `/cc/ma3/go {seq}`, `/cc/ma3/pause {seq}`, `/cc/ma3/goback {seq}`, `/cc/ma3/off {seq}`, `/cc/ma3/master {master, value}`. All follow the same pattern: translate to MA3 command-line text, send via `/cmd`.

## Network Configuration (data API)

The console's address is **not** stored in `global.config`; it is acquired from the avl_data API network table and cached:

```
GET http://uacts-g001:8002/network?asset_tag=demoma3
→ row with NIC == "NIC1"
→ ip = ip_address column
→ port = the osc entry in the services column ("osc:8000, web:80" → 8000)
→ cached as global.ma3_config {ip, port, asset_tag, nic, fetched_at}
```

The fetch runs at startup (inject, `once=true`) and on `/cc/ma3/refreshconfig`. Success and failure are both event-logged; on failure `global.ma3_config` is cleared and subsequent sends are skipped with an Error event (nothing is sent blind). The asset tag `demoma3` is temporary and will be replaced with a permanent tag later — it can be overridden without a flow edit via `global.ma3_asset_tag` (and `global.ma3_nic`).

## Execution Path

```
Message Hub → /cc/ma3 tab (link in → depth & flow → level-3 switch)
  gotocue / cmd → build MA3 command text
  → MA3Enabled gate (false blocks + logs; unset or true proceeds)
  → apply global.ma3_config (ip, port, topic=/cmd; missing config → Error log, no send)
  → OSC encode → UDP out → grandMA3
  (parallel: test interceptor 'ma3' at the UDP boundary; 'MA3 → ip:port /cmd <text>' Info log)
```

Every message arriving on the tab is logged ("message arrived"), as are unsupported commands (Error), config load results, disabled-gate drops, and each transmitted command.

## Test Support

The `interceptor: ma3` function beside the UDP-out node records `{device:'ma3', command, topic, host, port}` to `global.test_results` (read via `GET /api/results?device=ma3`). Tests inject a fake `global.ma3_config` through `POST /api/state` (`ma3_config`, `MA3Enabled`, and `LightingEnabled` are in the state API allowlist), so the suite runs without a console or a demoma3 network row.

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
