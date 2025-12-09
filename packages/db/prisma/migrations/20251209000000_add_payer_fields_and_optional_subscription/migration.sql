-- AlterTable: Tornar subscription_id opcional (nullable)
-- Primeiro, remover a foreign key constraint
ALTER TABLE `subscription_payments` DROP FOREIGN KEY `subscription_payments_subscription_id_fkey`;

-- Modificar subscription_id para permitir NULL
ALTER TABLE `subscription_payments` MODIFY `subscription_id` INTEGER NULL;

-- Recriar a foreign key constraint com ON DELETE CASCADE (agora permitindo NULL)
ALTER TABLE `subscription_payments` 
  ADD CONSTRAINT `subscription_payments_subscription_id_fkey` 
  FOREIGN KEY (`subscription_id`) 
  REFERENCES `subscriptions`(`id`) 
  ON DELETE CASCADE 
  ON UPDATE CASCADE;

-- AlterTable: Adicionar campos payer_cpf e payer_email
ALTER TABLE `subscription_payments` ADD COLUMN `payer_cpf` VARCHAR(20) NULL;
ALTER TABLE `subscription_payments` ADD COLUMN `payer_email` VARCHAR(255) NULL;

-- CreateIndex: Criar índice em payer_email para buscas
CREATE INDEX `subscription_payments_payer_email_idx` ON `subscription_payments`(`payer_email`);

