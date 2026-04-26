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
