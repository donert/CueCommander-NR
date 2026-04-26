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
