package engines

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
)

// TLSConfig verifies with the profile CA when supplied and otherwise keeps SSL encrypted without verifying server identity.
func TLSConfig(cp ConnProfile, host string) (*tls.Config, error) {
	if !cp.SSL {
		return nil, nil
	}

	config := &tls.Config{ServerName: host}
	if cp.SSLCACert != "" {
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM([]byte(cp.SSLCACert)) {
			return nil, errors.New("invalid Root CA PEM")
		}
		config.RootCAs = roots
		return config, nil
	}

	config.InsecureSkipVerify = true
	return config, nil
}
