package engines

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTLSConfigSSLOff(t *testing.T) {
	config, err := TLSConfig(ConnProfile{SSLCACert: "ignored"}, "db.local")
	if err != nil || config != nil {
		t.Fatalf("TLSConfig with SSL off = (%v, %v), want (nil, nil)", config, err)
	}
}

func TestTLSConfigVerifiesWithRootCA(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()

	addr := server.Listener.Addr().String()
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	certificatePEM := func(certDER []byte) string {
		return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER}))
	}

	dial := func(serverName, caPEM string) error {
		config, err := TLSConfig(ConnProfile{SSL: true, SSLCACert: caPEM}, serverName)
		if err != nil {
			return err
		}
		conn, err := tls.Dial("tcp", addr, config)
		if err != nil {
			return err
		}
		return conn.Close()
	}
	trustedPEM := certificatePEM(server.Certificate().Raw)
	if err := dial(host, trustedPEM); err != nil {
		t.Fatalf("trusted certificate and matching host should succeed: %v", err)
	}
	if err := dial(host, testRootPEM(t)); err == nil {
		t.Fatal("a different trusted certificate should fail the handshake")
	}
	if err := dial("mismatch.example", trustedPEM); err == nil {
		t.Fatal("a host-name mismatch should fail the handshake")
	}
}

// Generate a valid unrelated CA so the handshake test checks custom-root isolation.
func testRootPEM(t *testing.T) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func TestTLSConfigRejectsInvalidPEM(t *testing.T) {
	if _, err := TLSConfig(ConnProfile{SSL: true, SSLCACert: "not a certificate"}, "db.local"); err == nil {
		t.Fatal("invalid Root CA PEM should return an error")
	}
}

func TestTLSConfigNoPEM(t *testing.T) {
	config, err := TLSConfig(ConnProfile{SSL: true}, "db.local")
	if err != nil || config == nil || config.ServerName != "db.local" || !config.InsecureSkipVerify {
		t.Fatalf("no-PEM config = (%+v, %v), want encrypted TLS with skip-verify", config, err)
	}
}
