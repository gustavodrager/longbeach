package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"syscall"
)

const maxMediaBytes = 10 * 1024 * 1024

var identifier = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)
var backendHostName = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$`)

type config struct {
	Enabled     bool   `json:"enabled"`
	Address     string `json:"address"`
	Secret      string `json:"secret"`
	DatabaseURL string `json:"databaseUrl"`
	Schema      string `json:"schema"`
	AccountID   string `json:"accountId"`
	BackendURL  string `json:"backendUrl"`
	BackendHost string `json:"backendHost"`
	RuntimeRole string `json:"runtimeRole"`
}

func loadConfig() (config, error) {
	c := config{Address: "127.0.0.1:8091", Schema: "whatsapp_transport", RuntimeRole: "longbeach_whatsapp_bridge", AccountID: "arena"}
	var err error
	if path := os.Getenv("WABRIDGE_CONFIG_FILE"); path != "" {
		if err = readPrivateConfig(path, &c); err != nil {
			return config{}, err
		}
	} else {
		// Compatibility for isolated development. Production uses the mounted JSON file.
		c.Address = env("WABRIDGE_ADDRESS", c.Address)
		c.Secret = os.Getenv("WABRIDGE_SECRET")
		c.DatabaseURL = os.Getenv("WABRIDGE_DATABASE_URL")
		c.Schema = env("WABRIDGE_SCHEMA", c.Schema)
		c.AccountID = env("WABRIDGE_ACCOUNT_ID", c.AccountID)
		c.BackendURL = os.Getenv("WABRIDGE_BACKEND_URL")
		c.BackendHost = os.Getenv("WABRIDGE_BACKEND_HOST")
		c.RuntimeRole = env("WABRIDGE_RUNTIME_ROLE", c.RuntimeRole)
		if value := os.Getenv("WABRIDGE_ENABLED"); value != "" {
			c.Enabled, err = strconv.ParseBool(value)
		}
		if err != nil {
			return config{}, errors.New("WABRIDGE_ENABLED must be true or false")
		}
	}
	if !identifier.MatchString(c.Schema) || c.Schema == "public" || !identifier.MatchString(c.RuntimeRole) {
		return c, errors.New("schema and runtime role must be dedicated SQL identifiers")
	}
	if len(c.AccountID) == 0 || len(c.AccountID) > 80 {
		return c, errors.New("invalid account identifier")
	}
	if _, _, err := net.SplitHostPort(c.Address); err != nil {
		return c, errors.New("invalid listen address")
	}
	if c.BackendHost != "" && !validBackendHost(c.BackendHost) {
		return c, errors.New("invalid backend Host header")
	}
	if c.Enabled {
		if len(c.Secret) < 32 || c.DatabaseURL == "" {
			return c, errors.New("enabled bridge requires database URL and a secret of at least 32 bytes")
		}
		u, err := url.Parse(c.BackendURL)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return c, errors.New("invalid backend events URL")
		}
	}
	return c, nil
}

func readPrivateConfig(path string, c *config) error {
	invalid := errors.New("private bridge configuration is missing, insecure or invalid")
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || (info.Mode().Perm() != 0600 && info.Mode().Perm() != 0640) || info.Size() > 64*1024 {
		return invalid
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && (stat.Nlink != 1 || (stat.Uid != 0 && stat.Uid != uint32(os.Geteuid()))) {
		return invalid
	}
	f, err := os.Open(path)
	if err != nil {
		return invalid
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return invalid
	}
	data, err := io.ReadAll(io.LimitReader(f, 64*1024+1))
	if err != nil || len(data) > 64*1024 {
		return invalid
	}
	// Reject duplicate/case-folded keys so a false flag cannot silently be shadowed.
	d := json.NewDecoder(bytes.NewReader(data))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return invalid
	}
	seen := map[string]bool{}
	for d.More() {
		key, err := d.Token()
		if err != nil {
			return invalid
		}
		name, ok := key.(string)
		if !ok || seen[strings.ToLower(name)] {
			return invalid
		}
		seen[strings.ToLower(name)] = true
		var value json.RawMessage
		if d.Decode(&value) != nil {
			return invalid
		}
	}
	if _, err = d.Token(); err != nil {
		return invalid
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return invalid
	}
	d = json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if d.Decode(c) != nil {
		return invalid
	}
	return nil
}

func validBackendHost(host string) bool {
	u, err := url.Parse("http://" + host)
	if err != nil || u.Host != host || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Hostname() == "" {
		return false
	}
	if port := u.Port(); port != "" {
		value, err := strconv.Atoi(port)
		if err != nil || value < 1 || value > 65535 {
			return false
		}
	}
	if net.ParseIP(u.Hostname()) != nil {
		return true
	}
	return backendHostName.MatchString(u.Hostname())
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
