package duckdriver

import (
	"context"
	"os"
	"time"
)

// Advisory locks survive as harmless files but are released by the kernel on
// crash. Never unlink a lock file: another process could hold its old inode.
func acquireInstallLock(ctx context.Context, path string) (func(), error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	for {
		if err := ctx.Err(); err != nil {
			file.Close()
			return nil, err
		}
		locked, err := tryLock(file)
		if err != nil {
			file.Close()
			return nil, err
		}
		if locked {
			return func() { unlockFile(file); file.Close() }, nil
		}
		timer := time.NewTimer(installLockPoll)
		select {
		case <-ctx.Done():
			timer.Stop()
			file.Close()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}
