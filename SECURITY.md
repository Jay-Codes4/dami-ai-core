# Security Policy

Dami handles speech and legal-research requests, so credentials and user data must be treated conservatively.

## Secrets

Production credentials must be provided only through server-side environment variables. Never commit API keys, tokens, passwords, private keys, service-account files, or populated `.env` files.

The browser must never receive `INTRON_API_KEY`, `GROQ_API_KEY`, or `EXA_API_KEY`. Server secrets must not use a `VITE_` prefix.

If a secret is ever committed, assume it is compromised: rotate/revoke it first, then remove it from Git history.

## User data

Do not commit recordings, transcripts containing personal information, legal case files, or benchmark audio unless the data is explicitly permitted for public redistribution and appropriately consented/anonymized.

## Reporting

If you discover a security issue, please report it privately to the repository owner rather than opening a public issue containing exploit details or credentials.

## Public-release checklist

- Run the full-history secret scan.
- Confirm no `.env`, credential, key, or certificate files exist in Git history.
- Confirm deployment secrets are stored only in the hosting provider's environment settings.
- Confirm public benchmark data has consent/licensing metadata.
- Rotate any credential that may previously have been exposed, even if it was later deleted.
