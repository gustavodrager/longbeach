package main

import (
	"context"
	"time"
)

type engine struct {
	ctx       context.Context
	store     operationStore
	transport transport
}

func (e *engine) Send(r sendRequest) (sendResult, error) {
	if err := validateRequest(r); err != nil {
		return sendResult{}, err
	}
	ctx, cancel := context.WithTimeout(e.ctx, 100*time.Second)
	defer cancel()
	result, created, err := e.store.BeginOperation(ctx, r, fingerprint(r))
	if err != nil || !created {
		return result, err
	}
	if !e.store.LeaseValid(ctx) || !e.transport.Ready(ctx) {
		result = sendResult{MessageID: r.MessageID, State: "Failed", Error: "WhatsApp is not ready; no message was sent"}
	} else {
		result = e.transport.Send(ctx, r)
	}
	if err = e.store.CompleteOperation(ctx, r.OperationID, result); err != nil {
		return sendResult{MessageID: r.MessageID, State: "Uncertain", Error: "Send outcome requires verification"}, nil
	}
	return result, nil
}
