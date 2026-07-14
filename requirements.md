---
title: "CueCommander-NR Requirements"
---

# Overview

This document captures functional requirements and test cases for CueCommander-NR. It is a living document; subsystems are added as they are implemented or refactored.

---

# Subsystem: Lighting (ETC ColorSource)

## Functional Requirements

... [LT-01 to LT-09 unchanged] ...

---

## Test Cases

### TC-LT-01 — Go command routes correctly
**Method:** API / Debug  
**Status: MISSING**  
**Steps:**
1. POST `{"cmd":"/cc/lights/go","parm":null,"source":"test"}` to the NR HTTP hub endpoint.
2. Read the capture results for the lighting device.  
**Expected:** Capture contains OSC `/cs/playback/go`.

... [TC-LT-02 to TC-LT-07 unchanged] ...

### TC-LT-08 — gotocue mirrors to grandMA3
**Method:** API  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:**
1. Set `LightingEnabled=false` (so no real ColorSource traffic) and a test `ma3_config`.
2. Send `/cc/lights/gotocue` with `parm=94`, then with `parm=12`.
3. Read MA3 captures.  
**Expected:** Cue 94 produces exactly one MA3 capture `Go+ Sequence 3 Cue 4`; cue 12 (below 91) produces none.

---

# Subsystem: grandMA3 Console (OSC)

## Functional Requirements

**MA-01** — All communication destined for a grandMA3 console shall be handled by the `/cc/ma3` execution tab, reached through the message hub with commands prefixed `/cc/ma3/`.

**MA-02** — `/cc/ma3/gotocue` with `parm {seq?, cue}` shall send the console command-line text `Go+ Sequence <seq> Cue <cue>` (seq defaults to 3) as an OSC message to address `/cmd`.

**MA-03** — `/cc/ma3/cmd` with `parm {text}` shall send the text verbatim to the console command line (direct passthrough for future use).

**MA-04** — Every `/cc/lights/gotocue` shall, in parallel with the ColorSource send, emit `/cc/ma3/gotocue` via the message hub with `cue = ColorSource cue − 90` on sequence 3 (CS cue 94 → MA3 seq 3 cue 4). Cues ≤ 90 are not mirrored. The mirror shall not depend on `LightingEnabled` (each console is gated independently; the ColorSource path will eventually be disabled in favour of MA3).

**MA-05** — The console's IP and OSC port shall be acquired from the avl_data API network table: asset tag `demoma3` (temporary tag, overridable via `global.ma3_asset_tag`), NIC `NIC1`, IP from the IP column, port from the `osc:<port>` entry of the services column (e.g. `"osc:8000, web:80"` → 8000). The result is cached in `global.ma3_config`, refreshed at startup and on `/cc/ma3/refreshconfig`.

**MA-06** — If no valid configuration is available, nothing shall be sent and an Error event shall be logged. `global.MA3Enabled=false` shall block sends with an Info event; unset or true sends.

**MA-07** — All `/cc/ma3` actions shall produce event log records: message arrival, command transmission, config load success/failure, disabled-gate drops, and unsupported commands (Error).

---

## Test Cases

### TC-MA-01 — gotocue builds the correct MA3 command
**Method:** API  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:**
1. Set a test `ma3_config` via `/api/state`; clear captures.
2. Send `/cc/ma3/gotocue` with `parm {cue: 4}`, then with `parm {seq: 5, cue: 2}`.  
**Expected:** Captures `Go+ Sequence 3 Cue 4` and `Go+ Sequence 5 Cue 2`, OSC address `/cmd`, host/port from `ma3_config`.

### TC-MA-02 — direct cmd passthrough
**Method:** API  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:** Send `/cc/ma3/cmd` with `parm {text: "Off Sequence 3"}`.  
**Expected:** Capture contains exactly `Off Sequence 3`.

### TC-MA-03 — lights gotocue mirror and cue mapping
**Method:** API  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:** As TC-LT-08.  
**Expected:** CS cue n ≥ 91 → one MA3 capture `Go+ Sequence 3 Cue (n−90)`; cues ≤ 90 produce no MA3 traffic.

### TC-MA-04 — missing config blocks the send and logs an Error
**Method:** API / Event Log  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:** Set `ma3_config=null`; send `/cc/ma3/gotocue {cue:1}`.  
**Expected:** Zero captures; Error event "MA3 send skipped — no network config".

