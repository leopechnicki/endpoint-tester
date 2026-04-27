package main

import (
	"encoding/json"
	"net/http"
)

// Simple net/http server demonstrating routes endpoint-tester can discover.
// Note: net/http HandleFunc does not encode the HTTP method — the adapter emits GET
// as the canonical placeholder; real method dispatch happens inside the handler.
// Run: go run nethttp_server.go

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/users", handleUsers)
	mux.HandleFunc("/products", handleProducts)
	mux.HandleFunc("/orders", handleOrders)

	// Also using the global http.HandleFunc (adapter must catch both forms)
	http.HandleFunc("/ping", handlePing)

	http.ListenAndServe(":8083", mux)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, []string{})
	case http.MethodPost:
		writeJSON(w, http.StatusCreated, map[string]bool{"created": true})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleProducts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []string{})
}

func handleOrders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []string{})
}

func handlePing(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"pong": "true"})
}
