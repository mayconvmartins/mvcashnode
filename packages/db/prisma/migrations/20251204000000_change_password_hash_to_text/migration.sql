-- AlterTable: Change password_hash from VARCHAR(255) to TEXT
-- This prevents any potential truncation issues with bcrypt hashes
-- Bcrypt hashes are typically 60 characters, but using TEXT ensures no issues
ALTER TABLE `users` MODIFY COLUMN `password_hash` TEXT NOT NULL;