### TC-MA-05 — MA3Enabled gate
**Method:** API / Event Log  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:** Set `MA3Enabled=false`; send `/cc/ma3/cmd {text:"Clear"}`.  
**Expected:** Zero captures; Info event noting MA3 is disabled.

### TC-MA-06 — unsupported command logs an Error
**Method:** API / Event Log  
**Status: VERIFIED** (via `tests/cases/ma3.js`)  
**Steps:** Send `/cc/ma3/bogus`.  
**Expected:** Error event "Unsupported command: /cc/ma3/bogus".

### TC-MA-07 — config fetched from the data API network table
**Method:** Manual  
**Status: PENDING** (blocked: no `demoma3` row exists in the network table yet)  
**Steps:**
1. Add a network row: asset tag `demoma3`, NIC `NIC1`, the console's IP, services containing `osc:<port>`.
2. Send `/cc/ma3/refreshconfig` (or restart Node-RED).  
**Expected:** Info event "MA3 config loaded: ip:port (demoma3/NIC1)"; `global.ma3_config` populated; a subsequent `/cc/ma3/cmd` reaches the console.

---

# Subsystem: Event Log

... [EL-01 to EL-03 unchanged] ...

---

## Test Cases

### TC-EL-01 — Startup defaults are active
**Method:** Manual / API  
**Status: PARTIAL** (Verified via `tests/cases/event_log.js`)
**Steps:**
1. Deploy or restart Node-RED.
2. Query `/api/eventlog` with no params.  
**Expected:** Returns status 200 and array of recent logs.

... [TC-EL-02 unchanged] ...

### TC-EL-03 — eventlog table auto-created at startup
**Method:** Manual / API  
**Status: VERIFIED** (manually on uacts-g001, 2026-07-09)  
**Steps:**
1. Remove the event log database (`/tmp/sqlite` on the production host is cleared by a reboot).
2. Restart or redeploy Node-RED.
3. Query `/api/eventlog` and press any logged UI action.  
**Expected:** `/api/eventlog` returns 200 with an array (it must not hang), and new events insert successfully. The `CREATE TABLE IF NOT EXISTS` inject fires automatically at startup (`once=true`, 2 s delay); no manual "Create Table" click is required.

---

# Subsystem: Message Hub

... [MH-01 to MH-04 unchanged] ...

---

## Test Cases

### TC-MH-01 — Routing to correct subsystem
**Method:** API / Debug  
**Status: MISSING**  
**Steps:**
1. Inject a message with `msg.cmd = "/cc/lights/go"`.
2. Observe the message arriving at the Lights execution tab (via capture).  
**Expected:** Message is correctly routed based on its prefix.

---

# Subsystem: Klang (Personal Monitoring)

... [KL-01 to KL-05 unchanged] ...

---

## Test Cases

### TC-KL-01 — Mute channel produces correct command
**Method:** Manual / API  
**Status: MISSING** (Rename is covered in `active_status.js`, but functional Mute is not).
**Steps:**
1. Send `/cc/klang/mixchmute` via Hub API.
2. Verify Klang capture shows `/mute` OSC message.

### TC-KL-02 — Build Consensus (Sweep) completion
**Method:** API  
**Status: VERIFIED** (via `tests/cases/klang_consensus.js`)

---

# Subsystem: Console Renaming (dLive, Reaper, Shure)

... [RN-01 to RN-03 unchanged] ...

**RN-04** — `/cc/shure/setnames` shall emit one `/cc/shure/setonename` hub command per `input_map` row that has a `shure` config, with `msg.parm = {host, port, devch, chname}`. Per-channel commands route through the message hub (not a direct in-tab link) so they are individually logged and interceptable.

**RN-05** — The Shure TCP port shall be taken from the row's `shure.port` when present and default to **2202** when absent. Saved assignment files typically omit the port.

**RN-06** — Sending names must not depend on manual editor actions after a restart: `global.input_map` shall survive Node-RED startup initialization (see TC-AM-16).

---

## Test Cases

### TC-RN-01 — Bulk push routes to all subsystems
**Method:** Manual / API  
**Status: VERIFIED** (via `tests/cases/active_status.js`)

### TC-RN-02 — Shure port defaults to 2202 when the row omits it
**Method:** API  
**Status: VERIFIED** (via `tests/cases/shure_port.js`)  
**Steps:**
1. Set `input_map` to a single row with `shure: {ip, ch}` and **no** `port` field.
2. Send `/cc/shure/setnames` via the hub API.
3. Read the Shure capture results.  
**Expected:** Exactly one capture with `port == 2202` and the row's `ip` as host.

