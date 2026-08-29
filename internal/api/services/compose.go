package services

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var composeFileNames = []string{
	"docker-compose.yml",
	"docker-compose.yaml",
	"compose.yml",
	"compose.yaml",
}

// backupComposeFile saves the original compose file to .nanofly.bak if not
// already present. For file:// local services this protects the user's
// source file from permanent mutation by normalize/label injection.
func backupComposeFile(composePath string) {
	if strings.HasPrefix(composePath, os.TempDir()) {
		return
	}
	bak := composePath + ".nanofly.bak"
	if _, err := os.Stat(bak); err == nil {
		return
	}
	if data, err := os.ReadFile(composePath); err == nil {
		_ = os.WriteFile(bak, data, 0644)
	}
}

// deployCompose validates and starts a Compose stack without first taking down
// the running stack. This keeps a healthy deployment online if a new build or
// Compose configuration is invalid.
func deployCompose(ctx context.Context, composeDir, serviceID string, log func(string)) error {
	composePath, err := findComposeFile(composeDir)
	if err != nil {
		return err
	}

	backupComposeFile(composePath)

	addedVolumes, err := normalizeComposeVolumes(composePath)
	if err != nil {
		return fmt.Errorf("preparing docker compose file: %w", err)
	}
	if len(addedVolumes) > 0 {
		log("[INFO] Added missing Compose volume declarations: " + strings.Join(addedVolumes, ", "))
	}
	labelledServices, err := ensureComposeServiceLabels(composePath, serviceID)
	if err != nil {
		return fmt.Errorf("adding NanoFly service labels: %w", err)
	}
	if len(labelledServices) > 0 {
		log("[INFO] Added NanoFly management labels to: " + strings.Join(labelledServices, ", "))
	}

	projectName := "nf-" + serviceID
	baseArgs := []string{"compose", "--project-name", projectName, "--file", composePath}

	log("Validating docker compose configuration…")
	validateCmd := exec.CommandContext(ctx, "docker", append(baseArgs, "config", "--quiet")...)
	validateCmd.Dir = composeDir
	if err := runCommandStreaming(validateCmd, log); err != nil {
		return fmt.Errorf("docker compose validation: %w", err)
	}

	log("Applying docker compose stack…")
	upCmd := exec.CommandContext(ctx, "docker", append(baseArgs, "up", "--detach", "--build", "--remove-orphans")...)
	upCmd.Dir = composeDir
	if err := runCommandStreaming(upCmd, log); err != nil {
		return fmt.Errorf("docker compose up: %w", err)
	}

	log("[OK] Docker Compose stack is running.")
	return nil
}

func findComposeFile(composeDir string) (string, error) {
	for _, name := range composeFileNames {
		path := filepath.Join(composeDir, name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path, nil
		}
	}
	return "", fmt.Errorf("no Compose file found in %s (looked for %s)", composeDir, strings.Join(composeFileNames, ", "))
}

func composeDirectory(svc *Service) string {
	if strings.HasPrefix(svc.GitRepoURL, "file://") {
		return strings.TrimPrefix(svc.GitRepoURL, "file://")
	}
	return filepath.Join(os.TempDir(), "nanofly-"+svc.ID)
}

// normalizeComposeVolumes adds top-level declarations for named volumes used by
// services. Docker Compose validates these declarations before it creates any
// Docker volume, so `docker volume create` alone cannot fix an undefined-volume
// error. YAML nodes are used instead of line parsing to avoid treating ports or
// other service fields as volume names.
func normalizeComposeVolumes(composePath string) ([]string, error) {
	data, err := os.ReadFile(composePath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", filepath.Base(composePath), err)
	}

	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil {
		return nil, fmt.Errorf("invalid YAML: %w", err)
	}
	if len(document.Content) != 1 || document.Content[0].Kind != yaml.MappingNode {
		return nil, fmt.Errorf("compose document must contain a top-level mapping")
	}
	root := document.Content[0]

	services := mappingValue(root, "services")
	if services == nil || services.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("compose file must define a services mapping")
	}

	declared := declaredComposeVolumes(mappingValue(root, "volumes"))
	referenced := referencedComposeVolumes(services)
	missing := make([]string, 0)
	for volume := range referenced {
		if !declared[volume] {
			missing = append(missing, volume)
		}
	}
	sort.Strings(missing)
	if len(missing) == 0 {
		return nil, nil
	}

	volumes := mappingValue(root, "volumes")
	if volumes == nil {
		root.Content = append(root.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "volumes"},
			&yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"},
		)
		volumes = root.Content[len(root.Content)-1]
	}
	if volumes.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("top-level volumes must be a mapping")
	}
	for _, volume := range missing {
		volumes.Content = append(volumes.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: volume},
			&yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"},
		)
	}

	normalized, err := yaml.Marshal(&document)
	if err != nil {
		return nil, fmt.Errorf("serializing normalized compose file: %w", err)
	}
	if err := os.WriteFile(composePath, normalized, 0644); err != nil {
		return nil, fmt.Errorf("writing normalized compose file: %w", err)
	}
	return missing, nil
}

