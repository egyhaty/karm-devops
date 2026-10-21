-- Extend the existing constraint without rewriting users or progress rows.
ALTER TABLE learning_progress DROP CONSTRAINT learning_progress_lesson_id;
ALTER TABLE learning_progress ADD CONSTRAINT learning_progress_lesson_id
CHECK (lesson_id ~ '^(lesson-(0[1-9]|1[0-3])|docker|git|network-policy|(aws|azure)-0[1-7])$');
