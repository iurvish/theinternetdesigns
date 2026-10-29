CREATE TABLE IF NOT EXISTS "jev_classifications" (
	"post_id" text PRIMARY KEY NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_ui" boolean NOT NULL,
	"is_ui_probability" integer DEFAULT 0 NOT NULL,
	"category_slug" varchar(100),
	"style_slug" varchar(100),
	"industry_slug" varchar(100),
	"element_slug" varchar(100),
	"applied" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" varchar(80) DEFAULT 'typesafe-ai/jev' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jev_classifications" ADD CONSTRAINT "jev_classifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
