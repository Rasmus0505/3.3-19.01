# Features Research

**Project:** Bottle English Learning
**Domain:** English learning from user-supplied media
**Confidence:** MEDIUM

## Table Stakes

- User can register and log in
- User can upload or provide media for lesson generation
- User can see generation progress and failures clearly
- User can consume generated lessons in a learning flow
- User can practice spelling / sentence-level learning from generated materials
- User can pay through platform pricing / points / redeem codes

## Differentiators

- Desktop local Bottle 1.0 generation with minimal technical setup
- Desktop and web dual-path product with cloud Bottle 2.0 available in both
- Link-to-video import on desktop using local tooling
- Product boundary that keeps server load low while still feeling simple to learners

## Anti-Features

- Asking users to configure API keys themselves
- Asking users to run separate media conversion tools manually
- Forcing all users through the same runtime regardless of device capability

## Complexity Notes

- Desktop local generation and URL import have the highest runtime/tooling complexity.
- Cloud generation is easier to expose broadly but must be integrated with pricing and upload constraints.
- The learning experience must stay consistent regardless of generation source.
