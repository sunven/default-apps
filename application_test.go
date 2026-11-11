//go:build darwin && cgo

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/config"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Re-exec the real application constructor, without starting the GUI or native
// setters. A process admitted past startup can write the shared pending record.
func TestMain(m *testing.M) {
	if os.Getenv("DEFAULT_APPS_INSTANCE_TEST_PROCESS") != "1" {
		os.Exit(m.Run())
	}
	// TestMain stays on Wails' locked initial thread; a normal test goroutine
	// cannot run the AppKit notification used by a second launch.
	home := os.Getenv("DEFAULT_APPS_INSTANCE_TEST_HOME")
	newApplication(home, application.Options{Name: filepath.Base(os.Args[0])})
	store := config.NewStore(filepath.Join(home, "config.json"))
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Pending = json.RawMessage(fmt.Sprintf(`{"pid":%d}`, os.Getpid()))
		return nil
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println("admitted")
	_, _ = io.Copy(io.Discard, os.Stdin)
	os.Exit(0)
}

func TestApplicationPreventsConcurrentPendingWriters(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	home := t.TempDir()
	command := func(binary, homePath string) *exec.Cmd {
		cmd := exec.CommandContext(ctx, binary, "-test.run=^$")
		cmd.Env = append(os.Environ(), "DEFAULT_APPS_INSTANCE_TEST_PROCESS=1", "DEFAULT_APPS_INSTANCE_TEST_HOME="+homePath)
		return cmd
	}
	first := command(os.Args[0], home)
	input, err := first.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	defer input.Close()
	output, err := first.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	first.Stderr = os.Stderr
	if err := first.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = first.Process.Kill()
		_ = first.Wait()
	})
	scanner := bufio.NewScanner(output)
	admitted := false
	for scanner.Scan() {
		if scanner.Text() == "admitted" {
			admitted = true
			break
		}
	}
	if !admitted {
		t.Fatalf("first process never acquired the instance: %v", scanner.Err())
	}
	path := filepath.Join(home, "config.json")
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// Another installed/development copy and a symlink to the same home must
	// still join the existing instance.
	otherRoot := t.TempDir()
	alias := filepath.Join(otherRoot, "Home")
	if err := os.Symlink(home, alias); err != nil {
		t.Fatal(err)
	}
	otherBinary := filepath.Join(otherRoot, "Default Apps.dev")
	binaryData, err := os.ReadFile(os.Args[0])
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(otherBinary, binaryData, 0700); err != nil {
		t.Fatal(err)
	}
	secondOutput, err := command(otherBinary, alias).CombinedOutput()
	if err != nil {
		t.Fatalf("second launch must exit successfully: %v\n%s", err, secondOutput)
	}
	if strings.Contains(string(secondOutput), "admitted") {
		t.Fatal("second process reached the shared pending writer while the first was alive")
	}
	after, err := os.ReadFile(path)
	if err != nil || string(after) != string(before) {
		t.Fatalf("second launch replaced the pending record: before=%s after=%s error=%v", before, after, err)
	}
	// A crashed instance must not leave a stale lock that prevents recovery.
	if err := first.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	_ = first.Wait()
	restarted, err := command(os.Args[0], home).CombinedOutput()
	if err != nil || !strings.Contains(string(restarted), "admitted") {
		t.Fatalf("restart could not acquire the released instance: %v\n%s", err, restarted)
	}
}
