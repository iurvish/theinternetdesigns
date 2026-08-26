CREATE TABLE "media_copies" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"post_id" text,
	"kind" "media_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_copies" ADD CONSTRAINT "media_copies_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_copies" ADD CONSTRAINT "media_copies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_copies_created_idx" ON "media_copies" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "media_copies_media_idx" ON "media_copies" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "media_copies_post_idx" ON "media_copies" USING btree ("post_id");
