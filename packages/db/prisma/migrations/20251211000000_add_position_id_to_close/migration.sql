-- Adicionar campo position_id_to_close na tabela trade_jobs
ALTER TABLE `trade_jobs` 
  ADD COLUMN `position_id_to_close` INTEGER NULL;

-- Criar índice para melhorar performance de buscas
CREATE INDEX `trade_jobs_position_id_to_close_idx` ON `trade_jobs`(`position_id_to_close`);

-- Adicionar foreign key constraint
ALTER TABLE `trade_jobs` 
  ADD CONSTRAINT `trade_jobs_position_id_to_close_fkey` 
  FOREIGN KEY (`position_id_to_close`) 
  REFERENCES `trade_positions`(`id`) 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

