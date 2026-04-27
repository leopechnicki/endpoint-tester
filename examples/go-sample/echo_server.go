package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// Simple Echo server demonstrating routes endpoint-tester can discover.
// Run: go run echo_server.go

func main() {
	e := echo.New()

	// Basic routes
	e.GET("/health", healthCheck)
	e.GET("/users", listUsers)
	e.POST("/users", createUser)

	// Path parameter routes
	e.GET("/users/:id", getUser)
	e.PUT("/users/:id", updateUser)
	e.DELETE("/users/:id", deleteUser)

	// Group example — endpoint-tester must resolve /api/orders/:id
	g := e.Group("/api")
	g.GET("/orders", listOrders)
	g.POST("/orders", createOrder)
	g.GET("/orders/:id", getOrder)
	g.DELETE("/orders/:id", deleteOrder)

	e.Start(":8081")
}

func healthCheck(c echo.Context) error  { return c.JSON(http.StatusOK, map[string]string{"status": "ok"}) }
func listUsers(c echo.Context) error    { return c.JSON(http.StatusOK, []string{}) }
func createUser(c echo.Context) error   { return c.JSON(http.StatusCreated, map[string]bool{"created": true}) }
func getUser(c echo.Context) error      { return c.JSON(http.StatusOK, map[string]string{"id": c.Param("id")}) }
func updateUser(c echo.Context) error   { return c.JSON(http.StatusOK, map[string]bool{"updated": true}) }
func deleteUser(c echo.Context) error   { return c.JSON(http.StatusOK, map[string]bool{"deleted": true}) }
func listOrders(c echo.Context) error   { return c.JSON(http.StatusOK, []string{}) }
func createOrder(c echo.Context) error  { return c.JSON(http.StatusCreated, map[string]bool{"created": true}) }
func getOrder(c echo.Context) error     { return c.JSON(http.StatusOK, map[string]string{"id": c.Param("id")}) }
func deleteOrder(c echo.Context) error  { return c.JSON(http.StatusOK, map[string]bool{"deleted": true}) }
