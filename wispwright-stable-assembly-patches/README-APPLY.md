# Wispwright stable structural assembly: Stage 1

This package adds the first bounded structural-stability improvement: **breakable foundation bindings for player-owned blocks resting flush on the map bedrock**.

## What this stage changes

- Eligible `wood_block`, `stone_block`, and `bullseye_block` pieces resting flat on `WORLD_CONFIG.groundY` receive one logical foundation binding.
- Each logical binding uses two hidden compliant Matter.js constraints at the bottom face so ordinary roof spreading is resisted without turning the block into a static body.
- Wood bindings are more compliant and break sooner than stone bindings.
- Foundation bindings break after meaningful displacement, rotation, direct impact, or connected-piece destruction.
- Floating, rotated, prebuilt, broken, lost, and already anchor-attached pieces do not receive an automatic foundation binding.
- Diagnostics expose active and broken foundation-binding counts.

## What this stage intentionally does not change

- Gravity, projectile power, piece durability, ordinary friction, timber-joint profiles, and level balance.
- Persistence or rendering of foundation-binding markers.
- Foundation-path propagation through upper stories.
- General assembly bracing beyond the grounded base pieces.

This is Stage 1, intended to prove that a normal one-story roof can begin from a stable base. Stage 2 should add persisted/visible binding records and foundation-path support for larger assemblies.

## Expected branch

Apply on the current feature branch that produced `repomix-output-stable-structural-assembly.md`. Before applying:

```bash
git status
git branch --show-current
```

The working tree should be clean except for any already accepted centered-face-binding work that is intentionally part of the branch.

## Apply in GitHub Codespaces

Upload or copy the `wispwright-stable-assembly-patches` folder into the repository root.

Check both patches:

```bash
git apply --check wispwright-stable-assembly-patches/001-breakable-foundation-bindings.patch
git apply --check wispwright-stable-assembly-patches/002-foundation-binding-tests.patch
```

If both checks return with no output, apply them:

```bash
git apply wispwright-stable-assembly-patches/001-breakable-foundation-bindings.patch
git apply wispwright-stable-assembly-patches/002-foundation-binding-tests.patch
```

Review the result:

```bash
git diff --check
git diff --stat
git diff -- src/game/physics/physicsBridge.ts
git diff -- src/game/physics/foundationBindings.test.ts
```

Do not commit the patch package itself.

## Verification order

Run the focused test first:

```bash
npx tsx --test src/game/physics/foundationBindings.test.ts
```

Then run the complete repository gate:

```bash
npm run verify
```

Expected changes:

- Three new foundation-binding tests pass.
- All existing tests remain passing.
- TypeScript validation passes.
- The Vite production build passes.

## Manual acceptance test

Start the app:

```bash
npm run dev
```

Build the same simple roof used to reproduce the defect:

1. Place two wooden blocks flat on the map floor.
2. Seat one angled rafter on each block.
3. Connect the rafters at the roof peak.
4. Run the stability test for at least three seconds.

Expected behavior:

- The base blocks do not slowly spread apart under ordinary roof loading.
- The lower rafter joints and roof peak remain connected.
- The design remains dynamic rather than becoming fixed terrain.
- A meaningful projectile strike can still break or dislodge the foundation support.

Also verify these exclusions:

- A floating block falls normally.
- A block rotated substantially away from flat does not receive silent foundation assistance.
- Prebuilt Ancient Foundation pieces remain governed by their existing fixed behavior.

## Rollback before commit

```bash
git restore src/game/physics/physicsBridge.ts
git restore src/game/physics/foundationBindings.test.ts
```

If the test file was newly created and remains untracked, use:

```bash
rm -f src/game/physics/foundationBindings.test.ts
```

## Commit after acceptance

```bash
git add src/game/physics/physicsBridge.ts src/game/physics/foundationBindings.test.ts
git commit -m "Add breakable foundation bindings for grounded base blocks"
git push
```

## Review note

The supplied patches were checked for patch syntax and generated against the uploaded Repomix snapshot. Final TypeScript, test, production-build, and gameplay verification must run in Codespaces because the uploaded snapshot is not a complete executable Git checkout.
