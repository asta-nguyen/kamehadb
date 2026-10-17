package duckdriver

import (
	"os/exec"
	"syscall"
)

// This is a private stdio worker, not a user-visible console window.
func configureCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
