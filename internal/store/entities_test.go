package store

import (
	"testing"
	"time"
)

func strP(s string) *string { return &s }
func i64P(v int64) *int64   { return &v }
func boolP(b bool) *bool    { return &b }

func TestChatMessages(t *testing.T) {
	s := openTemp(t)
	if _, err := s.SaveChatMessage("c1", "user", "first", nil); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond) // distinct created_at for ASC ordering
	if _, err := s.SaveChatMessage("c1", "assistant", "second", nil); err != nil {
		t.Fatal(err)
	}
	dbName := "sales"
	if _, err := s.SaveChatMessage("c1", "user", "mongo hi", &dbName); err != nil {
		t.Fatal(err)
	}

	msgs, err := s.GetChatMessages("c1", 50, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 2 || msgs[0].Content != "first" || msgs[1].Content != "second" {
		t.Fatalf("ASC ordering/filtering broken: %+v", msgs)
	}
	mongo, err := s.GetChatMessages("c1", 50, &dbName)
	if err != nil || len(mongo) != 1 || mongo[0].MongoDatabase == nil {
		t.Fatalf("mongo filter: %+v %v", mongo, err)
	}
	if err := s.ClearChatMessages("c1", &dbName); err != nil {
		t.Fatal(err)
	}
	if msgs, _ := s.GetChatMessages("c1", 50, nil); len(msgs) != 2 {
		t.Error("clear with mongoDatabase touched base thread")
	}
	if err := s.ClearChatMessages("c1", nil); err != nil {
		t.Fatal(err)
	}
	if msgs, _ := s.GetChatMessages("c1", 50, nil); len(msgs) != 0 {
		t.Error("clear did not empty thread")
	}
}

