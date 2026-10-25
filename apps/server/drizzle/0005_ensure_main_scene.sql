-- Ogni stanza deve avere la scena "main": le stanze create prima delle scene la ricevono dalla
-- 0004, ma un database che ha applicato quella migrazione prima che avesse l'INSERT (es. un
-- database di sviluppo) ne è rimasto senza, e senza la scena i client non riescono a connettersi.
-- Idempotente: non tocca le stanze che ce l'hanno già.
INSERT INTO `scenes` (`room_id`, `id`, `name`, `position`, `created_at`)
SELECT `id`, 'main', 'Scena 1', 0, `created_at` FROM `rooms`
WHERE NOT EXISTS (
  SELECT 1 FROM `scenes` WHERE `scenes`.`room_id` = `rooms`.`id` AND `scenes`.`id` = 'main'
);
