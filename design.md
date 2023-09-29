---
title: "CueCommander-NR Design"
---

# Intention

The primary intention of this software is to enable the integration of Audio, Visual and Lighting systems in a live performance environment, specifically mine.

The secondary purpose is to build a free platform for others the use. This is a huge challenge as every facility is different and has different hardware and software and different problems to solve.

# Why Node-RED?

Prior prototypes of this concept used different platforms. <https://nodered.org> was chosen because it provided a event first processing platform that provided a lot of capability. Second There was a good variety of available packages that provided useful functions. Finally, a healthy community that would enable long term stability.

# Big Idea

The core operating concept is that something can happen (or be detected) and as a result of that an action taken. The event can be initiated by the UI, via and http API call, or can be detected via polloing for a condition.

# Configuration

Device configuration is currently held in templates on the "settings" flow. There is a test and a production template. (In some future version of the code, these templates will be moved to external files.) There is a test a prod version of the configuration to enable development and testing in a different location than the production facility.

The current configuration is stored in the global.config context item.

# Standard Event Elements

| Element      | Description                                                                                                                   |
|--------------|-------------------------------------------------------------------------------------------------------------------------------|
| msg.event    |                                                                                                                               |
| msg.level    | Values include info, warn, error                                                                                              |
| msg.category | Indicates the subsystem category of the event. Values include Projector, ProPresenter, Lights, Cameras, Video Mixer, Control. |
| msg.millis   | Timestamp that the event was created.                                                                                         |
| msg.source   | Indicates the source of the event. Values include http, ui, internal                                                          |

: Event Elements
