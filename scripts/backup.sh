#!/bin/bash

# Backup Script for P2P Call App
# This script creates backups of important data

set -e

BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="p2p_call_backup_$TIMESTAMP"

echo "💾 Creating backup: $BACKUP_NAME"
echo "================================"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create backup archive
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='backups' \
    --exclude='ssl' \
    .

echo "✅ Backup created: $BACKUP_DIR/$BACKUP_NAME.tar.gz"

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)
echo "📊 Backup size: $BACKUP_SIZE"

# List recent backups
echo ""
echo "📋 Recent backups:"
ls -lh $BACKUP_DIR/*.tar.gz 2>/dev/null | tail -5 || echo "No previous backups found"

echo ""
echo "🔄 To restore from backup:"
echo "   tar -xzf $BACKUP_DIR/$BACKUP_NAME.tar.gz"

