package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Simple Gin server demonstrating routes endpoint-tester can discover.
// Run: go run gin_server.go

func main() {
	r := gin.Default()

	// Basic routes
	r.GET("/health", HealthCheck)
	r.GET("/users", ListUsers)
	r.POST("/users", CreateUser)

	// Path parameter routes
	r.GET("/users/:id", GetUser)
	r.PUT("/users/:id", UpdateUser)
	r.DELETE("/users/:id", DeleteUser)

	// Group example — endpoint-tester must resolve /api/v1/products/:id
	v1 := r.Group("/api/v1")
	v1.GET("/products", ListProducts)
	v1.POST("/products", CreateProduct)
	v1.GET("/products/:id", GetProduct)
	v1.DELETE("/products/:id", DeleteProduct)

	r.Run(":8080")
}

func HealthCheck(c *gin.Context)   { c.JSON(http.StatusOK, gin.H{"status": "ok"}) }
func ListUsers(c *gin.Context)     { c.JSON(http.StatusOK, gin.H{"users": []string{}}) }
func CreateUser(c *gin.Context)    { c.JSON(http.StatusCreated, gin.H{"created": true}) }
func GetUser(c *gin.Context)       { c.JSON(http.StatusOK, gin.H{"id": c.Param("id")}) }
func UpdateUser(c *gin.Context)    { c.JSON(http.StatusOK, gin.H{"updated": true}) }
func DeleteUser(c *gin.Context)    { c.JSON(http.StatusOK, gin.H{"deleted": true}) }
func ListProducts(c *gin.Context)  { c.JSON(http.StatusOK, gin.H{"products": []string{}}) }
func CreateProduct(c *gin.Context) { c.JSON(http.StatusCreated, gin.H{"created": true}) }
func GetProduct(c *gin.Context)    { c.JSON(http.StatusOK, gin.H{"id": c.Param("id")}) }
func DeleteProduct(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"deleted": true}) }
