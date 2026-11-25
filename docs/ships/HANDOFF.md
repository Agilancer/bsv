# Handoff: building the ship kits with Blender MCP

This work needs Blender MCP, which runs inside Blender on the captain's own computer, so it continues in a
Claude Code session on that machine. Paste the prompt below into that session (repository checked out on
branch `claude/admiring-bohr-t67e80`, Blender open with the Blender MCP add-on connected).

## Prompt

> Rebuild this game's ship hulls as modular part kits in Blender, using Blender MCP for all modelling.
> Read these first, in order: `docs/ships/design-brief.md` (section 0 is the governing rule: these are
> spacecraft, not sailing ships; broadside guns are a tactic, not a body plan), `docs/ships/kit-spec.md`
> (the contract with the game), `docs/ships/audit.md` with the sheets in `docs/ships/audit/` (what is
> wrong today), and `docs/ships/research.md` (the reference research; logic only, copy no ship).
>
> Order of work:
> 1. **Prove the pipeline first.** Build a rough block-out Velscour kit for band M only (plain shapes,
>    all markers and custom properties), write `tools/blender/export.py`, `src/game/ship/kitAssembler.js`
>    and `tests/kit.test.mjs` per kit-spec sections 7-9, and get one frigate assembled, tested and
>    rendered in the game. Fix the spec where it turns out wrong, and say so in the commit.
> 2. **Then one design language at a time:** Velscour, Aurelian, Tidewright, Ironhold, Corsair, Hollow,
>    Rustborn, Silent, Brood, then `roles` and `common`. For each, write `tools/blender/<lang>.py` (bpy)
>    and run it through Blender MCP to build the parts. Keep the script so the kit can be rebuilt.
> 3. **Review loop, per language.** Assemble the review set from kit-spec section 9 (ten player classes,
>    or for an enemy-only language one design per size band and role kit). Render black thumbnails and
>    lit views from the play camera, the side and the title camera. Give the renders to at least two
>    independent critic agents: one judging only design-brief section 4 (the section 0 tests first), one
>    judging the kit-spec contract and budgets. Fix what they reject and repeat. **Do at most 4
>    iterations, or stop earlier when every critic approves.** If critics still reject after 4, stop and
>    show the captain the renders and the open objections.
> 4. Export to `assets/ships/kits/<lang>.glb`, run the tests and, once per language, the duel and soak
>    gates. Commit per language with before/after renders.
>
> When all kits are in, update `hullPlan.js` / `sideProfile` so the crew cutaway matches, rename the
> sailing-ship fields in the data and code, and re-pick the title line in `src/fx/TitleScene.js`.
