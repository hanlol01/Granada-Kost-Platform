# M14B Limitations

- Cross-property denial was not fully testable because only one local seed property was exposed to admin.

Additional boundaries:
- Browser QA was intentionally not executed.
- Frontend was not modified or tested.
- Live Smart Lock execution was not attempted.
- SMART_LOCK_LIVE_ENABLED was never set to true by this QA run.
- Passwords, tokens, secrets, and raw provider ids are not included in artifacts.