### TC-RN-03 — Shure per-channel commands route through the hub
**Method:** API / Event Log  
**Status: VERIFIED** (via `tests/cases/shure_port.js`)  
**Steps:**
1. Set `input_map` to N rows with `shure` configs.
2. Send `/cc/shure/setnames` via the hub API.
3. Read the capture results and query `/api/eventlog?cmd=/cc/shure/setonename`.  
**Expected:** N captures of the form `< SET {ch} CHAN_NAME {name} >` at the TCP boundary; N `/cc/shure/setonename` event log entries; zero "Unsupported command" errors.

---

# Subsystem: PTZ Cameras (VISCA over IP)

... [CM-01 to CM-04 unchanged] ...

---

## Test Cases

### TC-CM-01 — Recall preset routes correctly
**Method:** OSC / API  
**Status: MISSING**

... [TC-CM-02 unchanged] ...

---

# Subsystem: Projectors (PJLink)

... [PR-01 to PR-05 unchanged] ...

---

## Test Cases

### TC-PR-01 — Power on command routes correctly
**Method:** Manual / API  
**Status: MISSING**

... [TC-PR-02 unchanged] ...

---

# Subsystem: PTZ Cameras (VISCA over IP)

## Functional Requirements

### CM-01 — Multi-Camera Control
The system shall support controlling multiple PTZ cameras (e.g., CAM1, CAM2, CAM3) using the VISCA over IP protocol via an OSC-to-VISCA bridge (`oscToPTZ.py`).

### CM-02 — Movement and Zoom
The UI shall provide controls for Pan/Tilt (8 directions + stop) and Zoom (In, Out, Stop) for the selected camera.

### CM-03 — Preset Management
The system shall support storing and recalling up to 8 presets (0-7) per camera.

### CM-04 — Power and Tally
The system shall provide controls for Camera Power (On/Off) and Tally Light (On/Off) states.

---

## Test Cases

### TC-CM-01 — Recall preset routes correctly
**Method:** OSC  
**Steps:**
1. Send OSC message `/camera/1/recall/2` to port 54001.
2. Observe `oscToPTZ.py` logs.  
**Expected:** Log shows "Camera 1 Command recall Address /camera/1/recall/2"; VISCA command for preset 2 is sent to Cam 1.

### TC-CM-02 — Diagonal movement command
**Method:** OSC  
**Steps:**
1. Send OSC message `/camera/2/upleft`.  
**Expected:** Camera 2 moves diagonally up and left.

---

# Subsystem: Projectors (PJLink)

## Functional Requirements

### PR-01 — Multi-Projector Support
The system shall support controlling multiple projectors (e.g., East, Centre, West, Rear) using the PJLink protocol on port 4352.

### PR-02 — Power and Input Control
The UI shall provide controls to turn projectors On/Off and switch between available inputs.

### PR-03 — Status Polling
The system shall periodically poll projectors for their current status, including power state, active input, and lamp hours.

### PR-04 — Projector Enable Gate
No commands shall be sent to projectors unless `global.ProjectorsEnabled` is `true`.

### PR-05 — UI Status Table
The dashboard shall display a table showing the real-time status of all configured projectors, including their name, power state, input, and lamp life.

---

## Test Cases

### TC-PR-01 — Power on command routes correctly
**Method:** Manual / API  
**Steps:**
1. Click "Power On" for the Centre projector in the UI.
2. Verify a command with `num=1` (Centre) and `cmd=poweron` (or equivalent) is processed.  
**Expected:** Centre projector receives PJLink power-on command; event log records the action.

### TC-PR-02 — Gate blocks power command
**Method:** Manual  
**Steps:**
1. Set `global.ProjectorsEnabled = false`.
2. Attempt to turn on a projector.  
**Expected:** No network command is sent; event log may show "Projector communication disabled".

---

# Subsystem: Assignment Management

## Overview

The Assignment Management subsystem allows the user to save, recall, update, and delete named sets of microphone/pack assignment settings (the `input_map` and `service_title` fields). It replaces the fixed Save 1 / Save 2 / Recall 1 / Recall 2 / Recall Defaults buttons on the UI Assignments page with a generic table-driven interface.

The subsystem spans the UI Assignments tab (frontend) and a new `/cc/assignments` execution tab (backend file I/O).

