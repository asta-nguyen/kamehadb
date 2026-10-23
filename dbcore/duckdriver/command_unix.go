//go:build !windows

package duckdriver

import "os/exec"

func configureCommand(_ *exec.Cmd) {}
