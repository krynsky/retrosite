# Retrosite Pinokio Notes

Retrosite should run in Pinokio as the normal local app, not as a separate build.

Expected launcher behavior:

1. Clone the Retrosite GitHub repo.
2. Run `npm install`.
3. Start `npm run dev`.
4. Open `http://127.0.0.1:5173/`.

Recommended environment:

```text
RETROSITE_MODE=local
RETROSITE_RUNNER_MODE=inline
RETROSITE_GENERATED_ROOT=server/generated
```

Keep generated reports and screenshots local under `server/generated/`. Do not route Pinokio users to the request-only Vercel mode; Pinokio is specifically for local report generation.

Once the GitHub repo URL is final, add the actual Pinokio launcher scripts here or publish a separate launcher repo that wraps these npm commands.
