package change_test

import (
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/change"
)

func TestUpdateStayNeverStartsHelperAndKeepsCompletion(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("before-update"))
	waitStart(t, sys)
	started := make(chan struct{}, 1)
	if err := change.PrepareRestart(svc, func() { started <- struct{}{} }); err != nil {
		t.Fatal(err)
	}
	prompt := svc.GetSnapshot().Quit
	if !prompt.Prompt || prompt.Intent != "update" || prompt.Exiting || prompt.Restarting {
		t.Fatal(prompt)
	}
	if result := svc.Submit(ctx, input("during-prompt")); result.Outcome != "busy" {
		t.Fatal(result)
	}
	svc.RespondQuit(prompt.PromptID, false)
	select {
	case <-started:
		t.Fatal("stay launched helper")
	default:
	}
	sys.finish(&target, nil)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if !svc.GetSnapshot().Requests[0].Confirmed {
		t.Fatal("lost completion after staying")
	}
}

func TestFailedUpdatePreparationDoesNotLoseNativeResults(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("before-update"))
	waitStart(t, sys)
	started := make(chan struct{}, 1)
	if err := change.PrepareRestart(svc, func() { started <- struct{}{} }); err != nil {
		t.Fatal(err)
	}
	prompt := svc.GetSnapshot().Quit
	svc.RespondQuit(prompt.PromptID, true)
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("helper was not prepared")
	}
	if svc.RequestQuit() {
		t.Fatal("native quit escaped helper readiness gate")
	}
	if result := svc.Submit(ctx, input("during-helper")); result.Outcome != "busy" {
		t.Fatal(result)
	}
	sys.finish(&target, nil)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	change.CancelRestart(svc)
	snap := svc.GetSnapshot()
	if snap.Quit.Restarting || snap.Quit.Exiting || snap.Quit.Intent != "" || !snap.Requests[0].Confirmed {
		t.Fatal(snap)
	}
	if _, err := svc.Query(ctx, pdf); err != nil {
		t.Fatal(err)
	}
}

func TestOnlyReadyHelperCommitsApprovedUpdateExit(t *testing.T) {
	svc, _, _ := fixture(t)
	if change.CommitRestart(svc) {
		t.Fatal("unapproved exit")
	}
	started := make(chan struct{}, 1)
	if err := change.PrepareRestart(svc, func() { started <- struct{}{} }); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("no action")
	}
	if svc.RequestQuit() {
		t.Fatal("quit before readiness")
	}
	if !change.CommitRestart(svc) || !svc.RequestQuit() {
		t.Fatal("approved helper cannot quit")
	}
	if change.CommitRestart(svc) {
		t.Fatal("committed twice")
	}
	if result := svc.Submit(ctx, input("after-commit")); result.Outcome != "exiting" {
		t.Fatal(result)
	}
}
