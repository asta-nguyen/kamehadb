//go:build windows

package acp

import (
	"os/exec"
	"strconv"
	"syscall"
)

// npm shims are batch files on Windows; without the extension exec.LookPath
// fails to find them. (Why)
var windowsLaunchers = map[string]string{
	"npx":  "npx.cmd",
	"yarn": "yarn.cmd",
	"pnpm": "pnpm.cmd",
	"bun":  "bun.exe",
	"node": "node.exe",
	"bunx": "bunx.cmd",
}

// configureProcess starts the agent in a new process group so the tree can be
// force-killed together.
func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

// terminateProcess force-kills the agent and every child via taskkill.
func terminateProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	_ = exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(pid)).Run()
	_ = cmd.Process.Kill()
}

// resolveExecutable maps npm-family launchers to their Windows shim names.
func resolveExecutable(name string) string {
	if mapped, ok := windowsLaunchers[name]; ok {
		return mapped
	}
	return name
}
