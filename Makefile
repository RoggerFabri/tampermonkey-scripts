.PHONY: serve help

# Default target
help:
	@echo "Available targets:"
	@echo "  make serve    - Start HTTP server on port 8000"
	@echo "  make help     - Show this help message"

# Start the HTTP server
serve:
	@echo "Starting HTTP server on http://localhost:8000"
	@echo "Press Ctrl+C to stop the server"
	python -m http.server 8000

