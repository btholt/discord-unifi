#!/bin/bash

# Release script for Unifi Discord Bridge
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get the release type
RELEASE_TYPE=${1:-patch}

if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid release type. Use: patch, minor, or major"
    exit 1
fi

print_status "Starting release process for type: $RELEASE_TYPE"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Calculate new version
NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
print_status "New version: $NEW_VERSION"

# Update package.json version
print_status "Updated package.json to version $NEW_VERSION"

# Create commit for version bump
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create and push tag
print_status "Creating git tag v$NEW_VERSION"
git tag "v$NEW_VERSION"

print_status "Pushing changes to remote..."
git push origin main
git push origin "v$NEW_VERSION"

print_success "Release $NEW_VERSION created successfully!"
print_status "GitHub Actions will now build and publish the Docker image"
print_status "Check the Actions tab in your GitHub repository for progress"

# Show next steps
echo ""
print_status "Next steps:"
echo "1. Wait for GitHub Actions to complete"
echo "2. Check the release at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/')/releases"
echo "3. Pull the new image: docker pull ghcr.io/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/'):latest" 