---

## Functional Requirements

### AM-01 — Assignment Table
The UI shall display a table listing all saved assignment files. Each row shall show the service title and the date/time the file was last saved. The table shall be refreshed whenever a save, update, or delete operation completes.

### AM-02 — Save New Service
The user shall be able to save the current `input_map` and `service_title` as a new named service. Before saving, the service title shall be editable. On initiation the title shall be pre-populated with the auto-generated next-Sunday date string (current behaviour). Saving shall create a new file named `input_map_<uuid>.json` in the assignments directory.

### AM-03 — Recall Service
The user shall be able to recall a saved service by selecting its row in the table. Recalling shall load the `input_map` and `service_title` into the active working state. After recall the service title shall remain editable without affecting the saved file.

### AM-04 — Update Service
The user shall be able to overwrite an existing service file with the current working state and the current service title. Update shall be available for any user-created service but not for the defaults file.

### AM-05 — Delete Service
The user shall be able to delete a saved service file. A confirmation step is required before deletion. Delete shall not be available for the defaults file.

### AM-06 — Recall Defaults
A dedicated "Recall Defaults" action shall load `input_map_defaults.json`. The defaults file shall not be updatable or deletable through the UI.

### AM-07 — Editable Service Title
The service title shall be editable at all times: on fresh page load, after a recall, and after a save. Editing the title in the UI updates only the working state; it does not automatically overwrite the source file.

### AM-08 — File Storage Location
All assignment files shall be stored in `~/Documents/UACTech/SystemDocumentation/github/uactechdoc/krd_automatin/`. The defaults file shall be named `input_map_defaults.json`. User-created files shall be named `input_map_<uuid>.json`.

### AM-09 — File Contents
Each assignment file shall be a JSON object containing:
- `service_title` — human-readable name (string)
- `input_map` — array of mic/pack assignment records
- `saved_at` — Unix timestamp (ms) of when the file was last written

### AM-10 — Consolidated Action Toolbar
The UI Assignments page shall have a single toolbar containing: **Save New**, **Update**, **Print**, **Send → Klang**, **Send → Shure**, **Send → dLive**, **Send → Reaper**. The existing separate "Send Updates" button group and standalone Print button shall be removed.

### AM-11 — Backend Execution Tab
File I/O shall be handled by a `/cc/assignments` execution tab. The hub shall route `/cc/assignments/*` commands to this tab. Commands are: `list`, `save`, `update`, `delete`, `recall`, `recall_defaults`.

### AM-12 — Editable Table Active Toggle Is Row-Isolated
The Editable Table shall provide a per-row Active toggle. Toggling one row's Active state shall affect only that row; no other row's visual state or data shall change as a side effect. Each row must carry a stable identity token (`_uid`) assigned when the payload is received so that Vue's virtual DOM can track rows correctly through sort reorders.

### AM-13 — Editable Table Default Sort: Active Rows First
The Editable Table shall default to sorting with active (checked) rows at the top of the list. This sort shall apply on initial data load and shall be preserved until the user explicitly changes the sort column.

---

## Test Cases

### TC-AM-01 — Table populates on page load
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Navigate to the Assignments dashboard page.  
**Expected:** Table populates automatically (no manual refresh needed). Shows one row per `input_map_*.json` file in `/Users/avuser/uacdata/`. The `input_map_defaults.json` row displays "Defaults" (not the raw filename) with only a Recall button. User-created rows show service title and saved-at timestamp with Recall and Delete buttons; the currently-recalled row also shows Update.

### TC-AM-02 — Save new service creates file
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Ensure the service title field is populated (auto-generated or edited).
2. Click **Save New** in the toolbar.
3. Check `/Users/avuser/uacdata/`.  
**Expected:** A new `input_map_<uuid>.json` file exists containing `service_title`, the current `input_map`, and a non-zero `saved_at` timestamp. The table refreshes and shows the new row. An event log entry is created at depth=1.

### TC-AM-03 — Recall loads state into Editable Table
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Click **Recall** on a user-created service row.  
**Expected:** The Editable Table updates to reflect the recalled `input_map`. The service title field shows the file's `service_title`. The Update button appears on that row. An event log entry is created at depth=1.

### TC-AM-04 — Update overwrites file
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Recall a service (Update button appears on its row).
2. Edit the service title field.
3. Click **Update** on that row.  
**Expected:** The file's `service_title` and `saved_at` are updated on disk. The `input_map` reflects the current working state. The table row refreshes with the new title and timestamp.

