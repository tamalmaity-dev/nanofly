// internal/auth/service.go — JWT + bcrypt logic
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/nanofly/nanofly/internal/db"
)

const tokenTTL = 7 * 24 * time.Hour // tokens last 7 days

// Claims is the payload we store inside the JWT token.
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// Service handles all authentication logic.
type Service struct {
	db        *db.DB
	secretKey []byte
}

// NewService creates an auth service.
func NewService(database *db.DB, secretKey string) *Service {
	return &Service{
		db:        database,
		secretKey: []byte(secretKey),
	}
}

// HashPassword hashes a plaintext password using bcrypt.
func (s *Service) HashPassword(plain string) (string, error) {
	if len(plain) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hashing password: %w", err)
	}
	return string(hash), nil
}

// CheckPassword compares a plaintext password against a bcrypt hash.
func (s *Service) CheckPassword(plain, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// GenerateToken creates a signed JWT token for a user.
func (s *Service) GenerateToken(user *db.User) (string, error) {
	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "nanofly",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secretKey)
	if err != nil {
		return "", fmt.Errorf("signing token: %w", err)
	}
	return signed, nil
}

// ValidateToken parses and validates a JWT token string.
// Returns the claims if valid, error otherwise.
func (s *Service) ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secretKey, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}

// Login verifies credentials and returns a token on success.
func (s *Service) Login(email, password string) (string, *db.User, error) {
	user, err := s.db.GetUserByEmail(email)
	if err != nil {
		return "", nil, fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return "", nil, errors.New("invalid email or password")
	}
	if !s.CheckPassword(password, user.Password) {
		return "", nil, errors.New("invalid email or password")
	}

	token, err := s.GenerateToken(user)
	if err != nil {
		return "", nil, err
	}
	return token, user, nil
}

// CreateAdminUser creates the first admin account (setup wizard).
func (s *Service) CreateAdminUser(email, name, password string) (*db.User, error) {
	// Check no admin exists already
	isFirst, err := s.db.IsFirstRun()
	if err != nil {
		return nil, err
	}
	if !isFirst {
		return nil, errors.New("setup already completed")
	}

	hash, err := s.HashPassword(password)
	if err != nil {
		return nil, err
	}

	return s.db.CreateUser(email, name, hash, "admin")
}
