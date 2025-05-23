# Bot for Horde Resurrection

This is a Horde Resurrection bot designed to entertain player(s) in single- and multiplayer games

## Features

- Basic base-management routines: base building, resource mining, army training, etc.
- Map analysis: automatically analyzes map and creates mesh of waypoints over it. Uses this mesh for tactical purposes like attacking player's base from different directions. No preliminary manual waypoint placement is required.
- Is able to use any units and buildings with custom configs.
- Supports controlling of any base of any faction, including custom ones, as long as they don't differ much from basic factions in terms of using core game mechanics. Is capable of managing Teimur bases equally well as Slavic bases.
- Is able to use advanced custom units that were created using game script engine, as long as they don't differ much from basic units in terms of game mechanics. For example, will be able to properly use beammen with scripted damage processor, but won't be able to control spellcasters with scripted spells which are casted by pressing a button on unit's control panel. Spellcasters with autocast are fine though.
- Is compatible with custom game modes if they don't change game mechanics too much. For example, will work fine with Auto FFA mod, but will *not* work properly with Castle Fight or Battle Royale.

## Installation

Install like a regular Horde Resurrection mod and activate in game launcher. No additional tuning is needed.

## Documentation

See /Scripts/Docs folder for brief details on code structure.