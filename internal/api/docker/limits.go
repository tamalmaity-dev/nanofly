package docker

// ResourceTier defines the memory and CPU constraints for a Docker container.
type ResourceTier struct {
	Name       string
	Memory     int64 // bytes
	MemorySwap int64 // bytes (same as Memory = no swap)
	CPUQuota   int64 // microseconds per 100ms period
	CPUPeriod  int64 // default 100000 (100ms)
}

// DefaultTiers contains the predefined resource plans for NanoFly services.
var DefaultTiers = map[string]ResourceTier{
	"nano": {
		Name:       "Nano",
		Memory:     64 * 1024 * 1024, // 64MB
		MemorySwap: 64 * 1024 * 1024,
		CPUQuota:   20000, // 20% of 1 core
		CPUPeriod:  100000,
	},
	"micro": {
		Name:       "Micro",
		Memory:     256 * 1024 * 1024, // 256MB
		MemorySwap: 256 * 1024 * 1024,
		CPUQuota:   50000, // 50% of 1 core
		CPUPeriod:  100000,
	},
	"standard": {
		Name:       "Standard",
		Memory:     512 * 1024 * 1024, // 512MB
		MemorySwap: 512 * 1024 * 1024,
		CPUQuota:   100000, // 100% of 1 core
		CPUPeriod:  100000,
	},
	"large": {
		Name:       "Large",
		Memory:     1024 * 1024 * 1024, // 1GB
		MemorySwap: 1024 * 1024 * 1024,
		CPUQuota:   200000, // 200% (2 cores)
		CPUPeriod:  100000,
	},
	"unlimited": {
		Name:       "Unlimited",
		Memory:     0, // 0 = no limit in Docker SDK
		MemorySwap: 0,
		CPUQuota:   0,
		CPUPeriod:  0,
	},
}

// GetTier returns the requested resource tier, falling back to "micro" if not found.
func GetTier(name string) ResourceTier {
	if tier, ok := DefaultTiers[name]; ok {
		return tier
	}
	return DefaultTiers["micro"] // safe fallback
}

// GetTierWithCustom returns a resource tier with optional custom memory and CPU overrides.
// customMemory: Memory limit in bytes (0 = use tier default)
// customCPU: CPU limit (0.5 = 50% of 1 core, 2.0 = 2 full cores) (0 = use tier default)
func GetTierWithCustom(name string, customMemory int64, customCPU float64) ResourceTier {
	tier := GetTier(name)

	// Apply custom memory if specified
	if customMemory > 0 {
		tier.Memory = customMemory
		tier.MemorySwap = customMemory
	}

	// Apply custom CPU if specified
	if customCPU > 0 {
		tier.CPUQuota = int64(customCPU * 100000) // Convert to microseconds per 100ms period
		tier.CPUPeriod = 100000
	}

	return tier
}
