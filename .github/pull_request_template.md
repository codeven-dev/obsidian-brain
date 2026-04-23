## Summary

<!-- Describe what this PR changes and why. -->

## Checklist

- [ ] CHANGELOG entry added for any user-visible change
- [ ] If `src/config.ts` changed, `server.json.packages[0].environmentVariables[]` updated to match
- [ ] If a tool's Zod schema changed, `.describe()` annotations reflect the new behavior (so `gen-tools-docs` produces correct output)
- [ ] Plugin version impact noted — if the tool API changed, a paired plugin release is required
- [ ] `npm run smoke` passes locally
- [ ] `npm run docs:build` passes locally
- [ ] HF model cache key in `.github/workflows/release.yml` bumped if the default embedding preset changed (`src/embeddings/presets.ts`)

## Test plan

<!-- How did you verify this change? -->
