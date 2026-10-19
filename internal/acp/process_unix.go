//go:build !windows

package acp

import (
	"os/exec"
	"syscall"
)

// configureProcess puts the agent in its own process group so the whole tree
// (npm → node → agent) can be signalled as one unit.
func configureProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// terminateProcess kills the agent's whole process group, not just the launcher.
func terminateProcess(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pgid := cmd.Process.Pid
	_ = syscall.Kill(-pgid, syscall.SIGKILL)
	_ = cmd.Process.Kill()
}

// resolveExecutable returns the launcher name unchanged; PATH lookup applies.
func resolveExecutable(name string) string { return name }
