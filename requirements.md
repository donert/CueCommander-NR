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

---

## Test Cases

### TC-RN-01 — Bulk push routes to all subsystems
**Method:** Manual / API  
**Status: VERIFIED** (via `tests/cases/active_status.js`)

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

---

## Test Cases

### TC-AM-01 — Table populates on page load
**Method:** Manual  
**Status: IN PROGRESS**  
**Steps:**
1. Restart Node-RED (not just Deploy).
2. Navigate to the Assignments dashboard page.
3. Click the **⟳** (refresh) button in the Assignment Manager toolbar.  
**Expected:** Table shows one row per `input_map_*.json` file in the assignments directory. The `input_map_defaults.json` row displays label "Defaults" (not the raw filename), with no Update or Delete buttons. User-created rows show service title and saved-at timestamp.  
**Notes:** The startup inject auto-populates the list ~3 s after NR start; the refresh button forces a manual reload. The service title field is pre-populated with the next-Sunday date string.

### TC-AM-02 — Save new service creates file
**Method:** Manual  
**Status: IN PROGRESS**  
**Steps:**
1. Ensure the service title field shows the auto-generated date string (or edit it).
2. Click **Save New** in the toolbar.
3. Check the filesystem at `~/Documents/UACTech/SystemDocumentation/github/uactechdoc/krd_automatin/`.  
**Expected:** A new `input_map_<uuid>.json` file exists containing `service_title`, the current `input_map`, and a non-zero `saved_at` timestamp. The table in the UI refreshes and shows the new row.

### TC-AM-03 — Recall loads state
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Click **Recall** on any user-created service row.  
**Expected:** `global.input_map` and `global.service_title` are updated. The service title field in the UI shows the recalled service's title. The Editable Table updates to reflect the recalled assignments. The saved file on disk is unchanged.

### TC-AM-04 — Update overwrites file
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Recall a service (Update button becomes enabled).
2. Edit the service title field.
3. Click **Update** in the toolbar.  
**Expected:** The recalled file's `service_title` and `saved_at` fields are updated. The `input_map` reflects the current working state. The table row refreshes with the new title and timestamp.

### TC-AM-05 — Delete removes file
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Click **Delete** on a user-created service row.  
**Expected:** The file is removed from disk. The row disappears from the table after the refresh. The Defaults row cannot be deleted (no Delete button on that row).

### TC-AM-06 — Defaults row is protected
**Method:** Manual  
**Status: IN PROGRESS**  
**Steps:**
1. Observe the Defaults row in the Assignment Manager table.  
**Expected:** The Defaults row shows only a **Recall** button (no Update or Delete). The row is visually distinguished (italic text, reduced opacity).

### TC-AM-07 — Recall Defaults loads input map
**Method:** Manual  
**Status: IN PROGRESS**  
**Steps:**
1. Click **Recall Defaults** in the toolbar.  
**Expected:** `global.input_map` is loaded from `input_map_defaults.json`. The Editable Table updates. `global.recalled_filename` is set to `null` (Update button remains disabled). Service title field clears or shows the defaults title if present.

### TC-AM-08 — Title editable after recall, does not auto-save
**Method:** Manual  
**Status: MISSING**  
**Steps:**
1. Recall any service.
2. Edit the service title field and tab/click away.  
**Expected:** The title field updates in the UI. The source file on disk is unchanged. Only an explicit Save New or Update writes the title to a file.

### TC-AM-09 — Send to subsystem routes correctly
**Method:** Manual / Event Log  
**Status: MISSING**  
**Steps:**
1. Recall a service with a known `input_map`.
2. Click **Klang** (or Shure / dLive / Reaper) in the toolbar.  
**Expected:** The appropriate `/cc/klang/globalrename` (or equivalent) command is dispatched to the message hub. Event log records the send action. Behaviour is identical to the previous standalone Send buttons.

### TC-AM-10 — Service title auto-populated on startup
**Method:** Manual  
**Status: IN PROGRESS**  
**Steps:**
1. Restart Node-RED.
2. Navigate to the Assignments page and wait ~3 s.  
**Expected:** The service title field shows the next-Sunday date string in the format `YYYY-MM-DD Mic and Pack Assignments`.