// ensureComposeServiceLabels makes every container in a Compose stack visible
// to NanoFly's existing status, log, metrics, and cleanup paths.
func ensureComposeServiceLabels(composePath, serviceID string) ([]string, error) {
	if serviceID == "" {
		return nil, nil
	}
	data, err := os.ReadFile(composePath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", filepath.Base(composePath), err)
	}

	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil {
		return nil, fmt.Errorf("invalid YAML: %w", err)
	}
	if len(document.Content) != 1 || document.Content[0].Kind != yaml.MappingNode {
		return nil, fmt.Errorf("compose document must contain a top-level mapping")
	}
	services := mappingValue(document.Content[0], "services")
	if services == nil || services.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("compose file must define a services mapping")
	}

	updated := make([]string, 0)
	for i := 0; i+1 < len(services.Content); i += 2 {
		serviceName := services.Content[i].Value
		if ensureComposeServiceLabel(services.Content[i+1], serviceID) {
			updated = append(updated, serviceName)
		}
	}
	if len(updated) == 0 {
		return nil, nil
	}

	normalized, err := yaml.Marshal(&document)
	if err != nil {
		return nil, fmt.Errorf("serializing labeled compose file: %w", err)
	}
	if err := os.WriteFile(composePath, normalized, 0644); err != nil {
		return nil, fmt.Errorf("writing labeled compose file: %w", err)
	}
	return updated, nil
}

func ensureComposeServiceLabel(service *yaml.Node, serviceID string) bool {
	if service == nil || service.Kind != yaml.MappingNode {
		return false
	}
	const labelKey = "nanofly.service"
	labelValue := labelKey + "=" + serviceID
	labels := mappingValue(service, "labels")
	if labels == nil || (labels.Kind == yaml.ScalarNode && labels.Tag == "!!null") {
		if labels == nil {
			service.Content = append(service.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "labels"})
			labels = &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
			service.Content = append(service.Content, labels)
		} else {
			labels.Kind, labels.Tag, labels.Value, labels.Content = yaml.MappingNode, "!!map", "", nil
		}
		labels.Content = append(labels.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: labelKey},
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: serviceID},
		)
		return true
	}

	switch labels.Kind {
	case yaml.MappingNode:
		for i := 0; i+1 < len(labels.Content); i += 2 {
			if labels.Content[i].Value == labelKey {
				if labels.Content[i+1].Value == serviceID {
					return false
				}
				labels.Content[i+1].Kind, labels.Content[i+1].Tag, labels.Content[i+1].Value = yaml.ScalarNode, "!!str", serviceID
				return true
			}
		}
		labels.Content = append(labels.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: labelKey},
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: serviceID},
		)
		return true
	case yaml.SequenceNode:
		for _, label := range labels.Content {
			if label.Kind == yaml.ScalarNode && (label.Value == labelKey || strings.HasPrefix(label.Value, labelKey+"=")) {
				if label.Value == labelValue {
					return false
				}
				label.Value = labelValue
				return true
			}
		}
		labels.Content = append(labels.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: labelValue})
		return true
	default:
		return false
	}
}

func mappingValue(node *yaml.Node, key string) *yaml.Node {
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			return node.Content[i+1]
		}
	}
	return nil
}

func declaredComposeVolumes(volumes *yaml.Node) map[string]bool {
	declared := make(map[string]bool)
	if volumes == nil || volumes.Kind != yaml.MappingNode {
		return declared
	}
	for i := 0; i+1 < len(volumes.Content); i += 2 {
		if name := strings.TrimSpace(volumes.Content[i].Value); name != "" {
			declared[name] = true
		}
	}
	return declared
}

func referencedComposeVolumes(services *yaml.Node) map[string]bool {
	referenced := make(map[string]bool)
	for i := 0; i+1 < len(services.Content); i += 2 {
		service := services.Content[i+1]
		if service.Kind != yaml.MappingNode {
			continue
		}
		volumes := mappingValue(service, "volumes")
		if volumes == nil || volumes.Kind != yaml.SequenceNode {
			continue
		}
		for _, mount := range volumes.Content {
			if source, ok := composeVolumeSource(mount); ok {
				referenced[source] = true
			}
		}
	}
	return referenced
}

func composeVolumeSource(mount *yaml.Node) (string, bool) {
	switch mount.Kind {
	case yaml.ScalarNode:
		return namedVolumeFromShortSyntax(mount.Value)
	case yaml.MappingNode:
		mountType := "volume"
		if typeNode := mappingValue(mount, "type"); typeNode != nil {
			mountType = strings.TrimSpace(typeNode.Value)
		}
		if mountType != "volume" {
			return "", false
		}
		source := mappingValue(mount, "source")
		if source == nil {
			return "", false
		}
		return namedVolumeSource(source.Value)
	default:
		return "", false
	}
}

func namedVolumeFromShortSyntax(mount string) (string, bool) {
	mount = strings.TrimSpace(mount)
	if mount == "" || isWindowsPath(mount) {
		return "", false
	}
	separator := strings.IndexByte(mount, ':')
	if separator < 0 {
		return "", false // container-only path: Docker creates an anonymous volume
	}
	return namedVolumeSource(mount[:separator])
}

func namedVolumeSource(source string) (string, bool) {
	source = strings.TrimSpace(source)
	if source == "" || strings.Contains(source, "$") ||
		strings.HasPrefix(source, "/") || strings.HasPrefix(source, "~") ||
		strings.HasPrefix(source, "./") || strings.HasPrefix(source, "../") ||
		strings.HasPrefix(source, ".\\") || strings.HasPrefix(source, "..\\") ||
		strings.HasPrefix(source, "\\") {
		return "", false
	}
	return source, true
}

func isWindowsPath(value string) bool {
	return len(value) >= 3 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':' && (value[2] == '\\' || value[2] == '/')
}
