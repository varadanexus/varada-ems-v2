# Transportation API Contracts (Event Publishing)

All contracts are documentation for async event publishing. Transportation publishes; downstream services consume.

## Common envelope
```json
{
  "event_id": "uuid",
  "event_type": "string",
  "event_version": "v1",
  "idempotency_key": "string",
  "occurred_at": "ISO-8601",
  "tenant_id": "uuid",
  "division_id": "uuid",
  "actor_user_id": "uuid",
  "payload": {}
}
```

## 1) Trip Created Event
`event_type`: `transport.trip.created`

Payload example:
```json
{
  "trip_id": "uuid",
  "trip_no": "TR2606001",
  "trip_date": "2026-06-01",
  "client_id": "uuid",
  "transporter_id": "uuid",
  "truck_id": "uuid",
  "driver_id": "uuid",
  "route_id": "uuid",
  "commodity_id": "uuid",
  "weight_kg": 35000,
  "company_rate_per_mt": 1600,
  "transporter_rate_per_mt": 1300
}
```

## 2) Trip Updated Event
`event_type`: `transport.trip.updated`
```json
{
  "trip_id": "uuid",
  "changed_fields": ["driver_id", "status"],
  "old_values": {"status": "Loaded"},
  "new_values": {"status": "In Transit"}
}
```

## 3) Trip Completed Event
`event_type`: `transport.trip.completed`
```json
{
  "trip_id": "uuid",
  "trip_no": "TR2606001",
  "completed_at": "2026-06-01T10:30:00Z",
  "weight_kg": 35000,
  "proof_documents": ["lr", "challan", "weight_slip"]
}
```

## 4) Expense Added Event
`event_type`: `transport.expense.added`
```json
{
  "expense_id": "uuid",
  "trip_id": "uuid",
  "expense_type": "toll",
  "amount": 2400,
  "expense_date": "2026-06-01"
}
```

## 5) Expense Approved Event
`event_type`: `transport.expense.approved`
```json
{
  "expense_id": "uuid",
  "trip_id": "uuid",
  "approved_by": "uuid",
  "approved_at": "2026-06-01T11:00:00Z"
}
```

## 6) Billable Event Created
`event_type`: `transport.billable.created`
```json
{
  "trip_id": "uuid",
  "client_id": "uuid",
  "basis": "margin",
  "contract_value": 56000,
  "transporter_value": 45500,
  "expenses": 2500,
  "billable_amount": 53500,
  "gst_basis": "margin"
}
```

## 7) Payable Event Created
`event_type`: `transport.payable.created`
```json
{
  "trip_id": "uuid",
  "payable_party_type": "transporter",
  "payable_party_id": "uuid",
  "gross_amount": 45500,
  "deductions": 1800,
  "additions": 0,
  "net_amount": 43700
}
```

## Idempotency strategy
- Key format: `{event_type}:{trip_id}:{revision}`.
- Publisher retries with same `idempotency_key`.
- Consumer must upsert by `idempotency_key` and ignore duplicates.

## Audit requirements
- Store actor, source module, source record, old/new snapshots where applicable.
- Every publish/retry/failure/reversal must be auditable.