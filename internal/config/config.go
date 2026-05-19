// internal/config/config.go — Configuration Loading
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"gopkg.in/yaml.v3"
)

// Config holds all runtime configuration for NanoFly.
type Config struct {
	Port          int        `yaml:"port"`
	Host          string     `yaml:"host"`
	DataDir       string     `yaml:"data_dir"`
	SecretKey     string     `yaml:"secret_key"`
	CaddyAdminURL string     `yaml:"caddy_admin_url"`
	SMTP          SMTPConfig `yaml:"smtp"`
	Debug         bool       `yaml:"debug"`
}

type SMTPConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	From     string `yaml:"from"`
}

func (c *Config) BaseURL() string {
	host := c.Host
	if host == "" {
		host = "localhost"
	}
	return fmt.Sprintf("http://%s:%d", host, c.Port)
}

func defaults() *Config {
	return &Config{
		Port:          8080,
		Host:          "",
		DataDir:       "./data",
		SecretKey:     "CHANGE-ME-this-is-not-secure",
		CaddyAdminURL: "http://localhost:2019",
		Debug:         false,
	}
}

// Load reads config from file then environment variable overrides.
func Load() (*Config, error) {
	cfg := defaults()

	candidates := []string{
		"nanofly.yaml",
		"/etc/nanofly/nanofly.yaml",
		filepath.Join(os.Getenv("HOME"), ".config", "nanofly", "nanofly.yaml"),
	}

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("reading config file %s: %w", path, err)
		}
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, fmt.Errorf("parsing config file %s: %w", path, err)
		}
		break
	}

	applyEnvOverrides(cfg)

	if err := validate(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("NANOFLY_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Port = port
		}
	}
	if v := os.Getenv("NANOFLY_SECRET_KEY"); v != "" {
		cfg.SecretKey = v
	}
	if v := os.Getenv("NANOFLY_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("NANOFLY_HOST"); v != "" {
		cfg.Host = v
	}
	if v := os.Getenv("NANOFLY_CADDY_ADMIN"); v != "" {
		cfg.CaddyAdminURL = v
	}
	if v := os.Getenv("NANOFLY_DEBUG"); v == "true" || v == "1" {
		cfg.Debug = true
	}
}

func validate(cfg *Config) error {
	if cfg.SecretKey == "CHANGE-ME-this-is-not-secure" {
		fmt.Println("⚠️  WARNING: Using default secret key — set NANOFLY_SECRET_KEY in production!")
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return fmt.Errorf("invalid port %d: must be between 1 and 65535", cfg.Port)
	}
	return nil
}
