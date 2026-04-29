.PHONY: help setup install lint format test build clean deploy

help:
	@echo "LivePoll - CI/CD Commands"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make setup              Install all dependencies (contracts + website)"
	@echo "  make install-stellar    Install Stellar CLI"
	@echo ""
	@echo "Development:"
	@echo "  make lint               Run all linters (Rust + JavaScript)"
	@echo "  make format             Format all code (cargo fmt + prettier)"
	@echo "  make test               Run all tests"
	@echo "  make test-contracts     Run contract tests only"
	@echo "  make test-website       Build website only"
	@echo ""
	@echo "Building:"
	@echo "  make build              Build contracts and website"
	@echo "  make build-contracts    Build Soroban contracts"
	@echo "  make build-website      Build website"
	@echo "  make prepare-contracts  Build contracts and generate TypeScript bindings"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean              Clean all build artifacts"
	@echo "  make pre-commit-setup   Install pre-commit hooks"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy-local       Deploy website locally using Vercel CLI"

# Setup targets
setup: install-stellar
	$(MAKE) install-contracts
	$(MAKE) install-website

install-stellar:
	@command -v stellar >/dev/null 2>&1 || { \
		echo "Installing Stellar CLI..."; \
		brew install stellar/tap/stellar-cli || curl https://stellar.org/releases/stellar-cli/stellar-linux-amd64 -o /tmp/stellar && chmod +x /tmp/stellar && sudo mv /tmp/stellar /usr/local/bin/; \
	}
	@echo "✓ Stellar CLI installed"

install-contracts:
	@echo "Installing Rust dependencies..."
	@cd live-poll-contract && cargo fetch
	@echo "✓ Rust dependencies installed"

install-website:
	@echo "Installing Node.js dependencies..."
	@cd live-poll-website && npm ci
	@echo "✓ Node.js dependencies installed"

# Linting targets
lint: lint-contracts lint-website
	@echo "✓ All linting passed"

lint-contracts:
	@echo "Linting contracts (Rust)..."
	@cd live-poll-contract && cargo fmt -- --check && cargo clippy --all-targets --all-features -- -D warnings
	@echo "✓ Contracts linting passed"

lint-website:
	@echo "Linting website (JavaScript)..."
	@cd live-poll-website && npm run lint
	@echo "✓ Website linting passed"

# Formatting targets
format: format-contracts format-website
	@echo "✓ All code formatted"

format-contracts:
	@echo "Formatting Rust code..."
	@cd live-poll-contract && cargo fmt --all
	@echo "✓ Rust code formatted"

format-website:
	@echo "Formatting JavaScript code..."
	@cd live-poll-website && npx eslint . --fix
	@echo "✓ JavaScript code formatted"

# Testing targets
test: test-contracts test-website
	@echo "✓ All tests passed"

test-contracts:
	@echo "Running contract tests..."
	@cd live-poll-contract && cargo test --lib
	@echo "✓ Contract tests passed"

test-website:
	@echo "Building website..."
	@cd live-poll-website && npm run build
	@echo "✓ Website build successful"

# Building targets
build: build-contracts build-website
	@echo "✓ Build complete"

build-contracts:
	@echo "Building Soroban contracts..."
	@cd live-poll-contract && stellar contract build
	@echo "✓ Contracts built"

build-website:
	@echo "Building website..."
	@cd live-poll-website && npm run build
	@echo "✓ Website built"

prepare-contracts:
	@echo "Building contracts and generating TypeScript bindings..."
	@cd live-poll-website && npm run prepare:contracts
	@echo "✓ Contracts prepared"

# Cleaning targets
clean: clean-contracts clean-website
	@echo "✓ Clean complete"

clean-contracts:
	@echo "Cleaning contract artifacts..."
	@cd live-poll-contract && cargo clean
	@echo "✓ Contract artifacts cleaned"

clean-website:
	@echo "Cleaning website artifacts..."
	@cd live-poll-website && rm -rf dist node_modules .cache
	@echo "✓ Website artifacts cleaned"

# Pre-commit hooks
pre-commit-setup:
	@command -v pre-commit >/dev/null 2>&1 || { echo "Installing pre-commit..."; pip install pre-commit; }
	@echo "Setting up pre-commit hooks..."
	@pre-commit install
	@echo "✓ Pre-commit hooks installed"

# Deployment targets
deploy-local:
	@echo "Deploying to Vercel (local)..."
	@cd live-poll-website && vercel --prod
	@echo "✓ Deployment complete"

dev-server:
	@echo "Starting development server..."
	@cd live-poll-website && npm run dev
