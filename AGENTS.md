# Project rules

- A small visual or copy change in the React UI needs code and diff inspection only. Do not automatically start Vite, Electron, Playwright, lint, test or build; the user may verify it manually.
- Treat estimates/calculations, local persistence, Supabase, import/export, PDF/DOCX/XLSX output and Electron main-process changes as behaviour changes with a focused check.
- Run `npm run test` for changed calculation or service behaviour; run Electron E2E only for a changed desktop integration flow. Use a build only when the change affects packaging, Vite config or release behaviour.
- Do not expose Supabase credentials or local persisted user data in logs or reports.

