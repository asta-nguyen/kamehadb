package redis

import "testing"

// Redis separates INFO sections with "# Name" headers and CRLF line endings.
// parseInfoSection used a lookahead regex that RE2 rejects, so it panicked on
// every call and GetStats could never succeed.
func TestParseInfoSection(t *testing.T) {
	info := "# Server\r\nredis_version:7.2.4\r\nuptime_in_seconds:42\r\n\r\n" +
		"# Clients\r\nconnected_clients:3\r\nblocked_clients:1\r\n\r\n" +
		"# Memory\r\nused_memory:1024\r\nmaxmemory:0\r\n\r\n" +
		"# Stats\r\nkeyspace_hits:9\r\nkeyspace_misses:1\r\n\r\n" +
		"# Commandstats\r\ncmdstat_get:calls=5\r\n\r\n" +
		"# Keyspace\r\ndb0:keys=2,expires=1,avg_ttl=0\r\n"

	cases := []struct {
		section string
		want    map[string]string
	}{
		{"Server", map[string]string{"redis_version": "7.2.4", "uptime_in_seconds": "42"}},
		{"Clients", map[string]string{"connected_clients": "3", "blocked_clients": "1"}},
		{"Memory", map[string]string{"used_memory": "1024", "maxmemory": "0"}},
		// "Stats" must not be satisfied by the "Commandstats" header.
		{"Stats", map[string]string{"keyspace_hits": "9", "keyspace_misses": "1"}},
		{"Missing", map[string]string{}},
	}
	for _, c := range cases {
		got := parseInfoSection(info, c.section)
		if len(got) != len(c.want) {
			t.Errorf("%s: got %v, want %v", c.section, got, c.want)
			continue
		}
		for k, v := range c.want {
			if got[k] != v {
				t.Errorf("%s[%s] = %q, want %q", c.section, k, got[k], v)
			}
		}
	}
}

// Values may contain ":" (Redis puts "host:port" style data in INFO), and LF-only
// output from proxies must parse the same as CRLF.
func TestParseInfoSectionColonValuesAndLF(t *testing.T) {
	got := parseInfoSection("# Replication\nmaster_replid:abc\nslave0:ip=10.0.0.1,port=6379\n# Other\nx:1\n", "Replication")
	if got["master_replid"] != "abc" || got["slave0"] != "ip=10.0.0.1,port=6379" || len(got) != 2 {
		t.Fatalf("unexpected parse: %v", got)
	}
}
