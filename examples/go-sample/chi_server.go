package main

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// Simple Chi server demonstrating routes endpoint-tester can discover.
// Note: Chi uses title-case methods (Get, Post, etc.) and {param} path params.
// Run: go run chi_server.go

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)

	// Basic routes
	r.Get("/health", healthCheckHandler)
	r.Get("/users", listUsersHandler)
	r.Post("/users", createUserHandler)

	// Path parameter routes — Chi uses {param} syntax
	r.Get("/users/{id}", getUserHandler)
	r.Put("/users/{id}", updateUserHandler)
	r.Delete("/users/{id}", deleteUserHandler)

	// Nested path params
	r.Get("/users/{userId}/posts/{postId}", getUserPostHandler)

	http.ListenAndServe(":8082", r)
}

func respond(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{"status": "ok"})
}
func listUsersHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, []string{})
}
func createUserHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusCreated, map[string]bool{"created": true})
}
func getUserHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{"id": chi.URLParam(r, "id")})
}
func updateUserHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]bool{"updated": true})
}
func deleteUserHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]bool{"deleted": true})
}
func getUserPostHandler(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]string{
		"userId": chi.URLParam(r, "userId"),
		"postId": chi.URLParam(r, "postId"),
	})
}
