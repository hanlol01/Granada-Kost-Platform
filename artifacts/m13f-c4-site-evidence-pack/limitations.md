# Limitations

- This evidence pack used placeholder/fake local Tuya credential values, not confirmed site credentials.
- This evidence pack used a synthetic QA smart lock row with a fake provider mapping value, not a selected real site device.
- Read-only diagnostic returned a safe normalized failure because a real active gateway mapping was not available for the synthetic device.
- Read-only sync and sync-status returned safe normalized failure in placeholder mode; they did not prove real-device online/battery readiness.
- No named owner approval, technical lead approval, person-at-door, manual key holder, rollback owner, credential rotation confirmation, or site trial window was available in this task.
- B-23 is partially closed only: C3-class dry-run behavior is evidenced, but a site-env rerun on the approved mapped device is still required before execution GO.
- No live physical unlock was executed.
