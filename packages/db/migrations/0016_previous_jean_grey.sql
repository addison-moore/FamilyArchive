-- Hand-written preamble ahead of the generated DDL below.
--
-- The unique index cannot be created while duplicate live rows exist, and the
-- check-then-write race this index closes is exactly what could have produced
-- them. An index build that fails leaves `migrate` exiting non-zero and the app
-- never starting, so the duplicates are retired first. The whole file runs in
-- one transaction: if the index build fails anyway, this is rolled back too.
--
-- No bytes are lost. The oldest row of each duplicate set survives and points
-- at identical content; the rest are soft-deleted, the same state the Delete
-- button produces, with a marker in metadata saying why.
UPDATE "media_items" AS m
SET
  "deleted_at" = now(),
  "metadata" = m."metadata" || jsonb_build_object(
    'deduplicated', jsonb_build_object(
      'migration', '0016_previous_jean_grey',
      'reason', 'duplicate content in this archive; retained copy has the same hash',
      'keptMediaId', keep."keep_id"
    )
  )
FROM (
  SELECT
    "tree_id",
    "hash",
    (array_agg("id" ORDER BY "created_at", "id"))[1] AS "keep_id"
  FROM "media_items"
  WHERE "deleted_at" IS NULL AND "hash" IS NOT NULL
  GROUP BY "tree_id", "hash"
  HAVING count(*) > 1
) AS keep
WHERE m."tree_id" = keep."tree_id"
  AND m."hash" = keep."hash"
  AND m."deleted_at" IS NULL
  AND m."id" <> keep."keep_id";
--> statement-breakpoint
DROP INDEX "media_items_hash_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_tree_hash_unique" ON "media_items" USING btree ("tree_id","hash") WHERE deleted_at is null and hash is not null;--> statement-breakpoint
CREATE INDEX "collection_media_media_idx" ON "collection_media" USING btree ("media_id");
