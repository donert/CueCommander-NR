---
title: "CueCommander-NR Requirements"
---

# Overview

This document captures functional requirements and test cases for CueCommander-NR. It is a living document; subsystems are added as they are implemented or refactored.

---

# Subsystem: Lighting (ETC ColorSource)

## Functional Requirements

### LT-01 — Basic Playback Controls
The UI shall provide buttons for Go, Go Back, and Pause that send the corresponding OSC command to the ETC ColorSource console.

### LT-02 — Goto Cue
The UI shall provide a mechanism to jump to a specific cue by number.

### LT-03 — Quick Cues
The UI shall provide a set of quick-access buttons mapped to named cues (Looks, sequences, etc.) for frequently used states.

### LT-04 — Lighting Enable Gate
No OSC command shall be sent to the console unless `global.LightingEnabled` is `true`. This prevents accidental operation when the system is not ready.

### LT-05 — Message Hub Routing
All lighting commands initiated from the UI shall be routed through `/cc Message Hub` using the standard command message format (`msg.cmd`, `msg.parm`). The UI tab shall have no direct knowledge of device addresses.

### LT-06 — Event Logging
Every lighting command sent from the UI shall produce an event log entry with populated `cmd`, `parm`, `source`, `millis`, `depth`, `flow`, `level`, and `message` fields.

### LT-07 — Dashboard 2 UI
The UI shall be implemented using `@flowfuse/node-red-dashboard` (Dashboard 2) and served at `/dashboard`. It shall not use legacy Dashboard 1 (`ui_*`) nodes.

### LT-08 — Parallel Operation During Transition
The new UI Lights v2 implementation shall be deployed alongside the existing UI Lights flow without disabling or modifying the existing flow. Both may be active simultaneously during the transition period.

### LT-09 — ProPresenter Cue Automation Unchanged
The ProPresenter Cue Automation flow sends lighting commands to the execution layer. It shall not be modified as part of this refactor.

---

## Test Cases

### TC-LT-01 — Go command routes correctly
**Method:** API  
**Steps:**
1. POST `{"cmd":"/cc/lights/go","parm":null,"source":"test"}` to the NR HTTP lights endpoint.
2. Read the event log via `/api/eventlog` (or equivalent).  
**Expected:** Log entry contains `cmd=/cc/lights/go`, `source=test`, valid `millis`, `level=Info`.

### TC-LT-02 — Gotocue command includes cue number
**Method:** API  
**Steps:**
1. POST `{"cmd":"/cc/lights/gotocue","parm":"25","source":"test"}` to the NR HTTP lights endpoint.
2. Read the event log.  
**Expected:** Log entry contains `cmd=/cc/lights/gotocue`, `parm=25`.

### TC-LT-03 — LightingEnabled gate blocks command
**Method:** API  
**Steps:**
1. Set `global.LightingEnabled = false` via inject or API.
2. POST a go command.
3. Read the event log.  
**Expected:** No OSC send occurs (verify via event log — a "lighting disabled" entry may appear, but no command-sent entry).

### TC-LT-04 — Event log entry is well-formed
**Method:** API  
**Steps:**
1. POST a go command.
2. Retrieve the event log entry for that millis.  
**Expected:** All required fields present and non-null: `cmd`, `source`, `millis` (valid integer), `level`, `flow`, `message`. `parm` may be null/empty for parameterless commands.

### TC-LT-05 — All quick cue buttons produce valid commands (manual)
**Method:** Manual  
**Steps:**
1. Open `/dashboard` on the UI Lights v2 page.
2. Click each quick cue button.
3. Observe ColorSource console responds with the correct cue.
4. Verify event log shows a clean entry for each button press.  
**Expected:** Console transitions to correct look; no malformed log entries.

### TC-LT-06 — Go / Go Back / Pause (manual hardware)
**Method:** Manual  
**Steps:**
1. Open `/dashboard` on the UI Lights v2 page.
2. Click Go — verify console advances one cue.
3. Click Go Back — verify console returns one cue.
4. Click Pause — verify playback pauses.  
**Expected:** Each button produces the correct console state change.

### TC-LT-07 — Dashboard 2 page loads without errors
**Method:** Manual  
**Steps:**
1. Open `/dashboard` in browser.
2. Navigate to the Lights page.  
**Expected:** All widgets render; browser console shows no errors; no Node-RED alerts in the NR editor.

---

# Subsystem: Event Log

## Functional Requirements

### EL-01 — Startup Filter Defaults
On deploy/startup, the event log filter defaults shall be: duration = 60 seconds, depth ≤ 1, exclude 1-second keepalives = on.

### EL-02 — Filter Controls Pre-selected
The event log UI filter controls (duration radio, depth radio, exclude-1sec switch) shall reflect the active filter state on page load.

### EL-03 — Well-formed Entries
Every event log entry shall have a valid ISO timestamp, non-null source, cmd, and level fields. Raw OSC packets or internal messages without a `msg.cmd` shall not be logged.

---

## Test Cases

### TC-EL-01 — Startup defaults are active
**Method:** Manual  
**Steps:**
1. Deploy or restart Node-RED.
2. Open `/dashboard/eventlog`.  
**Expected:** Duration shows 1 minute, depth shows 1, exclude-1sec is on. Log table shows only entries from the last 60 seconds.

### TC-EL-02 — No malformed entries after Klang operations
**Method:** Manual  
**Steps:**
1. Click several Klang mix buttons (e.g. Mute B3).
2. Open event log.  
**Expected:** All entries have valid timestamp, non-"undefined" source and cmd, no "Invalid Date".
