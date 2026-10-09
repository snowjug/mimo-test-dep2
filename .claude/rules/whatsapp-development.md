# WhatsApp Development Rules

## Scope

These rules apply to the MIMO WhatsApp Flow and its isolated
development/test environment.

## Required Workflow

Before implementation:

- Inspect the existing WhatsApp controller and service.
- Inspect the isolated Flow endpoint prototype.
- Identify shared production dependencies.
- Define the files expected to change.
- Identify the tests required to verify the change.

## Allowed Initial Scope

Prefer isolated changes to:

- WhatsApp Flow JSON.
- Flow-specific UI behavior.
- Isolated Flow endpoint code.
- Development-only configuration examples.
- Test fixtures and harness scripts.
- WhatsApp-specific documentation.

## Restricted Shared Scope

Do not modify these areas without explicitly documenting and approving
the required scope expansion:

- Website checkout.
- Shared production pricing.
- Payment controller and payment fulfilment.
- Global printer routing defaults.
- Production order creation.
- Kiosk printing dispatch.

## Test Mode

All test orders and uploaded synthetic files must remain isolated.

Do not use real payment credentials or production kiosk identifiers
to exercise simulated order flows.

A simulated payment must never satisfy production payment verification.

## Acceptance Criteria

A WhatsApp implementation is not complete until:

- Relevant tests pass.
- Flow definitions validate.
- Error handling is tested.
- Test mode is isolated from production side effects.
- The final diff has been inspected.
- Actual external integration status is reported honestly.