---
name: operation-scheduler-recovery
description: Design, implement, or review operation queues, bounded admission, response ownership, cancellation, timeout-after-send, stale-state recovery, and multi-worker isolation.
license: MIT
---

# Operation Scheduler Recovery

Use this skill for services that serialize or schedule operations against external resources, workers, controllers, devices, databases, or upstream APIs.

## Principles

- Admission must be bounded and observable.
- Ownership must be explicit: request owner, response owner, cancellation owner, timeout owner.
- Slow or failed resource A must not starve unrelated resource B unless the design accepts that trade-off.
- Timeout before send and timeout after send are different states and need different recovery rules.
- Recovery must account for stale bytes/messages/state from previous operations.
- Backpressure should fail deterministically rather than allow unbounded memory growth.

## Checks

- Queue capacity, per-client/per-resource limits, and global limits are tested.
- Cancellation before send, during send, after send, and after response are defined.
- Client drop, worker drop, upstream disconnect, partial response, late response, retry, reconnect, and shutdown are covered.
- Correlation keys prevent response mixing across clients/resources.
- Metrics/logs expose queue wait, operation time, timeout state, rejection reason, and recovery path.
- Benchmarks or load tests cover slow-resource isolation and saturation.

## Output

Return state model, admission matrix, failure/recovery matrix, tests/benchmarks, and unresolved risks.
