-- Script para verificar o nome da constraint antes de executar a migration
-- Execute este script primeiro para descobrir o nome exato da constraint

SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM 
    information_schema.KEY_COLUMN_USAGE
WHERE 
    TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'subscription_payments'
    AND COLUMN_NAME = 'subscription_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL;