func TestQueryHistory(t *testing.T) {
	s := openTemp(t)
	if _, err := s.SaveQueryHistory("c1", "select 1", i64P(12), i64P(1)); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	e2, err := s.SaveQueryHistory("c1", "select 2", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.GetQueryHistory("c1", 50, false)
	if err != nil || len(list) != 2 {
		t.Fatal(list, err)
	}
	if list[0].Query != "select 2" {
		t.Errorf("expected DESC order, got %+v", list)
	}
	if list[1].DurationMs == nil || *list[1].DurationMs != 12 {
		t.Errorf("durationMs lost: %+v", list[1])
	}
	if err := s.UpdateQueryHistory(e2.ID, boolP(true), strP("fav-q")); err != nil {
		t.Fatal(err)
	}
	favs, err := s.GetQueryHistory("c1", 50, true)
	if err != nil || len(favs) != 1 || favs[0].Name == nil || *favs[0].Name != "fav-q" {
		t.Fatalf("favorites: %+v %v", favs, err)
	}
	if err := s.DeleteQueryHistory(e2.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.GetQueryHistory("c1", 50, false); len(list) != 1 {
		t.Error("delete did not remove entry")
	}
}

func TestSchemaSnapshots(t *testing.T) {
	s := openTemp(t)
	ids := make([]string, 3)
	for i := 0; i < 3; i++ {
		id, err := s.SaveSchemaSnapshot("c1", `{"v":`+string(rune('1'+i))+`}`)
		if err != nil {
			t.Fatal(err)
		}
		ids[i] = id
		time.Sleep(2 * time.Millisecond)
	}
	metas, err := s.GetSchemaSnapshots("c1")
	if err != nil || len(metas) != 3 {
		t.Fatal(metas, err)
	}
	if metas[0].ID != ids[0] {
		t.Errorf("expected ASC order, first id %s vs %s", metas[0].ID, ids[0])
	}
	data, err := s.GetSchemaSnapshotData(ids[1])
	if err != nil || data != `{"v":2}` {
		t.Errorf("snapshot data: %q %v", data, err)
	}
	if err := s.DeleteOldSchemaSnapshots("c1", 1); err != nil {
		t.Fatal(err)
	}
	metas, _ = s.GetSchemaSnapshots("c1")
	if len(metas) != 1 || metas[0].ID != ids[2] {
		t.Errorf("prune kept wrong snapshot: %+v", metas)
	}
}

func TestSchemaWatchers(t *testing.T) {
	s := openTemp(t)
	if cfg, err := s.GetSchemaWatcher("c1"); err != nil || cfg != nil {
		t.Fatalf("expected nil watcher, got %+v %v", cfg, err)
	}
	cfg := SchemaWatcherConfig{ConnectionID: "c1", CadenceEnabled: true, IntervalMs: 30000}
	if err := s.UpsertSchemaWatcher(cfg); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetSchemaWatcher("c1")
	if err != nil || got == nil || !got.CadenceEnabled || got.NotifyEnabled || got.IntervalMs != 30000 {
		t.Fatalf("watcher: %+v %v", got, err)
	}
	got.NotifyEnabled = true
	got.IntervalMs = 60000
	if err := s.UpsertSchemaWatcher(*got); err != nil {
		t.Fatal(err)
	}
	enabled, err := s.ListEnabledSchemaWatchers()
	if err != nil || len(enabled) != 1 || !enabled[0].NotifyEnabled {
		t.Fatalf("enabled list: %+v %v", enabled, err)
	}
	if err := s.DeleteSchemaWatcher("c1"); err != nil {
		t.Fatal(err)
	}
	if cfg, _ := s.GetSchemaWatcher("c1"); cfg != nil {
		t.Error("watcher not deleted")
	}
}

func TestAISettings(t *testing.T) {
	s := openTemp(t)
	settings, err := s.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.ActiveProvider != "openai" || len(settings.Providers) != 6 {
		t.Fatalf("defaults: %+v", settings)
	}

	custom := *settings
	cfg := custom.Providers["openai"]
	cfg.Enabled = true
	cfg.Model = " gpt-5 "
	cfg.BaseURL = "https://api.openai.com/v1/"
	cfg.APIKey = " k "
	custom.Providers["openai"] = cfg
	custom.ActiveProvider = "bogus-provider"
	if err := s.SaveAISettings(custom); err != nil {
		t.Fatal(err)
	}

	// Cache was cleared by save; re-read hits the DB.
	got, err := s.GetAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if got.ActiveProvider != "openai" {
		t.Errorf("invalid activeProvider should normalize to default, got %q", got.ActiveProvider)
	}
	g := got.Providers["openai"]
	if g.Model != "gpt-5" || g.BaseURL != "https://api.openai.com/v1" || g.APIKey != "k" {
		t.Errorf("normalization failed: %+v", g)
	}
	if !g.Enabled {
		t.Error("enabled flag lost")
	}
}

func TestMCPRecords(t *testing.T) {
	s := openTemp(t)
	settings, err := s.GetMCPSettings()
	if err != nil || settings.Port != MCPDefaultPort || len(settings.Token) != 44 {
		t.Fatalf("settings: %+v %v", settings, err)
	}
	if _, err := s.UpdateMCPPort(14000); err != nil {
		t.Fatal(err)
	}
	tok, err := s.RotateMCPToken()
	if err != nil || tok == settings.Token {
		t.Fatal("token did not rotate")
	}
	settings2, _ := s.GetMCPSettings()
	if settings2.Port != 14000 || settings2.Token != tok {
		t.Errorf("settings after update: %+v", settings2)
	}

	if _, err := s.CreateMCPManagedAccount("p1", "ref-abc"); err != nil {
		t.Fatal(err)
	}
	a, err := s.GetMCPManagedAccount("p1")
	if err != nil || a == nil || a.State != MCPStatePrepared || a.AccountRef != "ref-abc" {
		t.Fatalf("account: %+v %v", a, err)
	}
	if ok, _ := s.SetMCPManagedAccountState("p1", MCPStateReady); !ok {
		t.Fatal("state update failed")
	}
	list, _ := s.ListMCPManagedAccounts()
	if len(list) != 1 || list[0].State != MCPStateReady {
		t.Fatalf("list: %+v", list)
	}
	if ok, _ := s.ClearMCPManagedAccount("p1"); !ok {
		t.Fatal("clear failed")
	}
	if a, _ := s.GetMCPManagedAccount("p1"); a != nil {
		t.Error("account still present")
	}

	name, kind := "pg", "postgres"
	p, _ := s.CreateProfile(ProfileInput{Name: &name, Kind: &kind})
	updated, err := s.SetProfileMCPEnabled(p.ID, true)
	if err != nil || updated == nil || !updated.MCPEnabled {
		t.Fatalf("mcp enable: %+v %v", updated, err)
	}
	if none, _ := s.SetProfileMCPEnabled("missing", true); none != nil {
		t.Error("missing profile should return nil")
	}
}

func TestEmbeddings(t *testing.T) {
	s := openTemp(t)
	if err := s.UpsertEmbedding("c1", "t1", "CREATE TABLE t1()", "h1"); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertEmbedding("c1", "t2", "CREATE TABLE t2()", "h2"); err != nil {
		t.Fatal(err)
	}
	refs, err := s.ListEmbeddingRefs("c1")
	if err != nil || len(refs) != 2 {
		t.Fatal(refs, err)
	}
	ids, _ := s.ListEmbeddingTableIDs("c1")
	if len(ids) != 2 {
		t.Errorf("table ids: %v", ids)
	}
	if n, _ := s.CountEmbeddings("c1"); n != 2 {
		t.Errorf("count = %d", n)
	}
	if err := s.DeleteEmbedding("c1", "t1"); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountEmbeddings("c1"); n != 1 {
		t.Error("delete failed")
	}
	if err := s.DeleteAllEmbeddings(); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountEmbeddings("c1"); n != 0 {
		t.Error("delete all failed")
	}
}