### TC-AM-05 — Delete removes file
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Click **Delete** on a user-created service row.  
**Expected:** File is removed from `/Users/avuser/uacdata/`. Row disappears from the table. The Defaults row has no Delete button. An event log entry is created at depth=1.

### TC-AM-06 — Defaults row is protected
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Observe the Defaults row in the Assignment Manager table.  
**Expected:** The Defaults row shows only a **Recall** button (no Update or Delete). The service title and saved-at cells are rendered with reduced opacity and italic text; the Recall button appears at full opacity identical to other rows.

### TC-AM-07 — Recall Defaults row loads input map and sets title
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Click **Recall** on the Defaults row.  
**Expected:** `global.input_map` is loaded from `input_map_defaults.json`. The Editable Table updates with the default assignments. The service title field is set to the next-Sunday date string (since the defaults file has no `service_title`). `global.recalled_filename` is set to `input_map_defaults.json` (Update button appears on the Defaults row). An event log entry is created at depth=1.

### TC-AM-08 — Title editable after recall, does not auto-save
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Recall any service.
2. Edit the service title field and tab/click away.  
**Expected:** The title field updates in the UI. The source file on disk is unchanged. Only an explicit Save New or Update writes the changed title to a file.

### TC-AM-09 — Send to subsystem routes correctly
**Method:** Manual / Event Log  
**Status: MISSING**  
**Steps:**
1. Recall a service with a known `input_map`.
2. Click **Klang** (or Shure / dLive / Reaper) in the toolbar.  
**Expected:** The appropriate hub command (`/cc/klang/globalrename`, `/cc/dlive/inputrename`, `/cc/reaper/inputrename`, `/cc/shure/setnames`) is dispatched. Event log records the action at depth=1.

### TC-AM-10 — Service title auto-populated on startup
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Restart Node-RED.
2. Navigate to the Assignments page.  
**Expected:** The service title field shows the next-Sunday date string (`YYYY-MM-DD Mic and Pack Assignments`) within ~3 s of page load, with no user interaction required.

### TC-AM-11 — Event log entry for every button press
**Method:** Manual / Event Log  
**Status: MISSING**  
**Steps:**
1. Press each toolbar button (Save New, Print, Klang, Shure, dLive, Reaper) and each in-row action (Recall, Update, Delete).
2. Check the Event Log page after each press.  
**Expected:** Each button press produces exactly one event log entry with `source=UI`, `depth=1`, `level=Info`, and a descriptive `message` field. No duplicate or missing entries.

### TC-AM-12 — Recall file with no service_title generates next-Sunday title
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Recall any file that was saved without a `service_title` (e.g. a legacy `input_map_saved_*.json`).  
**Expected:** The service title field is set to the next-Sunday date string rather than being left blank.

### TC-AM-13 — List auto-loads on component mount
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Navigate away from the Assignments page then return.  
**Expected:** The Assignment Manager table repopulates automatically without any button press, reflecting the current files in `/Users/avuser/uacdata/`.

### TC-AM-14 — Active toggle is row-isolated
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Load the Assignments page with at least three rows visible.
2. Click the Active toggle on any single row to uncheck it.
3. Observe all rows.  
**Expected:** Only the clicked row changes state (becomes dimmed/inactive). All other rows remain exactly as they were. No adjacent or non-adjacent row changes its checked state.

### TC-AM-15 — Active rows sort to top by default
**Method:** Manual  
**Status: VERIFIED**  
**Steps:**
1. Load the Assignments page with a mix of active and inactive rows (recall a service that has at least one row with `active: false`).
2. Observe the table without clicking any column header.  
**Expected:** All active (checked) rows appear above all inactive (unchecked) rows. The Active column header shows the ↑ sort indicator.

### TC-AM-16 — input_map survives startup title initialization
**Method:** API  
**Status: VERIFIED** (via `tests/cases/input_map_guard.js`)  
**Steps:**
1. Set `global.input_map` to a known array of rows.
2. Trigger the service-title initialization path (restart Node-RED, or send `/cc/assignments/settitle`; the init sends a title message into the Editable Table, which has `passthru = true`).
3. Read `global.input_map`.  
**Expected:** `input_map` is still the same array — not a string. Title messages must not carry a `payload`, and the `payload is array` switch must block any non-array payload from reaching `store on publish`.
