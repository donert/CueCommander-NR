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
