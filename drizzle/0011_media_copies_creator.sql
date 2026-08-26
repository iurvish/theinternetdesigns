ALTER TABLE "media_copies" ADD COLUMN "creator_id" text;--> statement-breakpoint
UPDATE "media_copies" AS mc SET "creator_id" = p."creator_id" FROM "posts" AS p WHERE p."id" = mc."post_id";--> statement-breakpoint
DELETE FROM "media_copies" WHERE "creator_id" IS NULL OR "post_id" IS NULL;--> statement-breakpoint
ALTER TABLE "media_copies" ALTER COLUMN "creator_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_copies" ALTER COLUMN "post_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_copies" ADD CONSTRAINT "media_copies_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_copies_creator_idx" ON "media_copies" USING btree ("creator_id");
