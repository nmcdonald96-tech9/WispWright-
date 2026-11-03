# Verification checklist

```bash
npx tsx --test src/game/physics/foundationBindings.test.ts
npm run test
npm run lint
npm run build
```

Manual checks:

- [ ] Grounded wood block reports an intact foundation binding.
- [ ] Grounded wood support remains near its committed transform after ordinary settling.
- [ ] Floating block receives no foundation binding.
- [ ] Rotated block receives no silent foundation binding.
- [ ] Simple two-support peaked roof survives ordinary gravity.
- [ ] Meaningful attack can still break/dislodge the base.
- [ ] After breakage, normal sliding/tipping resumes.
- [ ] No duplicated constraints after restarting or repeating stability tests.
