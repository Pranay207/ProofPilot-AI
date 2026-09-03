During pre-submission testing, we found two gaps and closed them:



1. The submit endpoint checked readiness client-side only — a direct API call could bypass the UI. Fixed with a server-side guard returning 422 below 80% readiness, applied to both single and bulk-approve paths.


2. Bulk-approve was scoring against a stale stored readiness value instead of live evidence state. Fixed to call scoreCase() live per case.


3. Auto-collected connector evidence wasn't counted toward readiness unless a file was manually attached, undercounting real evidence. Fixed so persisted, timestamped connector records count correctly — and if a persistence write fails, that evidence does not count, so readiness can never be inflated by an unrecorded claim.